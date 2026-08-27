import { createClient } from './supabase-client'

const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10 MB

const ALLOWED_MIME_TYPES: Record<string, string[]> = {
  images: ['image/jpeg', 'image/png', 'image/webp', 'image/gif'],
  documents: ['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
  videos: ['video/mp4', 'video/webm'],
  general: [],
}

const ALLOWED_EXTENSIONS: Record<string, string[]> = {
  images: ['jpg', 'jpeg', 'png', 'webp', 'gif'],
  documents: ['pdf', 'doc', 'docx'],
  videos: ['mp4', 'webm'],
}

interface UploadOptions {
  bucket: string
  path: string
  file: File
  allowedTypes?: string[]
  maxSize?: number
}

interface UploadResult {
  url: string | null
  error: string | null
}

function getMimeCategory(mimeType: string): string {
  if (mimeType.startsWith('image/')) return 'images'
  if (mimeType.startsWith('video/')) return 'videos'
  if (mimeType === 'application/pdf' || mimeType.includes('document')) return 'documents'
  return 'general'
}

function friendlyUploadError(message: string): string {
  const m = message.toLowerCase()
  if (m.includes('row-level security') || m.includes('policy')) {
    return 'Upload gagal: izin belum tersedia. Coba lagi sebentar atau hubungi admin.'
  }
  if (m.includes('bucket') && m.includes('not found')) {
    return 'Penyimpanan file tidak tersedia. Hubungi admin.'
  }
  return message
}

export async function uploadFile(
  bucket: string,
  path: string,
  file: File
): Promise<string | null> {
  return uploadFileWithOptions({ bucket, path, file }).then(r => r.url)
}

export async function uploadFileWithOptions({
  bucket,
  path,
  file,
  allowedTypes,
  maxSize = MAX_FILE_SIZE,
}: UploadOptions): Promise<UploadResult> {
  try {
    // Validate file size
    if (file.size > maxSize) {
      const sizeMB = (maxSize / (1024 * 1024)).toFixed(0)
      return { url: null, error: `File terlalu besar. Maksimum ${sizeMB} MB.` }
    }

    // Validate file type + extension (defense in depth, SVG blocked)
    const category = getMimeCategory(file.type)
    const types = allowedTypes ?? ALLOWED_MIME_TYPES[category] ?? []
    if (file.type === 'image/svg+xml') {
      return { url: null, error: 'Tipe file SVG tidak diizinkan karena risiko XSS.' }
    }
    if (types.length > 0 && !types.includes(file.type)) {
      return { url: null, error: `Tipe file ${file.type} tidak diizinkan. Gunakan: ${types.join(', ')}` }
    }
    // Also validate extension matches allowed list for category (prevent mime spoof by extension)
    const ext = (file.name.split('.').pop() || '').toLowerCase()
    const allowedExts = ALLOWED_EXTENSIONS[category]
    if (allowedExts && ext && !allowedExts.includes(ext)) {
      // If category is known and ext not allowed, block (unless allowedTypes explicitly overrides)
      if (!allowedTypes) {
        return { url: null, error: `Ekstensi .${ext} tidak diizinkan.` }
      }
    }

    // Sanitize path: remove .. and ensure no duplicate slashes
    const sanitizedPath = path.replace(/\.\./g, '').replace(/\/\//g, '/').replace(/^\/+/, '')

    const supabase = createClient()
    const { data, error } = await supabase.storage
      .from(bucket)
      .upload(sanitizedPath, file, { upsert: false })

    if (error) {
      return { url: null, error: friendlyUploadError(error.message) }
    }

    const { data: urlData } = supabase.storage
      .from(bucket)
      .getPublicUrl(data.path)

    return { url: urlData?.publicUrl ?? null, error: null }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Upload gagal karena kesalahan yang tidak diketahui'
    console.error('[upload] Error:', message)
    return { url: null, error: message }
  }
}
