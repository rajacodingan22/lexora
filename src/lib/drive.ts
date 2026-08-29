import { decrypt } from '@/lib/drive-crypto'

export const DRIVE_MAX_BYTES = 5 * 1024 * 1024

export function assertAudioSize(buf: Buffer) {
  if (buf.length > DRIVE_MAX_BYTES) throw new Error('Audio too large (max 5MB)')
}

export async function getAccessToken(refreshTokenEncrypted: string): Promise<string | null> {
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

export async function ensureLexoraFolder(accessToken: string): Promise<string | null> {
  const q = encodeURIComponent(`name='Lexora' and mimeType='application/vnd.google-apps.folder' and trashed=false`)
  const searchRes = await fetch(`https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id,name)`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  if (searchRes.ok) {
    const search = (await searchRes.json()) as { files?: { id: string }[] }
    if (search.files?.[0]?.id) return search.files[0].id
  }
  const createRes = await fetch('https://www.googleapis.com/drive/v3/files', {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Lexora', mimeType: 'application/vnd.google-apps.folder' }),
  })
  if (createRes.ok) {
    const f = (await createRes.json()) as { id?: string }
    return f.id ?? null
  }
  return null
}

export async function uploadToDrive(
  accessToken: string,
  audioBuffer: Buffer,
  mimeType: string,
  fileName: string,
): Promise<{ drive_file_id: string | null; drive_link: string | null }> {
  const folderId = await ensureLexoraFolder(accessToken)
  const boundary = 'lexora' + crypto.randomUUID().replace(/-/g, '')
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
  if (!uploadRes.ok) return { drive_file_id: null, drive_link: null }
  const uploaded = (await uploadRes.json()) as { id?: string; webViewLink?: string }
  return { drive_file_id: uploaded.id ?? null, drive_link: uploaded.webViewLink ?? null }
}
