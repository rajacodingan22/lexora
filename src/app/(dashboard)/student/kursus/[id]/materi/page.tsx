'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { createClient } from '@/lib/supabase-client'
import { useAuth } from '@/lib/auth-context'
import { formatDateOnly } from '@/lib/utils'
import {
  FileText, File, FileSpreadsheet, Headphones, Link2, Video, FolderOpen,
  Download, ExternalLink, Loader2, ChevronLeft, Search
} from 'lucide-react'
import type { Material } from '@/types'
import FilePreviewModal from '@/components/shared/file-preview-modal'

type FileTypeBadge = 'PDF' | 'PPT' | 'DOCX' | 'Worksheet' | 'Audio' | 'External Link' | 'Video'

const typeIconMap: Record<string, React.ReactNode> = {
  PDF: <FileText className="h-5 w-5 text-red-400" />,
  PPT: <FileSpreadsheet className="h-5 w-5 text-orange-400" />,
  DOCX: <FileText className="h-5 w-5 text-blue-400" />,
  Worksheet: <FileSpreadsheet className="h-5 w-5 text-emerald-400" />,
  Audio: <Headphones className="h-5 w-5 text-purple-400" />,
  'External Link': <Link2 className="h-5 w-5 text-cyan-400" />,
  Video: <Video className="h-5 w-5 text-pink-400" />,
}

const typeBgMap: Record<string, string> = {
  PDF: 'bg-red-500/10',
  PPT: 'bg-orange-500/10',
  DOCX: 'bg-blue-500/10',
  Worksheet: 'bg-emerald-500/10',
  Audio: 'bg-purple-500/10',
  'External Link': 'bg-cyan-500/10',
  Video: 'bg-pink-500/10',
}

const _typeBadgeMap: Record<string, 'destructive' | 'warning' | 'default' | 'success' | 'outline'> = {
  PDF: 'destructive',
  PPT: 'warning',
  DOCX: 'default',
  Worksheet: 'success',
  Audio: 'default',
  'External Link': 'outline',
  Video: 'default',
}

function inferFileType(material: Material): string {
  if (material.external_url) return 'External Link'
  const url = material.file_url || ''
  const ext = url.split('.').pop()?.toLowerCase() || ''
  if (['mp4', 'webm', 'mov', 'avi'].includes(ext)) return 'Video'
  if (['mp3', 'wav', 'ogg', 'aac'].includes(ext)) return 'Audio'
  if (ext === 'pdf') return 'PDF'
  if (['ppt', 'pptx'].includes(ext)) return 'PPT'
  if (['doc', 'docx'].includes(ext)) return 'DOCX'
  if (['xls', 'xlsx', 'csv'].includes(ext)) return 'Worksheet'
  if (material.file_type) {
    const ft = material.file_type.toLowerCase()
    if (ft.includes('video')) return 'Video'
    if (ft.includes('audio')) return 'Audio'
    if (ft.includes('pdf')) return 'PDF'
    if (ft.includes('ppt') || ft.includes('presentation')) return 'PPT'
    if (ft.includes('doc') || ft.includes('word')) return 'DOCX'
    if (ft.includes('sheet') || ft.includes('excel') || ft.includes('worksheet')) return 'Worksheet'
    if (ft.includes('link') || ft.includes('url')) return 'External Link'
  }
  return material.file_type || 'PDF'
}

function _formatFileSize(url: string | null): string | null {
  if (!url) return null
  return null
}

export default function StudentMaterialsPage() {
  const params = useParams()
  const router = useRouter()
  const { user } = useAuth()
  const supabase = createClient()
  const courseId = params.id as string

  const [materials, setMaterials] = useState<Material[]>([])
  const [courseTitle, setCourseTitle] = useState('')
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)

  useEffect(() => {
    if (!user || !courseId) return
    fetchMaterials()
  }, [user, courseId])

  async function fetchMaterials() {
    setLoading(true)
    try {
      const { data: courseData } = await supabase
        .from('courses')
        .select('title')
        .eq('id', courseId)
        .single()

      if (courseData) {
        const t = courseData.title as { id?: string; en?: string }
        setCourseTitle(t?.en || t?.id || 'Course')
      }

      const { data } = await supabase
        .from('materials')
        .select('*')
        .eq('course_id', courseId)
        .order('sort_order', { ascending: true })
        .order('created_at', { ascending: false })

      setMaterials((data || []) as Material[])
    } catch (err) {
      console.error('Failed to fetch materials:', err)
      setMaterials([])
    }
    setLoading(false)
  }

  const grouped = materials.reduce<Record<string, Material[]>>((acc, m) => {
    const type = inferFileType(m)
    if (!acc[type]) acc[type] = []
    acc[type].push(m)
    return acc
  }, {})

  const typeOrder: FileTypeBadge[] = ['PDF', 'PPT', 'DOCX', 'Worksheet', 'Audio', 'Video', 'External Link']

  const filteredGroups = Object.entries(grouped).reduce<Record<string, Material[]>>((acc, [type, items]) => {
    if (searchQuery) {
      const q = searchQuery.toLowerCase()
      const filtered = items.filter(m => m.title.toLowerCase().includes(q) || (m.description || '').toLowerCase().includes(q))
      if (filtered.length > 0) acc[type] = filtered
    } else {
      acc[type] = items
    }
    return acc
  }, {})

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 text-indigo-400 animate-spin" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-on-surface">Learning Materials</h1>
          <p className="text-on-surface-variant">{courseTitle}</p>
        </div>
        <Button variant="ghost" onClick={() => router.back()}>
          <ChevronLeft className="mr-1 h-4 w-4" /> Back
        </Button>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted" />
        <input
          className="w-full rounded-lg border border-border bg-background pl-10 pr-4 py-2.5 text-sm text-on-surface placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
          placeholder="Search materials..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
      </div>

      {materials.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <FolderOpen className="h-12 w-12 text-muted mb-3" />
            <p className="text-sm text-on-surface-variant">No materials available yet</p>
          </CardContent>
        </Card>
      ) : (
        typeOrder.map((type) => {
          const items = filteredGroups[type]
          if (!items || items.length === 0) return null
          const icon = typeIconMap[type] || <File className="h-5 w-5 text-muted" />
          const bg = typeBgMap[type] || 'bg-surface-container-low'

          return (
            <Card key={type}>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-sm">
                  <div className={`flex h-8 w-8 items-center justify-center rounded-lg ${bg}`}>
                    {icon}
                  </div>
                  <span>{type}</span>
                  <Badge variant="outline" className="ml-auto">{items.length}</Badge>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {items.map((m) => (
                    <div
                      key={m.id}
                      className="flex items-center justify-between rounded-lg border border-border bg-surface-container-low p-4 transition-all duration-150 hover:border-indigo-500/20"
                    >
                      <div className="flex items-start gap-3 flex-1 min-w-0">
                        <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${bg}`}>
                          {icon}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium text-on-surface truncate">{m.title}</p>
                          {m.description && (
                            <p className="text-xs text-on-surface-variant mt-0.5 line-clamp-2">{m.description}</p>
                          )}
                          <div className="flex items-center gap-3 mt-1.5">
                            <span className="text-[10px] text-muted">{formatDateOnly(m.created_at)}</span>
                            {m.file_url && (
                              <span className="text-[10px] text-muted">
                                {m.file_url.split('.').pop()?.toUpperCase() || ''}
                              </span>
                            )}
                            {m.is_required && (
                              <Badge variant="warning" className="text-[9px] px-1.5 py-0">Required</Badge>
                            )}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0 ml-3">
                        {m.external_url ? (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => window.open(m.external_url!, '_blank')}
                          >
                            <ExternalLink className="h-3.5 w-3.5 mr-1" /> Open
                          </Button>
                        ) : m.file_url ? (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setPreviewUrl(m.file_url!)}
                          >
                            <Download className="h-3.5 w-3.5 mr-1" /> Download
                          </Button>
                        ) : null}
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )
        })
      )}

      <FilePreviewModal url={previewUrl} title={previewUrl?.split('/').pop()} onClose={() => setPreviewUrl(null)} />
    </div>
  )
}
