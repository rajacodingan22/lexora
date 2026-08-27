'use client'

import { useRef, useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase-client'
import { Loader2, Upload, ImageIcon, X } from 'lucide-react'
import { useI18n } from '@/lib/i18n/client'

interface ImageUploadProps {
  bucket: string
  pathPrefix: string
  value: string | null
  onUpload: (url: string) => void
  onRemove?: () => void
  accept?: string
  maxSizeMB?: number
  className?: string
}

function friendlyUploadError(
  message: string,
  t: (key: string, vars?: Record<string, string | number>) => string
): string {
  const m = message.toLowerCase()
  if (m.includes('row-level security') || m.includes('policy')) {
    return t('ui2.upload.rlsError')
  }
  if (m.includes('bucket') && m.includes('not found')) {
    return t('ui2.upload.bucketError')
  }
  if (m.includes('too large') || m.includes('maximum')) {
    return t('ui2.upload.tooLargeError')
  }
  return message
}

export function ImageUpload({
  bucket,
  pathPrefix,
  value,
  onUpload,
  onRemove,
  accept = 'image/*',
  maxSizeMB = 5,
  className = '',
}: ImageUploadProps) {
  const supabase = createClient()
  const { t } = useI18n()
  const inputRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')
  const [storageSettings, setStorageSettings] = useState<{ maxSizeMB: number; allowedTypes: string | null } | null>(null)

  useEffect(() => {
    ;(async () => {
      try {
        const { data } = await supabase.from('system_settings').select('key, value')
        if (!data) return
        const map: Record<string, string> = {}
        for (const row of data) map[row.key] = String(row.value ?? '')
        const maxMb = Number(map.storage_max_upload_size_mb)
        const allowed = map.storage_allowed_file_types?.trim() || null
        setStorageSettings({ maxSizeMB: maxMb > 0 ? maxMb : 5, allowedTypes: allowed })
      } catch {
        // settings unavailable — fall back to props
      }
    })()
  }, [supabase])

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setError('')

    const effectiveMax = storageSettings?.maxSizeMB ?? maxSizeMB
    if (file.size > effectiveMax * 1024 * 1024) {
      setError(t('ui2.upload.sizeError', { size: effectiveMax }))
      return
    }

    const allowedTypes = storageSettings?.allowedTypes || null
    if (allowedTypes) {
      const allowed = allowedTypes.split(',').map((t) => t.trim().toLowerCase()).filter(Boolean)
      const matches = allowed.some((t) =>
        t === file.type.toLowerCase() || (t.startsWith('.') && file.name.toLowerCase().endsWith(t))
      )
      if (!matches) {
        setError(t('ui2.upload.typeError', { types: allowed.join(', ') }))
        return
      }
    }

    if (file.type === 'image/svg+xml') {
      setError('Tipe file SVG tidak diizinkan.')
      return
    }
    setUploading(true)
    const rawExt = (file.name.split('.').pop() || '').toLowerCase().replace(/[^a-z0-9]/g, '')
    const safeExt = rawExt && ['jpg','jpeg','png','webp','gif','pdf','doc','docx','mp4','webm'].includes(rawExt) ? rawExt : 'jpg'
    const safePrefix = pathPrefix.replace(/\.\./g, '').replace(/\/\//g, '/').replace(/^\/+/, '')
    const filePath = `${safePrefix}/${Date.now()}.${safeExt}`
    const { error: uploadError } = await supabase.storage.from(bucket).upload(filePath, file, { upsert: false })

    if (uploadError) {
      setUploading(false)
      setError(friendlyUploadError(uploadError.message, t))
      return
    }

    const { data: { publicUrl } } = supabase.storage.from(bucket).getPublicUrl(filePath)
    onUpload(publicUrl)
    setUploading(false)
  }

  return (
    <div className={`flex items-center gap-3 ${className}`}>
      <div className="relative shrink-0">
        {value ? (
          <div className="relative group">
            <img src={value} alt="" className="h-20 w-20 rounded-lg object-cover border border-border" />
            {onRemove && (
              <button
                type="button"
                onClick={onRemove}
                className="absolute -top-1.5 -right-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-destructive text-white shadow"
              >
                <X className="h-3 w-3" />
              </button>
            )}
          </div>
        ) : (
          <div className="flex h-20 w-20 items-center justify-center rounded-lg border-2 border-dashed border-border bg-surface-container-low text-muted">
            <ImageIcon className="h-6 w-6" />
          </div>
        )}
      </div>
      <div className="space-y-1">
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
          className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-sm font-medium text-on-surface hover:bg-surface-hover transition-colors disabled:opacity-50"
        >
          {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
          {uploading ? t('ui2.upload.uploading') : t('ui2.upload.uploadImage')}
        </button>
        <p className="text-[10px] text-muted">
          {t('ui2.upload.maxLabel', { size: storageSettings?.maxSizeMB ?? maxSizeMB })}
        </p>
      </div>
      {error && <p className="text-[10px] text-destructive">{error}</p>}
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        className="hidden"
        onChange={handleFile}
      />
    </div>
  )
}