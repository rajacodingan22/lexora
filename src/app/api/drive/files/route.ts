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
    body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, refresh_token: refreshToken, grant_type: 'refresh_token' }),
  })
  if (!res.ok) return null
  const data = (await res.json()) as { access_token?: string }
  return data.access_token ?? null
}

export async function GET() {
  try {
    const supabase = await createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data: tokenRow } = await supabase
      .from('user_drive_tokens')
      .select('encrypted_refresh_token')
      .eq('user_id', user.id)
      .maybeSingle()

    if (!tokenRow) return NextResponse.json({ error: 'Drive not connected' }, { status: 400 })

    const accessToken = await getAccessToken(tokenRow.encrypted_refresh_token)
    if (!accessToken) return NextResponse.json({ error: 'Token refresh failed' }, { status: 502 })

    // Find Lexora folder
    const q = encodeURIComponent(`name='Lexora' and mimeType='application/vnd.google-apps.folder' and trashed=false`)
    const folderRes = await fetch(`https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id)`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    })

    if (!folderRes.ok) return NextResponse.json({ files: [] })

    const folderData = (await folderRes.json()) as { files?: { id: string }[] }
    const folderId = folderData.files?.[0]?.id

    if (!folderId) return NextResponse.json({ files: [] })

    // List files in folder
    const filesQ = encodeURIComponent(`'${folderId}' in parents and trashed=false`)
    const filesRes = await fetch(
      `https://www.googleapis.com/drive/v3/files?q=${filesQ}&fields=files(id,name,mimeType,size,createdTime,webViewLink,thumbnailLink)&orderBy=name&pageSize=100`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    )

    if (!filesRes.ok) return NextResponse.json({ error: 'Failed to list files' }, { status: 502 })

    const filesData = (await filesRes.json()) as { files?: any[] }
    return NextResponse.json({ files: filesData.files || [] })
  } catch (e) {
    console.error('[drive/files] error', e)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
