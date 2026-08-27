import { createServerSupabaseClient } from '@/lib/supabase-server'
import { NextResponse } from 'next/server'
import { decrypt } from '@/lib/drive-crypto'

async function getAccessToken(refreshTokenEncrypted: string): Promise<string | null> {
  const clientId = process.env.GOOGLE_CLIENT_ID
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET
  if (!clientId || !clientSecret) return null
  const refreshToken = decrypt(refreshTokenEncrypted)
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  })
  if (!res.ok) return null
  const data = (await res.json()) as { access_token?: string }
  return data.access_token ?? null
}

export async function POST(req: Request) {
  try {
    const supabase = await createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data: tokenRow } = await supabase
      .from('user_drive_tokens')
      .select('encrypted_refresh_token, drive_email')
      .eq('user_id', user.id)
      .maybeSingle()

    if (!tokenRow) {
      return NextResponse.json({ error: 'Drive not connected', fallback: true }, { status: 400 })
    }

    const accessToken = await getAccessToken(tokenRow.encrypted_refresh_token)
    if (!accessToken) return NextResponse.json({ error: 'Token refresh failed' }, { status: 502 })

    const contentType = req.headers.get('content-type') || ''
    if (!contentType.includes('multipart/form-data') && !contentType.includes('audio/') && !contentType.includes('application/json')) {
      return NextResponse.json({ error: 'Unsupported content type' }, { status: 400 })
    }

    // Accept FormData with audio file, or raw audio body
    let audioBuffer: Buffer
    let mimeType = 'audio/webm'
    let activityId: string | null = null

    if (contentType.includes('multipart/form-data')) {
      const form = await req.formData()
      const file = form.get('audio') as File | null
      if (!file) return NextResponse.json({ error: 'audio file required' }, { status: 400 })
      if (file.size > 5 * 1024 * 1024) return NextResponse.json({ error: 'Audio too large (max 5MB)' }, { status: 400 })
      audioBuffer = Buffer.from(await file.arrayBuffer())
      mimeType = file.type || 'audio/webm'
      activityId = (form.get('activityId') as string) || null
    } else if (contentType.includes('application/json')) {
      const { audioBase64, mimeType: mt, activityId: aid } = await req.json()
      if (!audioBase64) return NextResponse.json({ error: 'audioBase64 required' }, { status: 400 })
      const buf = Buffer.from(String(audioBase64), 'base64')
      if (buf.length > 5 * 1024 * 1024) return NextResponse.json({ error: 'Audio too large (max 5MB)' }, { status: 400 })
      audioBuffer = buf
      mimeType = mt || 'audio/webm'
      activityId = aid || null
    } else {
      const buf = Buffer.from(await req.arrayBuffer())
      if (buf.length > 5 * 1024 * 1024) return NextResponse.json({ error: 'Audio too large (max 5MB)' }, { status: 400 })
      audioBuffer = buf
    }

    // Ensure folder "Lexora" in Drive (find or create)
    const boundary = 'lexora' + crypto.randomUUID().replace(/-/g, '')
    const folderName = 'Lexora'
    const q = encodeURIComponent(`name='${folderName}' and mimeType='application/vnd.google-apps.folder' and trashed=false`)
    const searchRes = await fetch(`https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id,name)`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
    let folderId: string | null = null
    if (searchRes.ok) {
      const search = (await searchRes.json()) as { files?: { id: string; name: string }[] }
      folderId = search.files?.[0]?.id ?? null
    }
    if (!folderId) {
      const createFolderRes = await fetch('https://www.googleapis.com/drive/v3/files', {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: folderName, mimeType: 'application/vnd.google-apps.folder' }),
      })
      if (createFolderRes.ok) {
        const folder = (await createFolderRes.json()) as { id?: string }
        folderId = folder.id ?? null
      }
    }

    // Upload file to Drive (multipart upload)
    const fileName = `lexora-${Date.now()}.webm`
    const metadata = JSON.stringify({ name: fileName, ...(folderId ? { parents: [folderId] } : {}), mimeType })
    const body = Buffer.concat([
      Buffer.from(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n`),
      Buffer.from(`--${boundary}\r\nContent-Type: ${mimeType}\r\n\r\n`),
      audioBuffer,
      Buffer.from(`\r\n--${boundary}--`),
    ])

    const uploadRes = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,webViewLink', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': `multipart/related; boundary=${boundary}`,
      },
      body,
    })

    if (!uploadRes.ok) {
      const errText = await uploadRes.text().catch(() => '')
      console.error('[drive/upload] failed', uploadRes.status, errText.slice(0, 200))
      return NextResponse.json({ error: 'Drive upload failed' }, { status: 502 })
    }

    const uploaded = (await uploadRes.json()) as { id?: string; webViewLink?: string }

    // Insert record in audio_recordings (text + link only, hemat Supabase)
    const { data: inserted, error: insertErr } = await supabase
      .from('audio_recordings')
      .insert({
        user_id: user.id,
        activity_id: activityId,
        drive_file_id: uploaded.id,
        drive_link: uploaded.webViewLink,
        duration_ms: null,
        is_temp: false,
      })
      .select('id')
      .single()

    if (insertErr) {
      console.error('[drive/upload] db insert failed', insertErr.message)
      // Still return drive link since file uploaded successfully
    }

    return NextResponse.json({
      success: true,
      recording_id: inserted?.id ?? null,
      drive_file_id: uploaded.id,
      drive_link: uploaded.webViewLink,
    })
  } catch (e) {
    console.error('[drive/upload] error', e)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
