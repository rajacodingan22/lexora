'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase-client'
import { useAuth } from '@/lib/auth-context'
import { useI18n } from '@/lib/i18n/client'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { formatDate } from '@/lib/utils'
import FilePreviewModal from '@/components/shared/file-preview-modal'
import type { Assignment, Submission, Course } from '@/types'
import {
  ClipboardList, Plus, Pencil, Trash2, X, Users, ChevronDown, ChevronUp,
  FileText, Video, Type, CheckCircle, Clock, AlertTriangle,
} from 'lucide-react'

type AssignmentRow = Assignment & { course?: { title?: { en?: string; id?: string } } | null }
type SubmissionRow = Submission & { user?: { display_name?: string | null } | null }

const KIND_OPTIONS = ['file', 'video', 'text_inline'] as const
const FILE_TYPE_PRESETS: Record<string, string[]> = {
  file: ['pdf', 'doc', 'docx', 'ppt', 'pptx', 'png', 'jpg'],
  video: ['mp4', 'mov', 'webm'],
  text_inline: [],
}
const ALL_FILE_TYPES = ['pdf', 'doc', 'docx', 'ppt', 'pptx', 'xls', 'xlsx', 'png', 'jpg', 'mp4', 'mov', 'webm']

function drivePreviewUrl(link: string | null): string | null {
  if (!link) return null
  const m = link.match(/\/file\/d\/([^/]+)/)
  return m ? `https://drive.google.com/file/d/${m[1]}/preview` : null
}

function tempCountdown(expiresAt: string | null, t: (k: string, p?: Record<string, string | number>) => string): string {
  if (!expiresAt) return ''
  const ms = new Date(expiresAt).getTime() - Date.now()
  if (ms <= 0) return t('teacher2.penugasan.expired')
  const h = Math.floor(ms / 3600000)
  const m = Math.floor((ms % 3600000) / 60000)
  return t('teacher2.penugasan.expiresIn', { h, m })
}

export default function TeacherAssignmentsPage() {
  const supabase = createClient()
  const { user, loading: authLoading } = useAuth()
  const { t, lang } = useI18n()
  const locale = lang === 'en' ? 'en-US' : lang === 'zh' ? 'zh-CN' : 'id-ID'

  const [teacherId, setTeacherId] = useState<string | null>(null)
  const [courses, setCourses] = useState<Course[]>([])
  const [assignments, setAssignments] = useState<AssignmentRow[]>([])
  const [submissionCounts, setSubmissionCounts] = useState<Record<string, number>>({})
  const [ungradedCounts, setUngradedCounts] = useState<Record<string, number>>({})
  const [loading, setLoading] = useState(true)

  const [showModal, setShowModal] = useState(false)
  const [editing, setEditing] = useState<AssignmentRow | null>(null)
  const [form, setForm] = useState({
    course_id: '',
    title: '',
    instructions: '',
    submission_kind: 'file' as 'file' | 'video' | 'text_inline',
    allowed_file_types: ['pdf'] as string[],
    max_grade: 100,
    due_date: new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0],
    resubmission_allowed: false,
    status: 'published',
  })
  const [saving, setSaving] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<AssignmentRow | null>(null)
  const [deleting, setDeleting] = useState(false)

  const [expanded, setExpanded] = useState<string | null>(null)
  const [submissions, setSubmissions] = useState<Record<string, SubmissionRow[]>>({})
  const [loadingSubs, setLoadingSubs] = useState(false)
  const [gradeInputs, setGradeInputs] = useState<Record<string, { grade: string; feedback: string }>>({})
  const [savingGrade, setSavingGrade] = useState<Record<string, boolean>>({})
  const [preview, setPreview] = useState<{ url: string; title: string; video?: boolean } | null>(null)
  const [toast, setToast] = useState<string | null>(null)

  useEffect(() => {
    if (authLoading || !user) return
    fetchData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, user])

  useEffect(() => {
    if (!toast) return
    const id = setTimeout(() => setToast(null), 4000)
    return () => clearTimeout(id)
  }, [toast])

  async function fetchData() {
    setLoading(true)
    const { data: teacherRow } = await supabase
      .from('teachers')
      .select('id')
      .eq('user_id', user!.id)
      .maybeSingle()
    if (!teacherRow) { setLoading(false); return }
    setTeacherId((teacherRow as { id: string }).id)

    const { data: ctRows } = await supabase
      .from('course_teachers')
      .select('course_id')
      .eq('teacher_id', (teacherRow as { id: string }).id)
    const courseIds = ((ctRows || []) as { course_id: string }[]).map(r => r.course_id)
    if (courseIds.length === 0) { setCourses([]); setAssignments([]); setLoading(false); return }

    const { data: courseData } = await supabase
      .from('courses')
      .select('id, title, language_code, level_id')
      .in('id', courseIds)
      .order('created_at', { ascending: false })
    setCourses((courseData || []) as Course[])

    const { data: asgData } = await supabase
      .from('assignments')
      .select('*, course:courses(title)')
      .in('course_id', courseIds)
      .order('created_at', { ascending: false })
    const list = (asgData || []) as AssignmentRow[]
    setAssignments(list)

    const ids = list.map(a => a.id)
    if (ids.length > 0) {
      const { data: subs } = await supabase
        .from('submissions')
        .select('assignment_id, grade')
        .in('assignment_id', ids)
      const counts: Record<string, number> = {}
      const ungraded: Record<string, number> = {}
      ;((subs || []) as { assignment_id: string; grade: number | null }[]).forEach(s => {
        counts[s.assignment_id] = (counts[s.assignment_id] || 0) + 1
        if (s.grade == null) ungraded[s.assignment_id] = (ungraded[s.assignment_id] || 0) + 1
      })
      setSubmissionCounts(counts)
      setUngradedCounts(ungraded)
    }
    setLoading(false)
  }

  function openCreate() {
    setEditing(null)
    setForm({
      course_id: courses[0]?.id || '',
      title: '',
      instructions: '',
      submission_kind: 'file',
      allowed_file_types: ['pdf'],
      max_grade: 100,
      due_date: new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0],
      resubmission_allowed: false,
      status: 'published',
    })
    setShowModal(true)
  }

  function openEdit(a: AssignmentRow) {
    setEditing(a)
    setForm({
      course_id: a.course_id,
      title: a.title,
      instructions: (a as { instructions?: string }).instructions || '',
      submission_kind: a.submission_kind || 'file',
      allowed_file_types: a.allowed_file_types?.length ? a.allowed_file_types : [...(FILE_TYPE_PRESETS[a.submission_kind || 'file'] || ['pdf'])],
      max_grade: Number(a.max_grade) || 100,
      due_date: (a.due_date || '').slice(0, 10),
      resubmission_allowed: !!a.resubmission_allowed,
      status: a.status || 'published',
    })
    setShowModal(true)
  }

  function toggleFileType(ext: string) {
    setForm(prev => ({
      ...prev,
      allowed_file_types: prev.allowed_file_types.includes(ext)
        ? prev.allowed_file_types.filter(x => x !== ext)
        : [...prev.allowed_file_types, ext],
    }))
  }

  async function handleSave() {
    if (!form.title.trim() || !form.course_id || !form.due_date || !teacherId) return
    if (form.submission_kind !== 'text_inline' && form.allowed_file_types.length === 0) {
      setToast(t('teacher2.penugasan.needFileType'))
      return
    }
    setSaving(true)
    try {
      const payload = {
        course_id: form.course_id,
        teacher_id: teacherId,
        title: form.title.trim(),
        instructions: form.instructions.trim() || null,
        submission_kind: form.submission_kind,
        allowed_file_types: form.submission_kind === 'text_inline' ? [] : form.allowed_file_types,
        max_grade: form.max_grade,
        due_date: new Date(form.due_date).toISOString(),
        resubmission_allowed: form.resubmission_allowed,
        status: form.status,
      }
      if (editing) {
        const { error } = await supabase.from('assignments').update(payload).eq('id', editing.id)
        if (error) throw error
      } else {
        const { error } = await supabase.from('assignments').insert(payload)
        if (error) throw error
      }
      setShowModal(false)
      setToast(t('teacher2.penugasan.saved'))
      fetchData()
    } catch (e) {
      console.error('save assignment', e)
      setToast(t('teacher2.penugasan.saveFailed'))
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      const { error } = await supabase.from('assignments').delete().eq('id', deleteTarget.id)
      if (error) throw error
      setDeleteTarget(null)
      setToast(t('teacher2.penugasan.deleted'))
      fetchData()
    } catch (e) {
      console.error('delete assignment', e)
      setToast(t('teacher2.penugasan.deleteFailed'))
    } finally {
      setDeleting(false)
    }
  }

  async function toggleExpand(a: AssignmentRow) {
    if (expanded === a.id) { setExpanded(null); return }
    setExpanded(a.id)
    if (submissions[a.id]) return
    setLoadingSubs(true)
    const { data } = await supabase
      .from('submissions')
      .select('*, user:users!submissions_user_id_fkey(display_name)')
      .eq('assignment_id', a.id)
      .order('submitted_at', { ascending: false })
    const list = (data || []) as SubmissionRow[]
    setSubmissions(prev => ({ ...prev, [a.id]: list }))
    const gi: Record<string, { grade: string; feedback: string }> = {}
    list.forEach(s => {
      gi[s.id] = { grade: s.grade != null ? String(s.grade) : '', feedback: s.feedback || '' }
    })
    setGradeInputs(prev => ({ ...prev, ...gi }))
    setLoadingSubs(false)
  }

  async function handleGrade(s: SubmissionRow, maxGrade: number) {
    const inp = gradeInputs[s.id]
    if (!inp || inp.grade.trim() === '') return
    const val = Number(inp.grade)
    if (Number.isNaN(val) || val < 0 || val > maxGrade) {
      setToast(t('teacher2.penugasan.gradeRange', { max: maxGrade }))
      return
    }
    setSavingGrade(prev => ({ ...prev, [s.id]: true }))
    try {
      const { error } = await supabase
        .from('submissions')
        .update({
          grade: val,
          feedback: inp.feedback.trim() || null,
          status: 'graded',
          graded_by: user!.id,
          graded_at: new Date().toISOString(),
        })
        .eq('id', s.id)
      if (error) throw error
      setSubmissions(prev => ({
        ...prev,
        [s.assignment_id]: (prev[s.assignment_id] || []).map(x =>
          x.id === s.id ? { ...x, grade: val, feedback: inp.feedback.trim() || null, status: 'graded' } : x,
        ),
      }))
      setToast(t('teacher2.penugasan.graded'))
      fetchData()
    } catch (e) {
      console.error('grade submission', e)
      setToast(t('teacher2.penugasan.gradeFailed'))
    } finally {
      setSavingGrade(prev => ({ ...prev, [s.id]: false }))
    }
  }

  function openPreview(s: SubmissionRow) {
    if (s.drive_file_id && s.drive_link) {
      const pv = drivePreviewUrl(s.drive_link)
      const isVideo = /\.(mp4|mov|webm)$/i.test(s.file_name || '') || (s.file_name || '').toLowerCase().includes('video')
      if (pv && (isVideo || true)) {
        setPreview({ url: pv, title: s.file_name || 'Drive file', video: true })
        return
      }
    }
    setPreview({ url: `/api/submissions/${s.id}/content`, title: s.file_name || s.id })
  }

  function courseTitle(a: AssignmentRow): string {
    return a.course?.title?.en || a.course?.title?.id || courses.find(c => c.id === a.course_id)?.title?.en || ''
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin h-8 w-8 border-2 border-indigo-500 border-t-transparent rounded-full" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-on-surface">{t('teacher2.penugasan.title')}</h1>
          <p className="text-sm text-muted">{t('teacher2.penugasan.subtitle')}</p>
        </div>
        <Button onClick={openCreate} disabled={courses.length === 0}>
          <Plus className="h-4 w-4 mr-1" /> {t('teacher2.penugasan.create')}
        </Button>
      </div>

      {courses.length === 0 && (
        <Card><CardContent className="py-10 text-center text-sm text-muted">{t('teacher2.penugasan.noCourse')}</CardContent></Card>
      )}

      {assignments.map(a => (
        <Card key={a.id}>
          <CardHeader>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <CardTitle className="text-base flex items-center gap-2 flex-wrap">
                  {a.submission_kind === 'video'
                    ? <Video className="h-4 w-4 text-sky-400" />
                    : a.submission_kind === 'text_inline'
                      ? <Type className="h-4 w-4 text-emerald-400" />
                      : <FileText className="h-4 w-4 text-indigo-400" />}
                  <span className="truncate">{a.title}</span>
                </CardTitle>
                <p className="text-xs text-muted mt-1">
                  {courseTitle(a)} · {t('teacher2.penugasan.due')} {a.due_date ? formatDate(a.due_date, locale) : '-'} · {t('teacher2.penugasan.maxGrade', { grade: a.max_grade })}
                </p>
                <div className="flex gap-1.5 mt-2 flex-wrap">
                  <Badge variant={a.status === 'published' ? 'success' : 'warning'}>{a.status}</Badge>
                  <Badge variant="outline">
                    {a.submission_kind === 'video' ? t('teacher2.penugasan.kindVideo') : a.submission_kind === 'text_inline' ? t('teacher2.penugasan.kindText') : t('teacher2.penugasan.kindFile', { types: (a.allowed_file_types || []).join(', ').toUpperCase() })}
                  </Badge>
                  <Badge variant="outline"><Users className="h-3 w-3 mr-1" />{submissionCounts[a.id] || 0}</Badge>
                  {(ungradedCounts[a.id] || 0) > 0 && (
                    <Badge variant="warning"><Clock className="h-3 w-3 mr-1" />{t('teacher2.penugasan.ungraded', { n: ungradedCounts[a.id] })}</Badge>
                  )}
                </div>
              </div>
              <div className="flex gap-1.5 shrink-0">
                <Button variant="ghost" size="sm" onClick={() => openEdit(a)}><Pencil className="h-4 w-4" /></Button>
                <Button variant="ghost" size="sm" onClick={() => setDeleteTarget(a)}><Trash2 className="h-4 w-4 text-red-400" /></Button>
                <Button variant="outline" size="sm" onClick={() => toggleExpand(a)}>
                  {expanded === a.id ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                  {t('teacher2.penugasan.grade')}
                </Button>
              </div>
            </div>
          </CardHeader>

          {expanded === a.id && (
            <CardContent className="space-y-3 border-t border-border pt-4">
              {loadingSubs && !(submissions[a.id]) ? (
                <p className="text-sm text-muted">{t('teacher2.penugasan.loadingSubs')}</p>
              ) : (submissions[a.id] || []).length === 0 ? (
                <p className="text-sm text-muted">{t('teacher2.penugasan.noSubs')}</p>
              ) : (
                (submissions[a.id] || []).map(s => (
                  <div key={s.id} className="rounded-lg border border-border bg-surface-container-low p-3 space-y-2">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-on-surface truncate">{s.user?.display_name || s.user_id.slice(0, 8)}</p>
                        <p className="text-xs text-muted">
                          {s.submitted_at ? formatDate(s.submitted_at, locale) : ''} · {s.storage_kind === 'drive' ? 'Drive' : t('teacher2.penugasan.tempFile')}
                          {s.storage_kind === 'temp' && !s.purged_at && s.grade == null && s.expires_at && (
                            <span className="ml-1 text-amber-400"><AlertTriangle className="h-3 w-3 inline mr-0.5" />{tempCountdown(s.expires_at, t)}</span>
                          )}
                          {s.purged_at && <span className="ml-1">· {t('teacher2.penugasan.purged')}</span>}
                        </p>
                      </div>
                      {(s.drive_file_id || s.file_url) && !s.purged_at && (
                        <Button variant="ghost" size="sm" onClick={() => openPreview(s)}>{t('teacher2.penugasan.preview')}</Button>
                      )}
                    </div>
                    {s.answer_text && (
                      <p className="text-sm text-on-surface-variant whitespace-pre-wrap rounded bg-background p-2 max-h-32 overflow-auto">{s.answer_text}</p>
                    )}
                    <div className="flex gap-2 items-end flex-wrap">
                      <label className="text-xs text-muted">
                        {t('teacher2.penugasan.gradeLabel', { max: a.max_grade })}
                        <input
                          type="number" min={0} max={Number(a.max_grade)}
                          value={gradeInputs[s.id]?.grade ?? ''}
                          onChange={e => setGradeInputs(prev => ({ ...prev, [s.id]: { grade: e.target.value, feedback: prev[s.id]?.feedback ?? '' } }))}
                          className="ml-2 w-20 rounded border border-border bg-background px-2 py-1 text-sm text-on-surface"
                        />
                      </label>
                      <label className="text-xs text-muted flex-1 min-w-[180px]">
                        {t('teacher2.penugasan.feedbackLabel')}
                        <input
                          value={gradeInputs[s.id]?.feedback ?? ''}
                          onChange={e => setGradeInputs(prev => ({ ...prev, [s.id]: { grade: prev[s.id]?.grade ?? '', feedback: e.target.value } }))}
                          className="ml-2 w-full rounded border border-border bg-background px-2 py-1 text-sm text-on-surface"
                        />
                      </label>
                      <Button size="sm" disabled={!!savingGrade[s.id]} onClick={() => handleGrade(s, Number(a.max_grade))}>
                        {s.grade != null ? <CheckCircle className="h-4 w-4 mr-1" /> : null}
                        {savingGrade[s.id] ? '...' : t('teacher2.penugasan.saveGrade')}
                      </Button>
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          )}
        </Card>
      ))}

      {assignments.length === 0 && courses.length > 0 && (
        <Card>
          <CardContent className="py-12 text-center">
            <ClipboardList className="h-10 w-10 mx-auto text-muted mb-3" />
            <p className="text-sm text-muted">{t('teacher2.penugasan.empty')}</p>
          </CardContent>
        </Card>
      )}

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={() => setShowModal(false)}>
          <div className="w-full max-w-lg max-h-[90vh] overflow-auto rounded-2xl bg-slate-900 p-5 space-y-4" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-white">{editing ? t('teacher2.penugasan.editTitle') : t('teacher2.penugasan.createTitle')}</h2>
              <button onClick={() => setShowModal(false)} className="text-white/40 hover:text-white"><X className="h-5 w-5" /></button>
            </div>
            <label className="block text-xs text-white/60">
              {t('teacher2.penugasan.courseLabel')}
              <select value={form.course_id} onChange={e => setForm({ ...form, course_id: e.target.value })} className="mt-1 w-full rounded border border-white/10 bg-slate-800 px-2 py-2 text-sm text-white">
                {courses.map(c => <option key={c.id} value={c.id}>{c.title?.en || c.title?.id}</option>)}
              </select>
            </label>
            <label className="block text-xs text-white/60">
              {t('teacher2.penugasan.titleLabel')}
              <input value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} className="mt-1 w-full rounded border border-white/10 bg-slate-800 px-2 py-2 text-sm text-white" />
            </label>
            <label className="block text-xs text-white/60">
              {t('teacher2.penugasan.instructionsLabel')}
              <textarea value={form.instructions} onChange={e => setForm({ ...form, instructions: e.target.value })} rows={3} className="mt-1 w-full rounded border border-white/10 bg-slate-800 px-2 py-2 text-sm text-white" />
            </label>
            <div className="text-xs text-white/60">
              {t('teacher2.penugasan.kindLabel')}
              <div className="mt-1 flex gap-2">
                {KIND_OPTIONS.map(k => (
                  <button
                    key={k}
                    type="button"
                    onClick={() => setForm({ ...form, submission_kind: k, allowed_file_types: [...(FILE_TYPE_PRESETS[k] || [])] })}
                    className={`flex-1 rounded-lg border px-2 py-2 text-sm ${form.submission_kind === k ? 'border-indigo-400 bg-indigo-500/20 text-white' : 'border-white/10 text-white/60'}`}
                  >
                    {k === 'video' ? t('teacher2.penugasan.kindVideo') : k === 'text_inline' ? t('teacher2.penugasan.kindText') : t('teacher2.penugasan.kindFileShort')}
                  </button>
                ))}
              </div>
            </div>
            {form.submission_kind !== 'text_inline' && (
              <div className="text-xs text-white/60">
                {t('teacher2.penugasan.typesLabel')}
                <div className="mt-1 flex flex-wrap gap-1.5">
                  {ALL_FILE_TYPES.map(ext => (
                    <button
                      key={ext}
                      type="button"
                      onClick={() => toggleFileType(ext)}
                      className={`rounded border px-2 py-1 text-xs uppercase ${form.allowed_file_types.includes(ext) ? 'border-indigo-400 bg-indigo-500/20 text-white' : 'border-white/10 text-white/50'}`}
                    >
                      {ext}
                    </button>
                  ))}
                </div>
              </div>
            )}
            <div className="grid grid-cols-2 gap-3">
              <label className="block text-xs text-white/60">
                {t('teacher2.penugasan.maxGradeLabel')}
                <input type="number" min={1} value={form.max_grade} onChange={e => setForm({ ...form, max_grade: Number(e.target.value) })} className="mt-1 w-full rounded border border-white/10 bg-slate-800 px-2 py-2 text-sm text-white" />
              </label>
              <label className="block text-xs text-white/60">
                {t('teacher2.penugasan.dueLabel')}
                <input type="date" value={form.due_date} onChange={e => setForm({ ...form, due_date: e.target.value })} className="mt-1 w-full rounded border border-white/10 bg-slate-800 px-2 py-2 text-sm text-white" />
              </label>
            </div>
            <div className="flex items-center gap-4 text-xs text-white/70">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={form.resubmission_allowed} onChange={e => setForm({ ...form, resubmission_allowed: e.target.checked })} />
                {t('teacher2.penugasan.resubmitLabel')}
              </label>
              <label className="flex items-center gap-2">
                {t('teacher2.penugasan.statusLabel')}
                <select value={form.status} onChange={e => setForm({ ...form, status: e.target.value })} className="rounded border border-white/10 bg-slate-800 px-2 py-1 text-sm text-white">
                  <option value="draft">draft</option>
                  <option value="published">published</option>
                  <option value="closed">closed</option>
                </select>
              </label>
            </div>
            <Button className="w-full" disabled={saving} onClick={handleSave}>
              {saving ? '...' : t('teacher2.penugasan.save')}
            </Button>
          </div>
        </div>
      )}

      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={() => setDeleteTarget(null)}>
          <div className="w-full max-w-sm rounded-2xl bg-slate-900 p-5 space-y-4" onClick={e => e.stopPropagation()}>
            <p className="text-sm text-white">{t('teacher2.penugasan.deleteConfirm', { title: deleteTarget.title })}</p>
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => setDeleteTarget(null)}>{t('teacher2.penugasan.cancel')}</Button>
              <Button variant="destructive" className="flex-1" disabled={deleting} onClick={handleDelete}>{deleting ? '...' : t('teacher2.penugasan.delete')}</Button>
            </div>
          </div>
        </div>
      )}

      {preview && (
        preview.video
          ? (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={() => setPreview(null)}>
              <div className="w-full max-w-3xl overflow-hidden rounded-2xl bg-slate-900" onClick={e => e.stopPropagation()}>
                <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
                  <p className="text-sm font-medium text-white truncate">{preview.title}</p>
                  <button onClick={() => setPreview(null)} className="text-white/40 hover:text-white"><X className="h-5 w-5" /></button>
                </div>
                <iframe src={preview.url} className="h-[60vh] w-full border-0" title={preview.title} allow="autoplay" />
              </div>
            </div>
          )
          : <FilePreviewModal url={preview.url} title={preview.title} onClose={() => setPreview(null)} />
      )}

      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 rounded-lg bg-slate-800 border border-white/10 px-4 py-2 text-sm text-white shadow-xl">
          {toast}
        </div>
      )}
    </div>
  )
}
