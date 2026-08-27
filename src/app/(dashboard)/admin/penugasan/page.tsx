'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge, badgeVariants } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { createClient } from '@/lib/supabase-client'
import { useAuth } from '@/lib/auth-context'
import type { Assignment, Course, Language, LanguageLevel } from '@/types'
import type { VariantProps } from 'class-variance-authority'
import {
  Plus, ClipboardList, Clock, FileText, X, Loader2,
  Pencil, Trash2, CheckCircle2, AlertCircle, Info,
  BarChart3, Calendar, ChevronRight, Users,
} from 'lucide-react'
import Link from 'next/link'
import { useI18n } from '@/lib/i18n/client'
import { DashboardLayout } from '@/components/layout/dashboard-layout'

type BadgeVariant = VariantProps<typeof badgeVariants>['variant']

interface AssignmentWithCourse extends Assignment {
  course?: { title?: { id?: string; en?: string } }
}

const LOCALE_MAP: Record<string, string> = {
  en: 'en-US',
  id: 'id-ID',
  zh: 'zh-CN',
}

const statusConfig: Record<string, { labelKey: string; variant: BadgeVariant }> = {
  published: { labelKey: 'admin2.penugasan.statusPublished', variant: 'success' },
  draft: { labelKey: 'admin2.penugasan.statusDraft', variant: 'ghost' },
  closed: { labelKey: 'admin2.penugasan.statusClosed', variant: 'destructive' },
}

interface Toast {
  type: 'success' | 'error' | 'info'
  message: string
}

export default function AdminAssignmentsPage() {
  const { user, loading: authLoading } = useAuth()
  const supabase = createClient()
  const { t, lang } = useI18n()
  const locale = LOCALE_MAP[lang] || 'en-US'

  const [assignments, setAssignments] = useState<AssignmentWithCourse[]>([])
  const [courses, setCourses] = useState<Course[]>([])
  const [loading, setLoading] = useState(true)

  const [showModal, setShowModal] = useState(false)
  const [editing, setEditing] = useState<AssignmentWithCourse | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<AssignmentWithCourse | null>(null)
  const [levelMap, setLevelMap] = useState<Record<string, LanguageLevel>>({})
  const [languageMap, setLanguageMap] = useState<Record<string, Language>>({})
  const [submissionCounts, setSubmissionCounts] = useState<Record<string, number>>({})
  const [form, setForm] = useState({
    course_id: '',
    title: '',
    instructions: '',
    max_grade: 100,
    due_date: '',
  })
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [toast, setToast] = useState<Toast | null>(null)

  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 4500)
    return () => clearTimeout(t)
  }, [toast])

  useEffect(() => {
    if (authLoading || !user) return
    fetchCourses()
  }, [authLoading, user])

  function notify(type: Toast['type'], message: string) {
    setToast({ type, message })
  }

  function dueInfo(a: AssignmentWithCourse) {
    const now = Date.now()
    const diff = new Date(a.due_date).getTime() - now
    const startToday = new Date()
    startToday.setHours(0, 0, 0, 0)
    const startDue = new Date(a.due_date)
    startDue.setHours(0, 0, 0, 0)
    const days = Math.round((startDue.getTime() - startToday.getTime()) / 86400000)
    const date = a.due_date.slice(0, 10)
    if (diff < 0) return { text: t('admin2.penugasan.dueOverdue', { date }), variant: 'destructive' as const }
    if (days === 0) return { text: t('admin2.penugasan.dueToday'), variant: 'warning' as const }
    if (days === 1) return { text: t('admin2.penugasan.dueTomorrow', { date }), variant: 'warning' as const }
    return { text: t('admin2.penugasan.dueDays', { date, days }), variant: 'default' as const }
  }

  async function fetchCourses() {
    const { data } = await supabase
      .from('courses')
      .select('id, title, language_code, level_id')
      .order('created_at', { ascending: false })

    const courseList = (data || []) as Course[]
    setCourses(courseList)

    const [{ data: levels }, { data: langs }] = await Promise.all([
      supabase.from('language_levels').select('id, language_code, code, name'),
      supabase.from('languages').select('code, name, native_name, flag_emoji'),
    ])
    if (levels) setLevelMap(Object.fromEntries(levels.map(l => [l.id, l])))
    if (langs) setLanguageMap(Object.fromEntries(langs.map(l => [l.code, l])))

    if (courseList.length > 0) {
      setForm(prev => ({ ...prev, course_id: courseList[0].id }))
    }
    await fetchAssignments(courseList.map(c => c.id))
  }

  function getCourseLabel(c: Course): string {
    const titleEn = c.title?.en
    const titleId = c.title?.id
    const title = titleEn || titleId || t('admin2.penugasan.untitled')
    const lang = languageMap[c.language_code]
    const level = levelMap[c.level_id]
    const langName = lang?.name?.en || c.language_code?.toUpperCase() || ''
    const levelName = level?.name?.en || ''
    return `${title} (${langName} - ${levelName})`
  }

  function getCourseTitle(a: AssignmentWithCourse): string {
    const titleEn = a.course?.title?.en
    const titleId = a.course?.title?.id
    const title = titleEn || titleId || ''
    const course = courses.find(c => c.id === a.course_id)
    if (!title && course) return getCourseLabel(course)
    return title
  }

  async function fetchAssignments(courseIds?: string[]) {
    setLoading(true)
    const ids = courseIds || courses.map(c => c.id)
    if (ids.length === 0) {
      setAssignments([])
      setSubmissionCounts({})
      setLoading(false)
      return
    }

    const { data } = await supabase
      .from('assignments')
      .select('*, course:courses(title)')
      .in('course_id', ids)
      .order('created_at', { ascending: false })

    const assignmentList = (data || []) as AssignmentWithCourse[]
    setAssignments(assignmentList)

    const assignmentIds = assignmentList.map(a => a.id)
    const { data: subs } = assignmentIds.length > 0
      ? await supabase
          .from('submissions')
          .select('assignment_id')
          .in('assignment_id', assignmentIds)
      : { data: [] }

    const counts: Record<string, number> = {}
    ;(subs || []).forEach(s => {
      counts[s.assignment_id] = (counts[s.assignment_id] || 0) + 1
    })
    setSubmissionCounts(counts)
    setLoading(false)
  }

  function openCreateModal() {
    setEditing(null)
    setForm({
      course_id: courses[0]?.id || '',
      title: '',
      instructions: '',
      max_grade: 100,
      due_date: new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0],
    })
    setShowModal(true)
  }

  function openEditModal(a: AssignmentWithCourse) {
    setEditing(a)
    setForm({
      course_id: a.course_id,
      title: a.title,
      instructions: a.instructions || '',
      max_grade: a.max_grade,
      due_date: (a.due_date || '').slice(0, 10),
    })
    setShowModal(true)
  }

  async function handleSave() {
    if (!form.title.trim() || !form.course_id || !form.due_date) return
    setSaving(true)
    try {
      const payload = {
        course_id: form.course_id,
        teacher_id: null,
        title: form.title.trim(),
        instructions: form.instructions.trim() || null,
        max_grade: form.max_grade,
        due_date: new Date(form.due_date).toISOString(),
      }

      if (editing) {
        const { error } = await supabase
          .from('assignments')
          .update({ ...payload, updated_at: new Date().toISOString() })
          .eq('id', editing.id)
        if (error) throw error
        notify('success', t('admin2.penugasan.updatedToast', { title: payload.title }))
      } else {
        const { error } = await supabase
          .from('assignments')
          .insert({ ...payload, status: 'published' })
        if (error) throw error
        notify('success', t('admin2.penugasan.createdToast', { title: payload.title }))
      }

      setShowModal(false)
      await fetchAssignments()
    } catch (err: any) {
      console.error('Failed to save assignment', err)
      notify('error', err?.message || (editing ? t('admin2.penugasan.updateFailed') : t('admin2.penugasan.createFailed')))
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      const { error } = await supabase
        .from('assignments')
        .delete()
        .eq('id', deleteTarget.id)
      if (error) throw error
      setAssignments(prev => prev.filter(x => x.id !== deleteTarget.id))
      notify('success', t('admin2.penugasan.deletedToast', { title: deleteTarget.title }))
      setDeleteTarget(null)
    } catch (err) {
      console.error('Failed to delete assignment', err)
      notify('error', t('admin2.penugasan.deleteFailed'))
    } finally {
      setDeleting(false)
    }
  }

  if (authLoading) {
    return (
      <DashboardLayout role="admin">
        <div className="flex items-center justify-center min-h-[60vh]">
          <Loader2 className="h-8 w-8 text-indigo-400 animate-spin" />
        </div>
      </DashboardLayout>
    )
  }

  const total = assignments.length
  const published = assignments.filter(a => a.status === 'published').length
  const nearDue = assignments.filter(a => dueInfo(a).variant === 'warning').length
  const closed = assignments.filter(a => a.status === 'closed').length

  const stats = [
    { label: t('admin2.penugasan.statTotal'), value: total, icon: ClipboardList, iconClass: 'text-primary' },
    { label: t('admin2.penugasan.statPublished'), value: published, icon: FileText, iconClass: 'text-success' },
    { label: t('admin2.penugasan.statNearDue'), value: nearDue, icon: Clock, iconClass: 'text-warning' },
    { label: t('admin2.penugasan.statLocked'), value: closed, icon: BarChart3, iconClass: 'text-muted' },
  ]

  const toastIcon =
    toast?.type === 'success' ? CheckCircle2
      : toast?.type === 'error' ? AlertCircle
        : Info
  const toastIconClass =
    toast?.type === 'success' ? 'text-success'
      : toast?.type === 'error' ? 'text-destructive'
        : 'text-info'

  return (
    <DashboardLayout role="admin">
      <div className="space-y-6">
        {/* Toast notification */}
        {toast && (
          <div
            role="status"
            aria-live="polite"
            className="fixed right-4 top-4 z-[100] flex items-start gap-3 rounded-xl border border-border bg-surface-container-high px-4 py-3 shadow-lg animate-slide-up max-w-sm"
          >
            {(() => {
              const Icon = toastIcon
              return <Icon className={`h-5 w-5 shrink-0 mt-0.5 ${toastIconClass}`} />
            })()}
            <p className="text-sm text-on-surface">{toast.message}</p>
            <button
              onClick={() => setToast(null)}
              className="ml-2 text-muted hover:text-on-surface"
              aria-label={t('admin2.penugasan.closeNotif')}
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        )}

        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-on-surface">{t('admin2.penugasan.title')}</h1>
            <p className="text-on-surface-variant">{t('admin2.penugasan.subtitle')}</p>
          </div>
          <Button size="sm" onClick={openCreateModal}>
            <Plus className="mr-1 h-4 w-4" /> {t('admin2.penugasan.createBtn')}
          </Button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {stats.map(s => {
            const Icon = s.icon
            return (
              <Card key={s.label}>
                <CardContent className="flex items-center gap-3 p-4">
                  <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-surface-container-low ${s.iconClass}`}>
                    <Icon className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold leading-none text-on-surface">{s.value}</p>
                    <p className="mt-1 text-xs text-muted">{s.label}</p>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-6 w-6 text-indigo-400 animate-spin" />
          </div>
        ) : assignments.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-16">
              <ClipboardList className="h-10 w-10 text-muted mb-3" />
              <p className="text-sm text-on-surface-variant">{t('admin2.penugasan.empty')}</p>
              <Button size="sm" className="mt-4" onClick={openCreateModal}>
                <Plus className="mr-1 h-4 w-4" /> {t('admin2.penugasan.createFirst')}
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {assignments.map(a => {
              const status = statusConfig[a.status] ?? { labelKey: 'admin2.penugasan.statusUnknown', variant: 'ghost' as BadgeVariant }
              const due = dueInfo(a)
              const submitted = submissionCounts[a.id] || 0
              return (
                <Card key={a.id} className="overflow-hidden">
                  <CardContent className="p-5">
                    <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="text-base font-semibold text-on-surface">{a.title}</h3>
                          <Badge variant={status.variant}>{t(status.labelKey)}</Badge>
                        </div>

                        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted">
                          <span className="flex items-center gap-1">
                            <ClipboardList className="h-3 w-3" />
                            <span className="text-on-surface-variant">{getCourseTitle(a) || t('admin2.penugasan.noCourse')}</span>
                          </span>
                          <span className={`flex items-center gap-1 ${due.variant === 'destructive' ? 'text-destructive' : due.variant === 'warning' ? 'text-warning' : ''}`}>
                            <Clock className="h-3 w-3" /> {due.text}
                          </span>
                          <span className="flex items-center gap-1">
                            <Users className="h-3 w-3" /> {t('admin2.penugasan.submissionsCount', { count: submitted })}
                          </span>
                          <span className="flex items-center gap-1">
                            <BarChart3 className="h-3 w-3" /> {t('admin2.penugasan.maxGrade', { grade: a.max_grade })}
                          </span>
                          <span className="flex items-center gap-1">
                            <Calendar className="h-3 w-3" /> {t('admin2.penugasan.createdAt', { date: new Date(a.created_at).toLocaleDateString(locale) })}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <Link href={`/admin/penugasan/${a.id}/grading`}>
                          <Button size="sm" variant="secondary">
                            {t('admin2.penugasan.gradeBtn')} <ChevronRight className="h-3 w-3" />
                          </Button>
                        </Link>
                        <Button
                          size="sm"
                          variant="outline"
                          title={t('admin2.penugasan.editTitle')}
                          onClick={() => openEditModal(a)}
                        >
                          <Pencil className="h-3.5 w-3.5" /> {t('admin2.penugasan.editBtn')}
                        </Button>
                        <Button
                          size="sm"
                          variant="destructive"
                          title={t('admin2.penugasan.deleteTitle')}
                          onClick={() => setDeleteTarget(a)}
                        >
                          <Trash2 className="h-3.5 w-3.5" /> {t('admin2.penugasan.deleteBtn')}
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )
            })}
          </div>
        )}

        {/* Create / Edit modal */}
        {showModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
            <div className="w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-xl border border-border bg-surface p-6 shadow-xl">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-lg font-semibold text-on-surface">
                  {editing ? t('admin2.penugasan.modalEditTitle') : t('admin2.penugasan.modalCreateTitle')}
                </h2>
                <button onClick={() => setShowModal(false)} className="text-muted hover:text-on-surface" aria-label={t('admin2.penugasan.close')}>
                  <X className="h-5 w-5" />
                </button>
              </div>

              <div className="space-y-4">
                <div>
                  <Label required>{t('admin2.penugasan.courseLabel')}</Label>
                  <select
                    className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-on-surface focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
                    value={form.course_id}
                    onChange={(e) => setForm({ ...form, course_id: e.target.value })}
                  >
                    {courses.map((c) => (
                      <option key={c.id} value={c.id}>
                        {getCourseLabel(c)}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <Label required>{t('admin2.penugasan.titleLabel')}</Label>
                  <Input
                    value={form.title}
                    onChange={(e) => setForm({ ...form, title: e.target.value })}
                    placeholder={t('admin2.penugasan.titlePlaceholder')}
                  />
                </div>

                <div>
                  <Label>{t('admin2.penugasan.instructionsLabel')}</Label>
                  <Textarea
                    value={form.instructions}
                    onChange={(e) => setForm({ ...form, instructions: e.target.value })}
                    placeholder={t('admin2.penugasan.instructionsPlaceholder')}
                    className="min-h-[100px]"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label required>{t('admin2.penugasan.maxGradeLabel')}</Label>
                    <Input
                      type="number"
                      min={1}
                      value={form.max_grade}
                      onChange={(e) => setForm({ ...form, max_grade: parseInt(e.target.value) || 1 })}
                    />
                  </div>
                  <div>
                    <Label required>{t('admin2.penugasan.dueDateLabel')}</Label>
                    <Input
                      type="date"
                      value={form.due_date}
                      onChange={(e) => setForm({ ...form, due_date: e.target.value })}
                    />
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 mt-6 pt-4 border-t border-border">
                <Button variant="outline" onClick={() => setShowModal(false)}>{t('admin2.penugasan.cancel')}</Button>
                <Button onClick={handleSave} loading={saving} disabled={!form.title.trim() || !form.due_date}>
                  {saving ? t('admin2.penugasan.saving') : editing ? t('admin2.penugasan.saveChanges') : t('admin2.penugasan.createBtn')}
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Delete confirmation modal */}
        {deleteTarget && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
            <div className="w-full max-w-md rounded-xl border border-border bg-surface p-6 shadow-xl">
              <div className="flex items-center gap-3 mb-4">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-destructive-soft text-destructive">
                  <Trash2 className="h-5 w-5" />
                </div>
                <h2 className="text-lg font-semibold text-on-surface">{t('admin2.penugasan.deleteModalTitle')}</h2>
              </div>
              <p className="text-sm text-on-surface-variant">
                {t('admin2.penugasan.deleteModalDescPrefix')}{' '}
                <span className="font-medium text-on-surface">&quot;{deleteTarget.title}&quot;</span>{' '}
                {t('admin2.penugasan.deleteModalDescSuffix')}
              </p>
              <div className="flex items-center justify-end gap-2 mt-6 pt-4 border-t border-border">
                <Button variant="outline" onClick={() => setDeleteTarget(null)}>{t('admin2.penugasan.cancel')}</Button>
                <Button
                  variant="destructive"
                  onClick={handleDelete}
                  loading={deleting}
                >
                  {deleting ? t('admin2.penugasan.deleting') : t('admin2.penugasan.confirmDelete')}
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  )
}