'use client'

import { useState, useEffect } from 'react'
import { Loader2, FileAudio, FileImage, FileText, File, ExternalLink } from 'lucide-react'
import { DriveFilePreview } from './drive-file-preview'

interface DriveFile {
  id: string
  name: string
  mimeType: string
  size: string
  createdTime: string
  webViewLink: string
  thumbnailLink?: string
}

export function DriveFileBrowser() {
  const [files, setFiles] = useState<DriveFile[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [previewFile, setPreviewFile] = useState<DriveFile | null>(null)

  useEffect(() => {
    async function fetchFiles() {
      try {
        const res = await fetch('/api/drive/files')
        const data = await res.json()
        if (data.error) {
          setError(data.error)
        } else {
          setFiles(data.files || [])
        }
      } catch {
        setError('Gagal memuat file')
      }
      setLoading(false)
    }
    fetchFiles()
  }, [])

  function getFileIcon(mimeType: string) {
    if (mimeType.startsWith('audio/')) return <FileAudio className="h-8 w-8 text-purple-400" />
    if (mimeType.startsWith('image/')) return <FileImage className="h-8 w-8 text-blue-400" />
    if (mimeType === 'application/pdf') return <FileText className="h-8 w-8 text-red-400" />
    return <File className="h-8 w-8 text-slate-400" />
  }

  function formatSize(bytes: string) {
    const b = parseInt(bytes || '0')
    if (b < 1024) return b + ' B'
    if (b < 1024 * 1024) return (b / 1024).toFixed(1) + ' KB'
    return (b / (1024 * 1024)).toFixed(1) + ' MB'
  }

  if (loading) {
    return (
      <div className="flex justify-center py-6">
        <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
      </div>
    )
  }

  if (error) {
    return <p className="text-xs text-red-400 text-center py-4">{error}</p>
  }

  if (files.length === 0) {
    return (
      <div className="rounded-xl bg-white/5 py-6 text-center">
        <File className="mx-auto mb-2 h-8 w-8 text-slate-500" />
        <p className="text-xs text-white/40">Belum ada file di folder Lexora.</p>
      </div>
    )
  }

  return (
    <>
      <div className="space-y-2">
        <p className="text-xs text-white/40">{files.length} file</p>
        <div className="grid gap-2 sm:grid-cols-2">
          {files.map(f => (
            <button
              key={f.id}
              onClick={() => setPreviewFile(f)}
              className="flex items-center gap-3 rounded-xl bg-white/5 p-3 text-left hover:bg-white/10 transition-colors"
            >
              {f.thumbnailLink ? (
                <img src={f.thumbnailLink} alt="" className="h-10 w-10 rounded-lg object-cover" />
              ) : (
                getFileIcon(f.mimeType)
              )}
              <div className="flex-1 min-w-0">
                <p className="text-sm text-white/80 truncate">{f.name}</p>
                <p className="text-[10px] text-white/30">{formatSize(f.size)}</p>
              </div>
              <ExternalLink className="h-3.5 w-3.5 text-white/20 flex-shrink-0" />
            </button>
          ))}
        </div>
      </div>

      {previewFile && (
        <DriveFilePreview file={previewFile} onClose={() => setPreviewFile(null)} />
      )}
    </>
  )
}
