'use client'

import { X, Download } from 'lucide-react'

interface DriveFile {
  id: string
  name: string
  mimeType: string
  size: string
  webViewLink: string
}

export function DriveFilePreview({ file, onClose }: { file: DriveFile; onClose: () => void }) {
  const isAudio = file.mimeType.startsWith('audio/')
  const isImage = file.mimeType.startsWith('image/')
  const isPdf = file.mimeType === 'application/pdf'

  // Build content URL via our proxy
  const contentUrl = `/api/drive/file-content/${file.id}`

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={onClose}>
      <div className="max-h-[85vh] w-full max-w-2xl overflow-hidden rounded-2xl bg-slate-900 shadow-2xl" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
          <p className="text-sm font-medium text-white truncate">{file.name}</p>
          <div className="flex items-center gap-2">
            <a href={contentUrl} download className="text-white/40 hover:text-white">
              <Download className="h-4 w-4" />
            </a>
            <button onClick={onClose} className="text-white/40 hover:text-white">
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex items-center justify-center p-4" style={{ minHeight: '300px' }}>
          {isAudio && (
            <audio controls src={contentUrl} className="w-full max-w-md">
              Browser tidak mendukung audio player.
            </audio>
          )}
          {isImage && (
            <img src={contentUrl} alt={file.name} className="max-h-[60vh] max-w-full rounded-lg object-contain" />
          )}
          {isPdf && (
            <iframe src={contentUrl} className="h-[60vh] w-full rounded-lg border-0" title={file.name} />
          )}
          {!isAudio && !isImage && !isPdf && (
            <div className="text-center">
              <p className="text-sm text-white/40">Preview tidak tersedia untuk tipe file ini.</p>
              <a href={file.webViewLink} target="_blank" rel="noopener noreferrer" className="mt-2 inline-block text-sm text-indigo-400 hover:text-indigo-300">
                Buka di Google Drive
              </a>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
