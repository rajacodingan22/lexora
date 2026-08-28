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

export async function GET(req: Request, { params }: { params: Promise<{ fileId: string }> }) {
  try {
    const supabase = await createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return new NextResponse('Unauthorized', { status: 401 })

    const { fileId } = await params

    const { data: tokenRow } = await supabase
      .from('user_drive_tokens')
      .select('encrypted_refresh_token')
      .eq('user_id', user.id)
      .maybeSingle()

    if (!tokenRow) return new NextResponse('Drive not connected', { status: 400 })

    const accessToken = await getAccessToken(tokenRow.encrypted_refresh_token)
    if (!accessToken) return new NextResponse('Token refresh failed', { status: 502 })

    // Get file metadata for content type
    const metaRes = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?fields=mimeType,name`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    })

    if (!metaRes.ok) return new NextResponse('File not found', { status: 404 })
    const meta = (await metaRes.json()) as { mimeType: string; name: string }

    // Stream file content
    const fileRes = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    })

    if (!fileRes.ok) return new NextResponse('Failed to fetch file', { status: 502 })

    const headers = new Headers()
    headers.set('Content-Type', meta.mimeType)
    headers.set('Content-Disposition', `inline; filename="${meta.name}"`)
    headers.set('Cache-Control', 'public, max-age=3600')

    return new NextResponse(fileRes.body, { status: 200, headers })
  } catch (e) {
    console.error('[drive/file-content] error', e)
    return new NextResponse('Internal error', { status: 500 })
  }
}
