import { createClient } from './supabase-client'

const PUBLIC_PREFIX = '/storage/v1/object/public/'

/**
 * Mengubah file_url (public URL lama) atau path relatif menjadi path storage.
 * Contoh: https://xxx.supabase.co/storage/v1/object/public/submissions/a/b.png -> submissions/a/b.png
 */
export function fileUrlToPath(fileUrl: string | null | undefined): string | null {
  if (!fileUrl) return null
  const clean = fileUrl.split('?')[0]
  const idx = clean.indexOf(PUBLIC_PREFIX)
  if (idx >= 0) {
    const path = clean.slice(idx + PUBLIC_PREFIX.length)
    return decodeURIComponent(path) || null
  }
  return clean
}

/**
 * Signed URL untuk bucket privat. Masa berlaku default 1 jam.
 */
export async function getSignedUrl(fileUrl: string | null | undefined, expiresIn = 3600): Promise<string | null> {
  const path = fileUrlToPath(fileUrl)
  if (!path) return null
  const bucket = path.split('/')[0]
  const objectPath = path.split('/').slice(1).join('/')
  const supabase = createClient()
  const { data, error } = await supabase.storage
    .from(bucket)
    .createSignedUrl(objectPath, expiresIn)
  if (error) {
    console.error('Failed to create signed URL:', error)
    return null
  }
  return data?.signedUrl || null
}
