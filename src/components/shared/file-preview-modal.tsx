'use client'

import { useState } from 'react'
import { Download, X } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { useI18n } from '@/lib/i18n/client'

export function isImageUrl(url: string | null | undefined): boolean {
  if (!url) return false
  return /\.(jpe?g|png|gif|webp|svg|avif|bmp)(\?.*)?$/i.test(url)
}

export default function FilePreviewModal({
  url,
  title,
  onClose,
}: {
  url: string | null
  title?: string
  onClose: () => void
}) {
  const [downloading, setDownloading] = useState(false)
  const { t } = useI18n()

  if (!url) return null

  const fileUrl = url
  const isImage = isImageUrl(fileUrl)

  async function handleDownload() {
    setDownloading(true)
    try {
      const res = await fetch(fileUrl)
      const blob = await res.blob()
      const ext = fileUrl.split('?')[0].split('.').pop()?.toLowerCase() || 'file'
      const baseName = (title || 'file').replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '-') || 'file'
      const objectUrl = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = objectUrl
      a.download = `${baseName}.${ext}`
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(objectUrl)
    } catch {
      window.open(fileUrl, '_blank')
    }
    setDownloading(false)
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-3xl overflow-hidden rounded-2xl bg-surface shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <p className="truncate text-sm font-medium text-on-surface">{title || 'Preview'}</p>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="sm" onClick={handleDownload} disabled={downloading} aria-label={t('ui2.preview.download')}>
              <Download className="size-4" />
            </Button>
            <Button variant="ghost" size="sm" onClick={onClose}>
              <X className="size-4" />
            </Button>
          </div>
        </div>
        <div className="flex max-h-[75vh] items-center justify-center overflow-auto bg-black/40 p-4">
          {isImage ? (
            <img
              src={fileUrl}
              alt={title || 'Preview'}
              className="max-h-full w-auto rounded-lg object-contain"
            />
          ) : (
            <iframe
              src={fileUrl}
              title={title || 'Preview'}
              className="h-[70vh] w-full rounded-lg bg-white"
            />
          )}
        </div>
      </div>
    </div>
  )
}
