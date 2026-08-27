'use client'

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase-client'
import { useI18n } from '@/lib/i18n/client'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Label } from '@/components/ui/label'
import { ImageUpload } from '@/components/ui/image-upload'
import { Textarea } from '@/components/ui/textarea'
import { Flag } from '@/components/ui/flag'
import { catalogDetailsToForm, catalogFormToDetails } from '@/lib/course-catalog'
import {
  Search, Plus, Loader2, Trash2, Pencil, ChevronLeft, ChevronRight, X, BookOpen, User
} from 'lucide-react'

const PER_PAGE = 10

interface Language {
  code: string
  name: { en: string; id: string }
  flag_emoji: string | null
}

interface Level {
  id: string
  language_code: string
  code: string
  tier?: string | null
  is_active: boolean
  name: { en: string; id: string }
}

interface Program {
  id: string
  language_code: string
  name: { en: string; id: string }
}

interface CourseRow {
  id: string
  program_id: string
  language_code: string
  level_id: string
  tier: string | null
  track_type: string | null
  title: { en: string; id: string }
  description: { en: string; id: string } | null
  min_students: number
  max_students: number
  status: string
  mode: string
  image_url: string | null
  created_at: string
  teachers: { id: string; display_name: string | null }[]
  level_code: string | null
  level_name_id: string | null
  level_name_en: string | null
  student_count: number
  price: number
  is_try_class: boolean
  is_visible_marketplace: boolean
  is_featured: boolean
}

interface CourseForm {
  title_id: string
  title_en: string
  description_id: string
  description_en: string
  language_code: string
  program_id: string
  level_id: string
  tier: string
  track_type: string
  topics_text: string
  projects_text: string
  certificates_text: string
  min_students: number
  max_students: number
  mode: string
  image_url: string
  status: string
  price: number
  meeting_count: number
  project_count: number
  is_try_class: boolean
  is_visible_marketplace: boolean
  is_featured: boolean
  teacher_ids: string[]
}

interface TeacherOption {
  id: string
  display_name: string | null
}

const EMPTY_FORM: CourseForm = {
  title_id: '',
  title_en: '',
  description_id: '',
  description_en: '',
  language_code: '',
  program_id: '',
  level_id: '',
  tier: 'basic',
  track_type: 'regular',
  topics_text: '',
  projects_text: '',
  certificates_text: '',
  min_students: 10,
  max_students: 30,
  mode: 'online',
  image_url: '',
  status: 'active',
  price: 0,
  meeting_count: 0,
  project_count: 0,
  is_try_class: false,
  is_visible_marketplace: true,
  is_featured: false,
  teacher_ids: [],
}

export default function AdminKursusPage() {
  const { t } = useI18n()
  const supabase = createClient()

  const [courses, setCourses] = useState<CourseRow[]>([])
  const [languages, setLanguages] = useState<Language[]>([])
  const [levels, setLevels] = useState<Level[]>([])
  const [programs, setPrograms] = useState<Program[]>([])
  const [teachers, setTeachers] = useState<TeacherOption[]>([])

  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [langFilter, setLangFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState('all')
  const [page, setPage] = useState(0)
  const [total, setTotal] = useState(0)
  const [statusUpdating, setStatusUpdating] = useState<string | null>(null)

  const [showModal, setShowModal] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<CourseForm>(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')

  const [deleteTarget, setDeleteTarget] = useState<CourseRow | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState('')

  const fetchRefs = useCallback(async () => {
    try {
      const [langRes, levelRes, progRes, teacherRes] = await Promise.all([
        supabase.from('languages').select('code, name, flag_emoji').eq('is_active', true).order('sort_order'),
        supabase.from('language_levels').select('id, language_code, code, tier, name, is_active').order('sort_order'),
        supabase.from('programs').select('id, language_code, name').eq('is_active', true).order('display_order'),
        supabase
          .from('teachers')
          .select('id, user:users(display_name)')
          .eq('status', 'active'),
      ])
      if (langRes.data) setLanguages(langRes.data as Language[])
      if (levelRes.data) setLevels(levelRes.data as Level[])
      if (progRes.data) setPrograms(progRes.data as Program[])
      if (teacherRes.data) {
        setTeachers(
          (teacherRes.data as unknown as { id: string; user: { display_name: string | null } }[]).map((t) => ({
            id: t.id,
            display_name: t.user?.display_name ?? null,
          }))
        )
      }
    } catch (err) {
      console.error('Failed to fetch reference data:', err)
    }
  }, [supabase])

  const fetchCourses = useCallback(async () => {
    setLoading(true)
    try {
      let query = supabase
        .from('courses')
        .select('*', { count: 'exact' })

      if (search.trim()) {
        query = query.or(
          'title->>en.ilike.%' + search + '%,title->>id.ilike.%' + search + '%'
        )
      }
      if (langFilter !== 'all') {
        query = query.eq('language_code', langFilter)
      }
      if (statusFilter !== 'all') {
        query = query.eq('status', statusFilter)
      }

      const { data, count, error } = await query
        .order('created_at', { ascending: false })
        .range(page * PER_PAGE, (page + 1) * PER_PAGE - 1)

      if (error || !data) {
        setCourses([])
        setLoading(false)
        return
      }

      const courseIds = data.map(c => c.id)

      const [levelRes, enrollRes, ctRes] = await Promise.all([
        supabase.from('language_levels').select('id, code, tier, name').in('id', data.map(c => c.level_id).filter(Boolean)),
        supabase.from('enrollments').select('course_id').in('course_id', courseIds),
        supabase.from('course_teachers').select('course_id, teacher:teachers(id, user:users!inner(display_name))').in('course_id', courseIds),
      ])

      const levelMap = new Map((levelRes.data ?? []).map((l: any) => [l.id, l]))
      const enrollCounts: Record<string, number> = {}
      for (const e of (enrollRes.data ?? [])) {
        enrollCounts[e.course_id] = (enrollCounts[e.course_id] || 0) + 1
      }
      const teacherMap: Record<string, { id: string; display_name: string | null }[]> = {}
      for (const ct of (ctRes.data ?? []) as any[]) {
        if (!teacherMap[ct.course_id]) teacherMap[ct.course_id] = []
        teacherMap[ct.course_id].push({
          id: ct.teacher.id,
          display_name: ct.teacher.user?.display_name ?? null,
        })
      }

      const mapped: CourseRow[] = data.map(c => {
        const level = levelMap.get(c.level_id)
        return {
          id: c.id,
          program_id: c.program_id,
          language_code: c.language_code,
          level_id: c.level_id,
          title: c.title,
          description: c.description,
          min_students: c.min_students ?? 10,
          max_students: c.max_students,
          status: c.status,
          mode: c.mode,
          image_url: c.image_url,
          created_at: c.created_at,
          teachers: teacherMap[c.id] || [],
          level_code: level?.code ?? c.tier ?? null,
          level_name_id: level?.name?.id ?? null,
          level_name_en: level?.name?.en ?? null,
          tier: c.tier ?? level?.tier ?? null,
          track_type: c.track_type ?? null,
          student_count: enrollCounts[c.id] || 0,
          price: Number(c.price ?? 0),
          is_try_class: !!c.is_try_class,
          is_visible_marketplace: !!c.is_visible_marketplace,
          is_featured: !!c.is_featured,
        }
      })

      setCourses(mapped)
      setTotal(count ?? 0)
    } catch (err) {
      console.error('Failed to fetch courses:', err)
      setCourses([])
    }
    setLoading(false)
  }, [search, langFilter, statusFilter, page, supabase])

  useEffect(() => { fetchRefs() }, [fetchRefs])
  useEffect(() => { fetchCourses() }, [fetchCourses])
  useEffect(() => { setPage(0) }, [search, langFilter, statusFilter])

  function openCreateModal() {
    setEditingId(null)
    setForm(EMPTY_FORM)
    setSaveError('')
    setShowModal(true)
  }

  async function openEditModal(course: CourseRow) {
    try {
      const { data, error } = await supabase
        .from('courses')
        .select('*')
        .eq('id', course.id)
        .single()
      if (error || !data) return

      const { data: ctData } = await supabase
        .from('course_teachers')
        .select('teacher_id')
        .eq('course_id', course.id)

      setForm({
        title_id: data.title?.id ?? '',
        title_en: data.title?.en ?? '',
        description_id: data.description?.id ?? '',
        description_en: data.description?.en ?? '',
        language_code: data.language_code ?? '',
        program_id: data.program_id ?? '',
        level_id: data.level_id ?? '',
        tier: data.tier ?? 'basic',
        track_type: data.track_type ?? 'regular',
        ...catalogDetailsToForm(data.details),
        min_students: data.min_students ?? 10,
        max_students: data.max_students ?? 30,
        mode: data.mode ?? 'online',
        image_url: data.image_url ?? '',
        status: data.status ?? 'draft',
        price: Number(data.price ?? 0),
        meeting_count: Number(data.meeting_count ?? 0),
        project_count: Number(data.project_count ?? 0),
        is_try_class: !!data.is_try_class,
        is_visible_marketplace: !!data.is_visible_marketplace,
        is_featured: !!data.is_featured,
        teacher_ids: (ctData ?? []).map((ct) => ct.teacher_id),
      })
      setEditingId(course.id)
      setSaveError('')
      setShowModal(true)
    } catch (err) {
      console.error('Failed to load course for editing:', err)
    }
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    if (!form.title_id.trim() || !form.language_code || !form.program_id || !form.level_id) {
      setSaveError(t('admin1.kursus.requiredFields'))
      return
    }

    setSaving(true)
    setSaveError('')

    const payload = {
      title: { id: form.title_id, en: form.title_en || form.title_id },
      description: { id: form.description_id, en: form.description_en },
      language_code: form.language_code,
      program_id: form.program_id,
      level_id: form.level_id,
      tier: form.tier,
      track_type: form.track_type,
      details: catalogFormToDetails(form.topics_text, form.projects_text, form.certificates_text),
      min_students: form.min_students,
      max_students: form.max_students,
      mode: form.mode,
      image_url: form.image_url || '',
      status: form.status,
      price: form.price,
      meeting_count: form.meeting_count,
      project_count: form.project_count,
      is_try_class: form.is_try_class,
      is_visible_marketplace: form.is_visible_marketplace,
      is_featured: form.is_featured,
    }

    let courseId = editingId
    if (editingId) {
      const { error } = await supabase.from('courses').update(payload).eq('id', editingId)
      if (error) { setSaveError(error.message); setSaving(false); return }
    } else {
      const { data, error } = await supabase.from('courses').insert(payload).select('id').single()
      if (error) { setSaveError(error.message); setSaving(false); return }
      courseId = data.id
    }

    // sync teacher assignments (admin yang tentukan guru kelas)
    if (courseId) {
      await supabase.from('course_teachers').delete().eq('course_id', courseId)
      if (form.teacher_ids.length > 0) {
        const { error: ctErr } = await supabase
          .from('course_teachers')
          .insert(form.teacher_ids.map((teacher_id) => ({ course_id: courseId, teacher_id })))
        if (ctErr) { setSaveError(ctErr.message); setSaving(false); return }
      }
    }

    setShowModal(false)
    setSaving(false)
    fetchCourses()
  }

  async function handleDelete() {
    if (!deleteTarget) return
    setDeleting(true)
    setDeleteError('')

    try {
      const { count: enrollCount } = await supabase
        .from('enrollments')
        .select('*', { count: 'exact', head: true })
        .eq('course_id', deleteTarget.id)

      const { count: assignCount } = await supabase
        .from('assignments')
        .select('*', { count: 'exact', head: true })
        .eq('course_id', deleteTarget.id)

      if ((enrollCount ?? 0) > 0 || (assignCount ?? 0) > 0) {
        setDeleteError(
          t('admin1.kursus.deleteErrorEnroll', { enroll: enrollCount ?? 0, assign: assignCount ?? 0 })
        )
        setDeleting(false)
        return
      }

      const { error } = await supabase.from('courses').delete().eq('id', deleteTarget.id)
      if (error) {
        setDeleteError(error.message)
        setDeleting(false)
        return
      }

      setDeleteTarget(null)
      setDeleting(false)
      fetchCourses()
    } catch (err: any) {
      setDeleteError(err?.message || t('admin1.kursus.deleteFallback'))
      setDeleting(false)
    }
  }

  async function updateStatus(course: CourseRow, newStatus: string) {
    setStatusUpdating(course.id)
    const { error } = await supabase.from('courses').update({ status: newStatus }).eq('id', course.id)
    if (error) {
      console.error('Failed to update status:', error)
      fetchCourses()
    } else {
      setCourses(prev => prev.map(c => c.id === course.id ? { ...c, status: newStatus } : c))
    }
    setStatusUpdating(null)
  }

  const filteredPrograms = programs.filter(p => p.language_code === form.language_code)
  const filteredLevels = levels.filter(l =>
    l.language_code === form.language_code && (l.is_active || l.id === form.level_id)
  )
  // Fallback: jika level_id tidak ada di daftar aktif (kursus legacy CEFR),
  // tetap tampilkan sebagai opsi agar form tidak kosong
  const levelOptions = [...filteredLevels]
  const selectedLevelInList = levelOptions.some(l => l.id === form.level_id)
  if (form.level_id && !selectedLevelInList) {
    const legacy = levels.find(l => l.id === form.level_id)
    if (legacy) levelOptions.push(legacy)
  }
  const displayLevels = levelOptions
  const totalPages = Math.ceil(total / PER_PAGE)

  function getLanguageDisplay(code: string): React.ReactNode {
    const lang = languages.find(l => l.code === code)
    if (!lang) return code.toUpperCase()
    return (
      <>
        {lang.flag_emoji ? <Flag emoji={lang.flag_emoji} className="h-3.5" /> : null} {lang.name?.en ?? code}
      </>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-on-surface">{t('admin1.kursus.title')}</h1>
          <p className="text-on-surface-variant">{t('admin1.kursus.subtitle')}</p>
        </div>
        <Button size="sm" onClick={openCreateModal}>
          <Plus className="mr-1 h-4 w-4" /> {t('admin1.kursus.addCourse')}
        </Button>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-4 flex-wrap">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted" />
              <Input
                placeholder={t('admin1.kursus.searchPlaceholder')}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-10"
              />
            </div>
            <Select
              value={langFilter}
              onChange={(e) => setLangFilter(e.target.value)}
              className="w-36"
            >
              <option value="all">{t('admin1.kursus.allLanguages')}</option>
              {languages.map((l) => (
                <option key={l.code} value={l.code}>
                  {l.flag_emoji ? <Flag emoji={l.flag_emoji} className="h-3.5" /> : null} {l.name?.en ?? l.code}
                </option>
              ))}
            </Select>
            <Select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="w-32"
            >
              <option value="all">{t('admin1.kursus.allStatus')}</option>
              <option value="draft">{t('admin1.kursus.statusDraft')}</option>
              <option value="active">{t('admin1.kursus.statusActive')}</option>
              <option value="completed">{t('admin1.kursus.statusCompleted')}</option>
              <option value="cancelled">{t('admin1.kursus.statusCancelled')}</option>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <LoadingSkeleton />
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-left text-xs text-muted uppercase">
                      <th className="pb-3 font-medium">{t('admin1.kursus.colTitle')}</th>
                      <th className="pb-3 font-medium">{t('admin1.kursus.colLang')}</th>
                      <th className="pb-3 font-medium">{t('admin1.kursus.colLevel')}</th>
                      <th className="pb-3 font-medium">{t('admin1.kursus.colTeacher')}</th>
                      <th className="pb-3 font-medium">{t('admin1.kursus.colStatus')}</th>
                      <th className="pb-3 font-medium">{t('admin1.kursus.colStudents')}</th>
                      <th className="pb-3 font-medium">{t('admin1.kursus.colPrice')}</th>
                      <th className="pb-3 font-medium">{t('admin1.kursus.colActions')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {courses.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="py-16 text-center text-muted">
                          <div className="flex flex-col items-center gap-2">
                            <BookOpen className="h-10 w-10 text-muted/50" />
                            <p>
                              {search || langFilter !== 'all' || statusFilter !== 'all'
                                ? t('admin1.kursus.noFilterMatch')
                                : t('admin1.kursus.noCourses')}
                            </p>
                            {!search && langFilter === 'all' && statusFilter === 'all' && (
                              <Button size="sm" variant="outline" onClick={openCreateModal}>
                                <Plus className="mr-1 h-4 w-4" /> {t('admin1.kursus.createFirst')}
                              </Button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ) : (
                      courses.map((c) => {
                        const levelBadge = c.level_code
                          ? 'bg-surface-container-high text-on-surface-variant'
                          : ''

                        return (
                          <tr
                            key={c.id}
                            className="border-b border-border hover:bg-surface/50"
                          >
                            <td className="py-3">
                              <div className="flex items-center gap-2">
                                <p className="font-medium text-on-surface line-clamp-1">
                                  {c.title?.id ?? c.title?.en ?? '—'}
                                </p>
                                {c.is_try_class && (
                                  <span className="inline-flex shrink-0 items-center rounded-full bg-primary-soft px-2 py-0.5 text-[10px] font-semibold text-primary">
                                    {t('admin1.kursus.tryClass')}
                                  </span>
                                )}
                              </div>
                            </td>
                            <td className="py-3">
                              <span className="text-xs text-on-surface-variant">
                                {getLanguageDisplay(c.language_code)}
                              </span>
                            </td>
                            <td className="py-3">
                              {c.level_code ? (
                                <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold border ${levelBadge}`}>
                                  {c.tier
                                    ? t(`common.tier.${c.tier}`)
                                    : c.level_name_id || c.level_code}
                                </span>
                              ) : (
                                <span className="text-xs text-muted">—</span>
                              )}
                            </td>
                            <td className="py-3">
                              <div className="flex flex-wrap gap-1">
                                {c.teachers.length > 0 ? c.teachers.map((t) => (
                                  <span key={t.id} className="inline-flex items-center gap-0.5 rounded bg-surface-container-high px-1.5 py-0.5 text-[10px] text-on-surface-variant">
                                    <User className="h-3 w-3" />
                                    {t.display_name ?? '—'}
                                  </span>
                                )) : (
                                  <span className="text-xs text-muted">—</span>
                                )}
                              </div>
                            </td>
                            <td className="py-3">
                              <div className="flex items-center gap-1">
                                <Select
                                  value={c.status}
                                  onChange={(e) => updateStatus(c, e.target.value)}
                                  className="w-24 text-xs"
                                  disabled={statusUpdating === c.id}
                                >
                                  <option value="draft">{t('admin1.kursus.statusDraft')}</option>
                                  <option value="active">{t('admin1.kursus.statusActive')}</option>
                                  <option value="completed">{t('admin1.kursus.statusCompleted')}</option>
                                  <option value="cancelled">{t('admin1.kursus.statusCancelled')}</option>
                                </Select>
                                {statusUpdating === c.id && (
                                  <Loader2 className="h-3 w-3 animate-spin text-muted" />
                                )}
                              </div>
                            </td>
                            <td className="py-3">
                              <span className="text-xs text-on-surface-variant">
                                {c.student_count}
                              </span>
                            </td>
                            <td className="py-3">
                              <span className="text-xs font-semibold text-on-surface">
                                {c.price > 0 ? 'Rp ' + c.price.toLocaleString('id-ID') : t('admin1.kursus.free')}
                              </span>
                            </td>
                            <td className="py-3">
                              <div className="flex items-center gap-1">
                                <Button
                                  variant="ghost"
                                  size="icon-sm"
                                  onClick={() => openEditModal(c)}
                                  title={t('admin1.kursus.editTitle')}
                                >
                                  <Pencil className="h-4 w-4" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon-sm"
                                  onClick={() => setDeleteTarget(c)}
                                  title={t('admin1.kursus.deleteTitle')}
                                >
                                  <Trash2 className="h-4 w-4 text-destructive" />
                                </Button>
                              </div>
                            </td>
                          </tr>
                        )
                      })
                    )}
                  </tbody>
                </table>
              </div>

              {totalPages > 1 && (
                <div className="flex flex-col items-center justify-between gap-3 pt-4 sm:flex-row">
                  <p className="text-xs text-muted">
                    {t('admin1.kursus.showing', {
                      start: page * PER_PAGE + 1,
                      end: Math.min((page + 1) * PER_PAGE, total),
                      total,
                    })}
                  </p>
                  <div className="flex items-center gap-1 overflow-x-auto">
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={page === 0}
                      onClick={() => setPage((p) => p - 1)}
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </Button>
                    {Array.from({ length: totalPages }, (_, i) => (
                      <Button
                        key={i}
                        variant={i === page ? 'default' : 'ghost'}
                        size="sm"
                        className="w-8"
                        onClick={() => setPage(i)}
                      >
                        {i + 1}
                      </Button>
                    ))}
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={page >= totalPages - 1}
                      onClick={() => setPage((p) => p + 1)}
                    >
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-surface-container-lowest rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto p-6 mx-4">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-on-surface">
                {editingId ? t('admin1.kursus.editCourse') : t('admin1.kursus.addCourse')}
              </h2>
              <Button variant="ghost" size="sm" onClick={() => setShowModal(false)}>
                <X className="h-4 w-4" />
              </Button>
            </div>
            <form onSubmit={handleSave} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="title_id">{t('admin1.kursus.formTitleIdLabel')}</Label>
                  <Input
                    id="title_id"
                    value={form.title_id}
                    onChange={(e) => setForm((f) => ({ ...f, title_id: e.target.value }))}
                    required
                    placeholder={t('admin1.kursus.formTitleIdPlaceholder')}
                  />
                </div>
                <div>
                  <Label htmlFor="title_en">{t('admin1.kursus.formTitleEnLabel')}</Label>
                  <Input
                    id="title_en"
                    value={form.title_en}
                    onChange={(e) => setForm((f) => ({ ...f, title_en: e.target.value }))}
                    placeholder={t('admin1.kursus.formTitleEnPlaceholder')}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="language_code">{t('admin1.kursus.formLanguageLabel')}</Label>
                  <Select
                    id="language_code"
                    value={form.language_code}
                    onChange={(e) => setForm((f) => ({ ...f, language_code: e.target.value, program_id: '', level_id: '' }))}
                    required
                  >
                    <option value="">{t('admin1.kursus.formSelectLanguage')}</option>
                    {languages.map((l) => (
                      <option key={l.code} value={l.code}>
                        {l.flag_emoji ? <Flag emoji={l.flag_emoji} className="h-3.5" /> : null} {l.name?.en ?? l.code}
                      </option>
                    ))}
                  </Select>
                </div>
                <div />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="program_id">{t('admin1.kursus.formProgramLabel')}</Label>
                  <Select
                    id="program_id"
                    value={form.program_id}
                    onChange={(e) => setForm((f) => ({ ...f, program_id: e.target.value }))}
                    required
                    disabled={!form.language_code}
                  >
                    <option value="">{t('admin1.kursus.formSelectProgram')}</option>
                    {filteredPrograms.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name?.id ?? p.name?.en}
                      </option>
                    ))}
                  </Select>
                </div>
                <div>
                  <Label htmlFor="level_id">{t('admin1.kursus.formLevelLabel')}</Label>
                  <Select
                    id="level_id"
                    value={form.level_id}
                    onChange={(e) => setForm((f) => ({ ...f, level_id: e.target.value }))}
                    required
                    disabled={!form.language_code}
                  >
                    <option value="">{t('admin1.kursus.formSelectLevel')}</option>
                    {displayLevels.map((l) => (
                      <option key={l.id} value={l.id}>
                        {l.name?.id ?? l.name?.en ?? l.code}
                      </option>
                    ))}
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="description_id">{t('admin1.kursus.formDescIdLabel')}</Label>
                  <Textarea
                    id="description_id"
                    value={form.description_id}
                    onChange={(e) => setForm((f) => ({ ...f, description_id: e.target.value }))}
                    placeholder={t('admin1.kursus.formDescIdPlaceholder')}
                    rows={3}
                  />
                </div>
                <div>
                  <Label htmlFor="description_en">{t('admin1.kursus.formDescEnLabel')}</Label>
                  <Textarea
                    id="description_en"
                    value={form.description_en}
                    onChange={(e) => setForm((f) => ({ ...f, description_en: e.target.value }))}
                    placeholder={t('admin1.kursus.formDescEnPlaceholder')}
                    rows={3}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="tier">{t('admin1.kursus.formTierLabel')}</Label>
                  <Select id="tier" value={form.tier} onChange={(e) => setForm((f) => ({ ...f, tier: e.target.value }))}>
                    <option value="basic">{t('common.tier.basic')}</option>
                    <option value="advance">{t('common.tier.advance')}</option>
                    <option value="expert">{t('common.tier.expert')}</option>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="track_type">{t('admin1.kursus.formTrackLabel')}</Label>
                  <Select id="track_type" value={form.track_type} onChange={(e) => setForm((f) => ({ ...f, track_type: e.target.value }))}>
                    <option value="fast_track">{t('common.track.fast_track')}</option>
                    <option value="regular">{t('common.track.regular')}</option>
                    <option value="intensive">{t('common.track.intensive')}</option>
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <div>
                  <Label htmlFor="min_students">{t('admin1.kursus.formMinStudentsLabel')}</Label>
                  <Input
                    id="min_students"
                    type="number"
                    min={1}
                    value={form.min_students}
                    onChange={(e) => setForm((f) => ({ ...f, min_students: parseInt(e.target.value) || 1 }))}
                  />
                </div>
                <div>
                  <Label htmlFor="max_students">{t('admin1.kursus.formMaxStudentsLabel')}</Label>
                  <Input
                    id="max_students"
                    type="number"
                    min={1}
                    value={form.max_students}
                    onChange={(e) => setForm((f) => ({ ...f, max_students: parseInt(e.target.value) || 1 }))}
                  />
                </div>
                <div>
                  <Label htmlFor="mode">{t('admin1.kursus.formModeLabel')}</Label>
                  <Select
                    id="mode"
                    value={form.mode}
                    onChange={(e) => setForm((f) => ({ ...f, mode: e.target.value }))}
                  >
                    <option value="online">{t('admin1.kursus.modeOnline')}</option>
                    <option value="offline">{t('admin1.kursus.modeOffline')}</option>
                    <option value="hybrid">{t('admin1.kursus.modeHybrid')}</option>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="status">{t('admin1.kursus.formStatusLabel')}</Label>
                  <Select
                    id="status"
                    value={form.status}
                    onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))}
                  >
                    <option value="draft">{t('admin1.kursus.statusDraft')}</option>
                    <option value="active">{t('admin1.kursus.statusActive')}</option>
                    <option value="completed">{t('admin1.kursus.statusCompleted')}</option>
                    <option value="cancelled">{t('admin1.kursus.statusCancelled')}</option>
                  </Select>
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-3">
                <div>
                  <Label htmlFor="topics_text">{t('admin1.kursus.formTopicsLabel')}</Label>
                  <Textarea id="topics_text" value={form.topics_text} onChange={(e) => setForm((f) => ({ ...f, topics_text: e.target.value }))} placeholder={t('admin1.kursus.formTopicsPlaceholder')} rows={5} />
                </div>
                <div>
                  <Label htmlFor="projects_text">{t('admin1.kursus.formProjectsLabel')}</Label>
                  <Textarea id="projects_text" value={form.projects_text} onChange={(e) => setForm((f) => ({ ...f, projects_text: e.target.value }))} placeholder={t('admin1.kursus.formProjectsPlaceholder')} rows={5} />
                </div>
                <div>
                  <Label htmlFor="certificates_text">{t('admin1.kursus.formCertificatesLabel')}</Label>
                  <Textarea id="certificates_text" value={form.certificates_text} onChange={(e) => setForm((f) => ({ ...f, certificates_text: e.target.value }))} placeholder={t('admin1.kursus.formCertificatesPlaceholder')} rows={5} />
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <div>
                  <Label htmlFor="price">{t('admin1.kursus.formPriceLabel')}</Label>
                  <Input
                    id="price"
                    type="number"
                    min={0}
                    value={form.price}
                    onChange={(e) => setForm((f) => ({ ...f, price: parseInt(e.target.value) || 0 }))}
                  />
                </div>
                <div>
                  <Label htmlFor="meeting_count">{t('admin1.kursus.formMeetingCountLabel')}</Label>
                  <Input
                    id="meeting_count"
                    type="number"
                    min={0}
                    value={form.meeting_count}
                    onChange={(e) => setForm((f) => ({ ...f, meeting_count: parseInt(e.target.value) || 0 }))}
                  />
                </div>
                <div>
                  <Label htmlFor="project_count">{t('admin1.kursus.formProjectCountLabel')}</Label>
                  <Input
                    id="project_count"
                    type="number"
                    min={0}
                    value={form.project_count}
                    onChange={(e) => setForm((f) => ({ ...f, project_count: parseInt(e.target.value) || 0 }))}
                  />
                </div>
                <div className="flex items-end pb-1">
                  <label className="flex cursor-pointer items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={form.is_try_class}
                      onChange={(e) => setForm((f) => ({ ...f, is_try_class: e.target.checked }))}
                    />
                    <span className="text-on-surface">{t('admin1.kursus.formTryClassLabel')}</span>
                  </label>
                </div>
                <div className="flex items-end pb-1">
                  <label className="flex cursor-pointer items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={form.is_visible_marketplace}
                      onChange={(e) => setForm((f) => ({ ...f, is_visible_marketplace: e.target.checked }))}
                    />
                    <span className="text-on-surface">{t('admin1.kursus.formMarketplaceLabel')}</span>
                  </label>
                </div>
                <div className="flex items-end pb-1">
                  <label className="flex cursor-pointer items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={form.is_featured}
                      onChange={(e) => setForm((f) => ({ ...f, is_featured: e.target.checked }))}
                    />
                    <span className="text-on-surface">{t('admin1.kursus.formLandingLabel')}</span>
                  </label>
                </div>
              </div>

              <div>
                <Label>{t('admin1.kursus.formTeacherLabel')}</Label>
                <div className="mt-1 grid grid-cols-2 gap-2 rounded-lg border border-border p-3">
                  {teachers.length === 0 ? (
                    <p className="col-span-2 text-xs text-muted">
                      {t('admin1.kursus.formNoActiveTeachers')}
                    </p>
                  ) : (
                    teachers.map((teacher) => (
                      <label key={teacher.id} className="flex cursor-pointer items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          checked={form.teacher_ids.includes(teacher.id)}
                          onChange={(e) =>
                            setForm((f) => ({
                              ...f,
                              teacher_ids: e.target.checked
                                ? [...f.teacher_ids, teacher.id]
                                : f.teacher_ids.filter((id) => id !== teacher.id),
                            }))
                          }
                        />
                        <span className="text-on-surface">{teacher.display_name ?? t('admin1.kursus.formTeacherFallback')}</span>
                      </label>
                    ))
                  )}
                </div>
              </div>

              <div>
                <Label>{t('admin1.kursus.formImageLabel')}</Label>
                <ImageUpload
                  bucket="course-materials"
                  pathPrefix={`courses/${Date.now()}`}
                  value={form.image_url || null}
                  onUpload={(url) => setForm((f) => ({ ...f, image_url: url }))}
                  onRemove={() => setForm((f) => ({ ...f, image_url: '' }))}
                />
              </div>

              {saveError && <p className="text-xs text-destructive">{saveError}</p>}

              <div className="flex justify-end gap-2 pt-2">
                <Button type="button" variant="outline" onClick={() => setShowModal(false)}>
                  {t('admin1.kursus.cancel')}
                </Button>
                <Button type="submit" disabled={saving}>
                  {saving ? (
                    <><Loader2 className="h-4 w-4 animate-spin mr-1" /> {t('admin1.kursus.saving')}</>
                  ) : editingId ? (
                    t('admin1.kursus.saveChanges')
                  ) : (
                    t('admin1.kursus.createCourse')
                  )}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-surface-container-lowest rounded-xl shadow-xl w-full max-w-sm p-6 mx-4">
            <h2 className="text-lg font-semibold text-on-surface mb-2">{t('admin1.kursus.deleteCourseTitle')}</h2>
            <p className="text-sm text-on-surface-variant mb-4">
              {t('admin1.kursus.deleteConfirmDesc')}{' '}
              <strong>{deleteTarget.title?.id ?? deleteTarget.title?.en}</strong>?
            </p>
            {deleteError && <p className="text-xs text-destructive mb-4">{deleteError}</p>}
            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                onClick={() => { setDeleteTarget(null); setDeleteError('') }}
              >
                {t('admin1.kursus.cancel')}
              </Button>
              <Button variant="destructive" onClick={handleDelete} disabled={deleting}>
                {deleting ? (
                  <><Loader2 className="h-4 w-4 animate-spin mr-1" /> {t('admin1.kursus.deleting')}</>
                ) : (
                  t('admin1.kursus.delete')
                )}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function LoadingSkeleton() {
  return (
    <div className="space-y-3 animate-pulse">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="flex items-center gap-4 py-3 border-b border-border">
          <div className="flex-1 space-y-1">
            <div className="h-4 w-48 bg-surface-container-highest rounded" />
          </div>
          <div className="h-4 w-16 bg-surface-container-highest rounded" />
          <div className="h-4 w-16 bg-surface-container-highest rounded" />
          <div className="h-4 w-24 bg-surface-container-highest rounded" />
          <div className="h-5 w-16 bg-surface-container-highest rounded-full" />
          <div className="h-4 w-8 bg-surface-container-highest rounded" />
          <div className="flex gap-1">
            <div className="h-8 w-8 bg-surface-container-highest rounded" />
            <div className="h-8 w-8 bg-surface-container-highest rounded" />
          </div>
        </div>
      ))}
    </div>
  )
}
