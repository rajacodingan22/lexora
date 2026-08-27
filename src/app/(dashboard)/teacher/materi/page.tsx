'use client'

import { useEffect, useState, useCallback } from 'react'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'
import { createClient } from '@/lib/supabase-client'
import { useAuth } from '@/lib/auth-context'
import { useI18n } from '@/lib/i18n/client'
import { DashboardLayout } from '@/components/layout/dashboard-layout'
import type { Material, Course } from '@/types'
import {
  Plus, FileText, FileSpreadsheet, FileType,
  ExternalLink, Search, X, Upload, Loader2, Trash2, Pencil,
  ClipboardList, Headphones, Download, FolderOpen
} from 'lucide-react'
import { formatDate } from '@/lib/utils'
import FilePreviewModal from '@/components/shared/file-preview-modal'

type FileTypeCategory = 'pdf' | 'ppt' | 'docx' | 'worksheet' | 'audio' | 'external_link'

const FILE_TYPE_OPTIONS: { value: FileTypeCategory; label: string }[] = [
  { value: 'pdf', label: 'PDF' },
  { value: 'ppt', label: 'PPT' },
  { value: 'docx', label: 'DOCX' },
  { value: 'worksheet', label: 'Lembar Kerja' },
  { value: 'audio', label: 'Audio' },
  { value: 'external_link', label: 'Tautan Eksternal' },
]

const FILE_TYPE_OPTION_KEYS: Record<FileTypeCategory, string> = {
  pdf: 'teacher1.materi.filePdf',
  ppt: 'teacher1.materi.filePpt',
  docx: 'teacher1.materi.fileDocx',
  worksheet: 'teacher1.materi.fileWorksheet',
  audio: 'teacher1.materi.fileAudio',
  external_link: 'teacher1.materi.fileExternal',
}

const FILE_TYPE_ICONS: Record<FileTypeCategory, React.ReactNode> = {
  pdf: <FileText className="h-5 w-5" />,
  ppt: <FileSpreadsheet className="h-5 w-5" />,
  docx: <FileType className="h-5 w-5" />,
  worksheet: <ClipboardList className="h-5 w-5" />,
  audio: <Headphones className="h-5 w-5" />,
  external_link: <ExternalLink className="h-5 w-5" />,
}

const FILE_TYPE_COLORS: Record<FileTypeCategory, string> = {
  pdf: 'bg-red-500/10 text-red-400',
  ppt: 'bg-orange-500/10 text-orange-400',
  docx: 'bg-blue-500/10 text-blue-400',
  worksheet: 'bg-emerald-500/10 text-emerald-400',
  audio: 'bg-purple-500/10 text-purple-400',
  external_link: 'bg-cyan-500/10 text-cyan-400',
}

interface FormData {
  title: string
  description: string
  course_id: string
  file_type: FileTypeCategory
  external_url: string
}

const emptyForm: FormData = {
  title: '',
  description: '',
  course_id: '',
  file_type: 'pdf',
  external_url: '',
}

function MaterialsSkeleton() {
  return (
    <div className="space-y-3">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="flex items-center justify-between rounded-lg border border-border bg-surface-container-low p-4 animate-pulse">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-surface-container-high" />
            <div className="space-y-2">
              <div className="h-4 w-48 rounded bg-surface-container-high" />
              <div className="h-3 w-32 rounded bg-surface-container-high" />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="h-6 w-12 rounded bg-surface-container-high" />
            <div className="h-8 w-8 rounded bg-surface-container-high" />
          </div>
        </div>
      ))}
    </div>
  )
}

export default function TeacherMaterialsPage() {
  const { user, loading: authLoading } = useAuth()
  const { t } = useI18n()
  const supabase = createClient()

  const [courses, setCourses] = useState<Course[]>([])
  const [materials, setMaterials] = useState<Material[]>([])
  const [loading, setLoading] = useState(true)
  const [coursesLoading, setCoursesLoading] = useState(true)
  const [selectedCourseId, setSelectedCourseId] = useState('')
  const [searchQuery, setSearchQuery] = useState('')

  const [modalOpen, setModalOpen] = useState(false)
  const [editingMaterial, setEditingMaterial] = useState<Material | null>(null)
  const [form, setForm] = useState<FormData>(emptyForm)
  const [file, setFile] = useState<File | null>(null)
  const [saving, setSaving] = useState(false)

  const [deleteTarget, setDeleteTarget] = useState<Material | null>(null)
  const [deleting, setDeleting] = useState(false)

  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)

  const showToast = useCallback((type: 'success' | 'error', message: string) => {
    setToast({ type, message })
    setTimeout(() => setToast(null), 4000)
  }, [])

  useEffect(() => {
    if (authLoading || !user) return
    fetchCourses()
  }, [authLoading, user])

  useEffect(() => {
    if (!selectedCourseId) {
      setMaterials([])
      setLoading(false)
      return
    }
    fetchMaterials()
  }, [selectedCourseId])

  async function fetchCourses() {
    setCoursesLoading(true)
    const { data: teacherRow } = await supabase
      .from('teachers')
      .select('id')
      .eq('user_id', user!.id)
      .maybeSingle()

    if (!teacherRow) {
      setCourses([])
      setCoursesLoading(false)
      return
    }

    const { data: ctRows } = await supabase
      .from('course_teachers')
      .select('course_id')
      .eq('teacher_id', teacherRow.id)

    const courseIds = (ctRows || []).map(ct => ct.course_id)

    if (courseIds.length === 0) {
      setCourses([])
      setCoursesLoading(false)
      return
    }

    const { data, error } = await supabase
      .from('courses')
      .select('*')
      .in('id', courseIds)
      .order('created_at', { ascending: false })

    if (error) {
      showToast('error', t('teacher1.materi.toastLoadCourses'))
      setCoursesLoading(false)
      return
    }
    setCourses(data as Course[])
    if (data && data.length > 0) {
      setSelectedCourseId(data[0].id)
    }
    setCoursesLoading(false)
  }

  async function fetchMaterials() {
    setLoading(true)
    const { data, error } = await supabase
      .from('materials')
      .select('*')
      .eq('course_id', selectedCourseId)
      .order('created_at', { ascending: false })

    if (error) {
      showToast('error', t('teacher1.materi.toastLoadMaterials'))
      setLoading(false)
      return
    }
    setMaterials(data as Material[])
    setLoading(false)
  }

  function openAddModal() {
    setEditingMaterial(null)
    setForm({ ...emptyForm, course_id: selectedCourseId })
    setFile(null)
    setModalOpen(true)
  }

  function openEditModal(material: Material) {
    setEditingMaterial(material)
    setForm({
      title: material.title,
      description: material.description || '',
      course_id: material.course_id,
      file_type: (material.file_type as FileTypeCategory) || 'pdf',
      external_url: material.external_url || '',
    })
    setFile(null)
    setModalOpen(true)
  }

  function closeModal() {
    setModalOpen(false)
    setEditingMaterial(null)
    setForm(emptyForm)
    setFile(null)
  }

  async function handleSave() {
    if (!form.title.trim()) {
      showToast('error', t('teacher1.materi.toastTitleRequired'))
      return
    }
    if (!form.course_id) {
      showToast('error', t('teacher1.materi.toastSelectCourse'))
      return
    }
    if (form.file_type === 'external_link' && !form.external_url.trim()) {
      showToast('error', t('teacher1.materi.toastExternalUrl'))
      return
    }
    if (form.file_type !== 'external_link' && !editingMaterial && !file) {
      showToast('error', t('teacher1.materi.toastPickFile'))
      return
    }

    setSaving(true)
    try {
      let fileUrl = editingMaterial?.file_url || null

      if (file) {
        const filePath = `${user!.id}/${form.course_id}/${crypto.randomUUID()}-${file.name}`
        const { error: uploadError } = await supabase.storage
          .from('materials')
          .upload(filePath, file)

        if (uploadError) {
          showToast('error', t('teacher1.materi.toastUploadFailed'))
          setSaving(false)
          return
        }

        const { data: urlData } = supabase.storage
          .from('materials')
          .getPublicUrl(filePath)
        fileUrl = urlData.publicUrl
      }

      const payload = {
        course_id: form.course_id,
        title: form.title.trim(),
        description: form.description.trim() || null,
        file_type: form.file_type,
        file_url: fileUrl,
        external_url: form.file_type === 'external_link' ? form.external_url.trim() : null,
      }

      if (editingMaterial) {
        const { error: updateError } = await supabase
          .from('materials')
          .update(payload)
          .eq('id', editingMaterial.id)

        if (updateError) {
          showToast('error', t('teacher1.materi.toastUpdateFailed'))
          setSaving(false)
          return
        }
        showToast('success', t('teacher1.materi.toastUpdated'))
      } else {
        const { error: insertError } = await supabase
          .from('materials')
          .insert(payload)

                if (insertError) {
          showToast('error', t('teacher1.materi.toastCreateFailed'))
          setSaving(false)
          return
        }
        showToast('success', t('teacher1.materi.toastCreated'))
      }

      closeModal()
      await fetchMaterials()
    } catch {
      showToast('error', t('teacher1.materi.toastUnexpected'))
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      if (deleteTarget.file_url) {
        const parts = deleteTarget.file_url.split('/')
        const filePath = parts.slice(-3).join('/')
        await supabase.storage.from('materials').remove([filePath])
      }

      const { error } = await supabase
        .from('materials')
        .delete()
        .eq('id', deleteTarget.id)

      if (error) {
        showToast('error', t('teacher1.materi.toastDeleteFailed'))
        setDeleting(false)
        return
      }

      showToast('success', t('teacher1.materi.toastDeleted'))
      setDeleteTarget(null)
      await fetchMaterials()
    } catch {
      showToast('error', t('teacher1.materi.toastUnexpected'))
    } finally {
      setDeleting(false)
    }
  }

  const filteredMaterials = materials.filter((m) => {
    if (!searchQuery.trim()) return true
    const q = searchQuery.toLowerCase()
    return (
      m.title.toLowerCase().includes(q) ||
      (m.description && m.description.toLowerCase().includes(q))
    )
  })

  const groupedMaterials: Record<string, Material[]> = {}
  for (const m of filteredMaterials) {
    const key = m.file_type || 'other'
    if (!groupedMaterials[key]) groupedMaterials[key] = []
    groupedMaterials[key].push(m)
  }

  const GROUP_ORDER: FileTypeCategory[] = ['pdf', 'ppt', 'docx', 'worksheet', 'audio', 'external_link']
  const sortedGroups = Object.entries(groupedMaterials).sort(([a], [b]) => {
    const ai = GROUP_ORDER.indexOf(a as FileTypeCategory)
    const bi = GROUP_ORDER.indexOf(b as FileTypeCategory)
    return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi)
  })

  if (authLoading) {
    return (
      <DashboardLayout role="teacher">
        <div className="flex items-center justify-center min-h-[60vh]">
          <Loader2 className="h-8 w-8 text-indigo-400 animate-spin" />
        </div>
      </DashboardLayout>
    )
  }

  return (
    <DashboardLayout role="teacher">
      <div className="space-y-6">
        <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-on-surface">{t('teacher1.materi.title')}</h1>
          <p className="text-on-surface-variant">{t('teacher1.materi.subtitle')}</p>
        </div>
        <Button size="sm" onClick={openAddModal} disabled={!selectedCourseId}>
          <Plus className="mr-1 h-4 w-4" /> {t('teacher1.materi.uploadBtn')}
          </Button>
        </div>

        {toast && (
          <div
            className={`rounded-lg px-4 py-3 text-sm ${
              toast.type === 'success'
                ? 'bg-emerald-500/10 text-emerald-400'
                : 'bg-red-500/10 text-red-400'
            }`}
          >
            {toast.message}
          </div>
        )}

        <Card>
          <CardHeader>
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
              <div className="w-full sm:w-64">
                <Select
                  value={selectedCourseId}
                  onChange={(e) => setSelectedCourseId(e.target.value)}
                  disabled={coursesLoading}
                >
                  <option value="">{coursesLoading ? t('teacher1.materi.loadingCourses') : t('teacher1.materi.selectCourse')}</option>
                  {courses.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.title?.en || c.title?.id || t('teacher1.materi.untitled')}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="relative w-full sm:w-72">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted pointer-events-none" />
                <input
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder={t('teacher1.materi.searchPlaceholder')}
                  className="flex h-11 w-full rounded-lg border border-border bg-surface-container-lowest pl-10 pr-3.5 py-2 text-sm text-on-surface placeholder:text-muted transition-all hover:border-border-strong focus:outline-none focus:ring-2 focus:ring-ring focus:border-primary"
                />
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {!selectedCourseId ? (
              <div className="flex flex-col items-center justify-center py-16">
                <FolderOpen className="h-10 w-10 text-muted mb-3" />
                <p className="text-sm text-on-surface-variant">{t('teacher1.materi.selectCourseToView')}</p>
              </div>
            ) : loading ? (
              <MaterialsSkeleton />
            ) : filteredMaterials.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16">
                <div className="flex h-16 w-16 items-center justify-center rounded-full bg-indigo-500/10 mb-4">
                  <Upload className="h-8 w-8 text-indigo-400" />
                </div>
                  <h3 className="text-lg font-semibold text-on-surface">
                    {searchQuery ? t('teacher1.materi.noMatch') : t('teacher1.materi.noMaterials')}
                  </h3>
                <p className="text-sm text-on-surface-variant mt-1 mb-6 text-center max-w-sm">
                  {searchQuery
                    ? t('teacher1.materi.tryAnotherKeyword')
                    : t('teacher1.materi.firstMaterial')}
                </p>
                {!searchQuery && (
                  <Button size="sm" onClick={openAddModal}>
                    <Plus className="mr-1 h-4 w-4" /> {t('teacher1.materi.uploadBtn')}
                  </Button>
                )}
              </div>
            ) : (
              <div className="space-y-6">
                {sortedGroups.map(([fileType, items]) => (
                  <div key={fileType}>
                    <div className="flex items-center gap-2 mb-3">
                      <div className={`flex h-6 w-6 items-center justify-center rounded ${
                        FILE_TYPE_COLORS[fileType as FileTypeCategory] || 'bg-surface-container-high text-muted'
                      }`}>
                        {FILE_TYPE_ICONS[fileType as FileTypeCategory] || <FileText className="h-3.5 w-3.5" />}
                      </div>
                      <h3 className="text-sm font-semibold text-on-surface uppercase tracking-wide">
                        {t(FILE_TYPE_OPTION_KEYS[fileType as FileTypeCategory] || 'teacher1.materi.fileExternal')}
                      </h3>
                      <Badge variant="outline" className="text-[10px]">{items.length}</Badge>
                    </div>
                    <div className="space-y-2">
                      {items.map((m) => {
                        const ft = m.file_type as FileTypeCategory
                        return (
                          <div
                            key={m.id}
                            className="flex items-center justify-between rounded-lg border border-border bg-surface-container-low p-3 transition-all hover:border-border-strong"
                          >
                            <div className="flex items-center gap-3 min-w-0 flex-1">
                              <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${FILE_TYPE_COLORS[ft] || 'bg-surface-container-high text-muted'}`}>
                                {FILE_TYPE_ICONS[ft] || <FileText className="h-5 w-5" />}
                              </div>
                              <div className="min-w-0">
                                <p className="font-medium text-on-surface truncate">{m.title}</p>
                                <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted">
                                  {m.description && (
                                    <span className="truncate max-w-[200px]">{m.description}</span>
                                  )}
                                  <span>{formatDate(m.created_at)}</span>
                                </div>
                              </div>
                            </div>
                            <div className="flex items-center gap-1 ml-4 shrink-0">
                              {m.file_url && (
                                <a
                                  href={m.file_url}
                                  onClick={(e) => { e.preventDefault(); setPreviewUrl(m.file_url) }}
                                >
                                  <Button variant="ghost" size="icon-sm">
                                    <Download className="h-4 w-4" />
                                  </Button>
                                </a>
                              )}
                              {m.external_url && (
                                <a href={m.external_url} target="_blank" rel="noopener noreferrer">
                                  <Button variant="ghost" size="icon-sm">
                                    <ExternalLink className="h-4 w-4" />
                                  </Button>
                                </a>
                              )}
                              <Button variant="ghost" size="icon-sm" onClick={() => openEditModal(m)}>
                                <Pencil className="h-4 w-4" />
                              </Button>
                              <Button variant="ghost" size="icon-sm" onClick={() => setDeleteTarget(m)}>
                                <Trash2 className="h-4 w-4 text-red-400" />
                              </Button>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={closeModal}>
          <div
            className="w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-xl border border-border bg-surface p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-semibold text-on-surface">
                {editingMaterial ? t('teacher1.materi.editTitle') : t('teacher1.materi.uploadTitle')}
              </h2>
              <button onClick={closeModal} className="text-muted hover:text-on-surface">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <Label required>{t('teacher1.materi.titleLabel')}</Label>
                <Input
                  value={form.title}
                  onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                  placeholder={t('teacher1.materi.titlePlaceholder')}
                />
              </div>

              <div>
                <Label>{t('teacher1.materi.descriptionLabel')}</Label>
                <Textarea
                  value={form.description}
                  onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                  placeholder={t('teacher1.materi.descriptionPlaceholder')}
                  className="min-h-[80px]"
                />
              </div>

              <div>
                <Label required>{t('teacher1.materi.courseLabel')}</Label>
                <select
                  className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-on-surface focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
                  value={form.course_id}
                  onChange={(e) => setForm((f) => ({ ...f, course_id: e.target.value }))}
                >
                  <option value="">{t('teacher1.materi.selectCourse')}</option>
                  {courses.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.title?.en || c.title?.id || t('teacher1.materi.untitled')}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <Label required>{t('teacher1.materi.fileTypeLabel')}</Label>
                <select
                  value={form.file_type}
                  onChange={(e) => setForm((f) => ({ ...f, file_type: e.target.value as FileTypeCategory }))}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-on-surface focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
                >
                  {FILE_TYPE_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>{t(FILE_TYPE_OPTION_KEYS[opt.value])}</option>
                  ))}
                </select>
              </div>

              {form.file_type === 'external_link' ? (
                <div>
                  <Label required>{t('teacher1.materi.externalUrlLabel')}</Label>
                  <Input
                    value={form.external_url}
                    onChange={(e) => setForm((f) => ({ ...f, external_url: e.target.value }))}
                    placeholder="https://example.com/material"
                    type="url"
                  />
                </div>
              ) : (
                <div>
                  <Label required>{editingMaterial ? t('teacher1.materi.replaceFileLabel') : t('teacher1.materi.fileLabel')}</Label>
                  <input
                    type="file"
                    accept={
                      form.file_type === 'pdf' ? '.pdf' :
                      form.file_type === 'ppt' ? '.ppt,.pptx' :
                      form.file_type === 'docx' ? '.doc,.docx' :
                      form.file_type === 'audio' ? '.mp3,.wav,.ogg,.m4a' :
                      form.file_type === 'worksheet' ? '.pdf,.doc,.docx,.xls,.xlsx' :
                      undefined
                    }
                    onChange={(e) => setFile(e.target.files?.[0] || null)}
                    className="flex h-11 w-full rounded-lg border border-border bg-surface-container-lowest px-3.5 py-2 text-sm text-on-surface file:mr-3 file:rounded file:border-0 file:bg-indigo-500/10 file:px-3 file:py-1 file:text-sm file:font-medium file:text-indigo-400 hover:file:bg-indigo-500/20"
                  />
                  {editingMaterial?.file_url && !file && (
                    <p className="text-xs text-muted mt-1.5">{t('teacher1.materi.keepCurrentFile')}</p>
                  )}
                </div>
              )}
            </div>

            <div className="flex items-center justify-end gap-2 mt-6 pt-4 border-t border-border">
              <Button variant="outline" onClick={closeModal}>{t('teacher1.materi.cancel')}</Button>
              <Button onClick={handleSave} loading={saving}>
                {saving ? t('teacher1.materi.saving') : editingMaterial ? t('teacher1.materi.update') : t('teacher1.materi.uploadBtn')}
              </Button>
            </div>
          </div>
        </div>
      )}

      {deleteTarget && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
          onClick={() => setDeleteTarget(null)}
        >
          <div
            className="w-full max-w-sm rounded-xl border border-border bg-surface p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-lg font-semibold text-on-surface mb-2">{t('teacher1.materi.deleteTitle')}</h2>
            <p className="text-sm text-on-surface-variant mb-6">
              {t('teacher1.materi.deleteConfirm', { title: deleteTarget.title })}
            </p>
            <div className="flex items-center justify-end gap-2">
              <Button variant="outline" onClick={() => setDeleteTarget(null)}>{t('teacher1.materi.cancel')}</Button>
              <Button variant="destructive" onClick={handleDelete} loading={deleting}>
                {deleting ? t('teacher1.materi.deleting') : t('teacher1.materi.delete')}
              </Button>
            </div>
          </div>
        </div>
      )}

      <FilePreviewModal url={previewUrl} title={previewUrl?.split('/').pop()} onClose={() => setPreviewUrl(null)} />
    </DashboardLayout>
  )
}

