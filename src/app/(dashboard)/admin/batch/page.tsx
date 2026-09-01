'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase-client'
import { useI18n } from '@/lib/i18n/client'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Label } from '@/components/ui/label'
import {
  Plus, ChevronDown, ChevronRight, Loader2, Pencil, Trash2, X, Users, CalendarDays, GraduationCap, ExternalLink, AlertTriangle
} from 'lucide-react'

interface Course {
  id: string
  title: { id: string; en: string }
  language_code: string
  program_id: string
}

interface Batch {
  id: string
  course_id: string
  name: string
  code: string | null
  capacity: number
  enrolled: number
  start_date: string
  end_date: string
  status: string
  teacher_id: string | null
  zoom_link: string | null
}

interface TeacherOption {
  id: string
  user_id: string
  display_name: string
}

interface BatchForm {
  course_id: string
  name: string
  code: string
  capacity: number
  start_date: string
  end_date: string
  status: string
  zoom_link: string
}

const emptyForm: BatchForm = { course_id: '', name: '', code: '', capacity: 20, start_date: '', end_date: '', status: 'active', zoom_link: '' }

export default function AdminBatchPage() {
  const { t } = useI18n()
  const supabase = createClient()
  const [courses, setCourses] = useState<Course[]>([])
  const [batchesMap, setBatchesMap] = useState<Record<string, Batch[]>>({})
  const [loading, setLoading] = useState(true)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [showCreate, setShowCreate] = useState(false)
  const [editingBatch, setEditingBatch] = useState<Batch | null>(null)
  const [form, setForm] = useState<BatchForm>(emptyForm)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')
  const [deleteError, setDeleteError] = useState('')
  const [teachers, setTeachers] = useState<TeacherOption[]>([])
  const [assigning, setAssigning] = useState<Record<string, string>>({})

  useEffect(() => { fetchData() }, [])

  async function fetchData() {
    setLoading(true)
    try {
      const { data: coursesData } = await supabase
        .from('courses')
        .select('id, title, language_code, program_id')
        .order('created_at', { ascending: false })
      if (coursesData) {
        setCourses(coursesData as Course[])
        const courseIds = coursesData.map(c => c.id)

        let batchesData: any[] = []
        if (courseIds.length > 0) {
          // Batch-fetch batches for all courses
          const { data } = await supabase
            .from('batches')
            .select('*')
            .in('course_id', courseIds)
            .order('start_date', { ascending: false })
          batchesData = data || []
        }

        const batchIds = (batchesData || []).map((b: any) => b.id)

        // Batch-fetch enrollment counts for all batches
        const enrollmentCounts: Record<string, number> = {}
        if (batchIds.length > 0) {
          const { data: enrollData } = await supabase
            .from('enrollments')
            .select('batch_id')
            .in('batch_id', batchIds)
          for (const e of (enrollData || [])) {
            enrollmentCounts[e.batch_id] = (enrollmentCounts[e.batch_id] || 0) + 1
          }
        }

        const map: Record<string, Batch[]> = {}
        for (const c of coursesData) {
          const courseBatches = (batchesData || [])
            .filter((b: any) => b.course_id === c.id)
            .map((b: any) => ({
              ...b,
              enrolled: enrollmentCounts[b.id] || 0,
            })) as Batch[]
          map[c.id] = courseBatches
        }
        setBatchesMap(map)
      }

      const { data: teacherUsers } = await supabase
        .from('users')
        .select('id, display_name')
        .eq('role', 'teacher')
        .order('created_at', { ascending: false })
      if (teacherUsers && teacherUsers.length > 0) {
        const teacherIds = teacherUsers.map(u => u.id)
        const { data: teacherRows } = await supabase
          .from('teachers')
          .select('id, user_id')
          .in('user_id', teacherIds)
        const userMap = new Map((teacherUsers || []).map(u => [u.id, u.display_name]))
        setTeachers(
          ((teacherRows || []) as { id: string; user_id: string }[])
            .map(t => ({ id: t.id, user_id: t.user_id, display_name: userMap.get(t.user_id) || '—' }))
        )
      } else {
        setTeachers([])
      }
    } catch (err) {
      console.error('Failed to fetch data:', err)
      setCourses([])
      setBatchesMap({})
    }
    setLoading(false)
  }

  function openCreate() {
    setForm(emptyForm)
    setEditingBatch(null)
    setSaveError('')
    setDeleteError('')
    setShowCreate(true)
  }

  function openCreateForCourse(courseId: string) {
    setForm({ ...emptyForm, course_id: courseId })
    setEditingBatch(null)
    setSaveError('')
    setDeleteError('')
    setShowCreate(true)
  }

  function openEdit(batch: Batch) {
    setForm({
      course_id: batch.course_id,
      name: batch.name,
      code: batch.code ?? '',
      capacity: batch.capacity,
      start_date: (batch.start_date || '').slice(0, 10),
      end_date: (batch.end_date || '').slice(0, 10),
      status: batch.status,
      zoom_link: batch.zoom_link ?? '',
    })
    setEditingBatch(batch)
    setSaveError('')
    setDeleteError('')
    setShowCreate(true)
  }

  async function handleSave() {
    setSaving(true)
    setSaveError('')
    if (editingBatch) {
      const { error } = await supabase
        .from('batches')
        .update({
          name: form.name,
          code: form.code || null,
          capacity: form.capacity,
          start_date: form.start_date,
          end_date: form.end_date,
          status: form.status,
          zoom_link: form.zoom_link || null,
        })
        .eq('id', editingBatch.id)
      if (error) {
        setSaveError(error.message)
        setSaving(false)
        return
      }
    } else {
      const { error } = await supabase
        .from('batches')
        .insert({
          course_id: form.course_id,
          name: form.name,
          code: form.code || null,
          capacity: form.capacity,
          start_date: form.start_date,
          end_date: form.end_date,
          status: 'active',
          zoom_link: form.zoom_link || null,
        })
      if (error) {
        setSaveError(error.message)
        setSaving(false)
        return
      }
    }
    setSaving(false)
    setShowCreate(false)
    fetchData()
  }

  async function handleDelete(batch: Batch) {
    if (batch.enrolled > 0) return
    if (!confirm(t('admin1.batch.deleteConfirm', { name: batch.name }))) return
    setDeleteError('')
    const { error } = await supabase.from('batches').delete().eq('id', batch.id)
    if (error) {
      setDeleteError(error.message)
      return
    }
    fetchData()
  }

  async function handleComplete(batch: Batch) {
    if (!confirm(t('admin1.batch.completeConfirm', { name: batch.name }))) return
    setDeleteError('')
    const { error } = await supabase.rpc('complete_batch', { p_batch_id: batch.id })
    if (error) {
      setDeleteError(error.message)
      return
    }
    fetchData()
  }

  async function handleAssignTeacher(batch: Batch, teacherId: string) {
    if (!teacherId || !teachers.length) return
    setAssigning(prev => ({ ...prev, [batch.id]: teacherId }))
    setDeleteError('')
    const { error } = await supabase.from('batches').update({ teacher_id: teacherId }).eq('id', batch.id)
    if (error) {
      setDeleteError(error.message)
      setAssigning(prev => { const next = { ...prev }; delete next[batch.id]; return next })
      return
    }
    const teacher = teachers.find(t => t.id === teacherId)
    const courseName = getCourseName(batch.course_id)
    if (teacher) {
      const { error: notifError } = await supabase.from('notifications').insert({
        user_id: teacher.user_id,
        type: 'info',
        template_key: 'batchAssigned',
        params: { batch: batch.name, course: courseName, batchId: batch.id, courseId: batch.course_id },
        title: `New Batch Assigned — ${batch.name}`,
        body: `Batch "${batch.name}" for course "${courseName}" is ready. Open your class to start teaching.`,
        link: `/teacher/kelas?courseId=${batch.course_id}&batchId=${batch.id}`,
        is_read: false,
      })
      if (notifError) {
        setDeleteError(t('admin1.batch.assignNotifError', { message: notifError.message }))
      }
    }
    setAssigning(prev => { const next = { ...prev }; delete next[batch.id]; return next })
    fetchData()
  }

  function statusVariant(status: string): 'default' | 'success' | 'warning' | 'destructive' | 'outline' {
    if (status === 'active') return 'success'
    if (status === 'upcoming') return 'default'
    if (status === 'completed') return 'outline'
    return 'warning'
  }

  function getCourseName(courseId: string) {
    const c = courses.find(c => c.id === courseId)
    if (!c) return t('admin1.batch.unknownCourse')
    const title = c.title
    return typeof title === 'object' ? (title.en || title.id) : title
  }

  const filteredCourses = courses

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-on-surface">{t('admin1.batch.title')}</h1>
          <p className="text-on-surface-variant">{t('admin1.batch.subtitle')}</p>
        </div>
        <Button size="sm" onClick={openCreate}><Plus className="mr-1 h-4 w-4" /> {t('admin1.batch.create')}</Button>
      </div>

      {deleteError && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-2 text-sm text-destructive">
          {deleteError}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-20 text-muted">
          <Loader2 className="h-5 w-5 animate-spin mr-2" /> {t('admin1.batch.loading')}
        </div>
      ) : filteredCourses.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <Users className="h-12 w-12 text-muted mb-3" />
          <p className="text-on-surface-variant">{t('admin1.batch.noCourses')}</p>
        </div>
      ) : (
        <div className="space-y-4">
          {filteredCourses.map((course) => {
            const isExpanded = expandedId === course.id
            const batches = batchesMap[course.id] || []
            return (
              <Card key={course.id}>
                <div
                  className="flex items-center justify-between p-4 cursor-pointer hover:bg-surface/50 transition-colors"
                  onClick={() => setExpandedId(isExpanded ? null : course.id)}
                >
                  <div className="flex items-center gap-3">
                    {isExpanded ? <ChevronDown className="h-5 w-5 text-muted" /> : <ChevronRight className="h-5 w-5 text-muted" />}
                    <div>
                      <p className="font-semibold text-on-surface">{getCourseName(course.id)}</p>
                      <p className="text-xs text-muted">{t('admin1.batch.batchCount', { count: batches.length })}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="text-xs">{course.language_code?.toUpperCase()}</Badge>
                    <span className="text-xs text-on-surface-variant">{t('admin1.batch.enrolled', { count: batches.reduce((s, b) => s + b.enrolled, 0) })}</span>
                  </div>
                </div>
                {isExpanded && (
                  <CardContent className="border-t border-border pt-4 space-y-3">
                    {batches.length === 0 ? (
                      <p className="text-sm text-muted py-4 text-center">{t('admin1.batch.noBatches')}</p>
                    ) : (
                      batches.map((batch) => {
                        const pct = batch.capacity > 0 ? Math.round((batch.enrolled / batch.capacity) * 100) : 0
                        return (
                          <div key={batch.id} className="rounded-lg border border-border bg-surface-container-low p-4">
                            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:mb-3">
                              <div className="min-w-0">
                                <p className="font-medium text-on-surface">{batch.name}</p>
                                <div className="flex flex-wrap items-center gap-3 mt-1 text-xs text-on-surface-variant">
                                  {batch.code && <span className="font-mono text-primary">{batch.code}</span>}
                                  <span className="flex items-center gap-1"><CalendarDays className="h-3.5 w-3.5" /> {(batch.start_date || '').slice(0, 10)} - {(batch.end_date || '').slice(0, 10)}</span>
                                  {batch.zoom_link && (
                                    <a href={batch.zoom_link} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-primary hover:underline" onClick={e => e.stopPropagation()}>
                                      <ExternalLink className="h-3 w-3" /> Zoom
                                    </a>
                                  )}
                                </div>
                              </div>
                              <div className="flex flex-wrap items-center gap-1">
                                <Badge variant={statusVariant(batch.status)} className="text-xs">{batch.status}</Badge>
                                {batch.status === 'completed' && (
                                  <a href={`/alumni/${batch.id}`} target="_blank" rel="noopener noreferrer" className="inline-flex h-8 w-8 items-center justify-center rounded-md text-xs text-primary hover:bg-primary/10" title={t('admin1.batch.viewAlumni')}>
                                    <ExternalLink className="h-4 w-4" />
                                  </a>
                                )}
                                {batch.status !== 'completed' && (
                                  <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={(e) => { e.stopPropagation(); handleComplete(batch) }}>
                                    <GraduationCap className="mr-1 h-3.5 w-3.5" /> {t('admin1.batch.complete')}
                                  </Button>
                                )}
                                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={(e) => { e.stopPropagation(); openEdit(batch) }}>
                                  <Pencil className="h-4 w-4" />
                                </Button>
                                {batch.enrolled === 0 && (
                                  <Button variant="ghost" size="icon" className="h-8 w-8 text-red-400 hover:text-red-300" onClick={(e) => { e.stopPropagation(); handleDelete(batch) }}>
                                    <Trash2 className="h-4 w-4" />
                                  </Button>
                                )}
                              </div>
                            </div>
                            {(() => {
                              const teacher = teachers.find(t => t.id === batch.teacher_id)
                              const pickValue = assigning[batch.id] ?? ''
                              if (!teacher) {
                                return (
                                  <div className="mb-3 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 space-y-2">
                                    <div className="flex items-start gap-2">
                                      <AlertTriangle className="h-4 w-4 text-amber-400 mt-0.5 shrink-0" />
                                      <div>
                                        <p className="text-sm font-semibold text-amber-300">{t('admin1.batch.needTeacherTitle')}</p>
                                        <p className="text-xs text-amber-200/80 mt-0.5">
                                          {t('admin1.batch.needTeacherDesc', { name: batch.name, count: batch.enrolled, capacity: batch.capacity })}
                                        </p>
                                      </div>
                                    </div>
                                    <Select
                                      value={pickValue}
                                      onChange={e => handleAssignTeacher(batch, e.target.value)}
                                      className="w-full text-sm"
                                    >
                                      <option value="">{t('admin1.batch.selectTeacherPlaceholder')}</option>
                                      {teachers.map(t => (
                                        <option key={t.id} value={t.id}>{t.display_name}</option>
                                      ))}
                                    </Select>
                                  </div>
                                )
                              }
                              if (teacher) {
                                return (
                                  <div className="mb-3 flex items-center justify-between gap-3 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2">
                                    <span className="flex items-center gap-1.5 text-xs text-emerald-300">
                                      <GraduationCap className="h-3.5 w-3.5" />
                                      {t('admin1.batch.teacherLabel')}: {teacher.display_name}
                                    </span>
                                    <Select
                                      value={pickValue || batch.teacher_id || ''}
                                      onChange={e => handleAssignTeacher(batch, e.target.value)}
                                      className="w-44 text-xs"
                                    >
                                      {teachers.map(t => (
                                        <option key={t.id} value={t.id}>{t.display_name}</option>
                                      ))}
                                    </Select>
                                  </div>
                                )
                              }
                              return null
                            })()}
                            <div className="flex items-center gap-3">
                              <div className="flex-1">
                                <div className="flex items-center justify-between text-xs mb-1">
                                  <span className="text-on-surface-variant">{t('admin1.batch.capacity')}</span>
                                  <span className="text-on-surface font-medium">{batch.enrolled}/{batch.capacity}</span>
                                </div>
                                <div className="h-2 rounded-full bg-surface-container-highest overflow-hidden">
                                  <div
                                    className={`h-full rounded-full transition-all duration-300 ${
                                      pct >= 90 ? 'bg-red-500' : pct >= 70 ? 'bg-amber-500' : 'bg-emerald-500'
                                    }`}
                                    style={{ width: `${pct}%` }}
                                  />
                                </div>
                              </div>
                              <span className="text-xs text-muted shrink-0">{pct}%</span>
                            </div>
                          </div>
                        )
                      })
                    )}
                    <Button variant="outline" size="sm" className="w-full" onClick={(e) => { e.stopPropagation(); openCreateForCourse(course.id) }}>
                      <Plus className="mr-1 h-4 w-4" /> {t('admin1.batch.add')}
                    </Button>
                  </CardContent>
                )}
              </Card>
            )
          })}
        </div>
      )}

      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={() => setShowCreate(false)}>
          <div className="w-full max-w-lg rounded-xl border border-border bg-background p-6 shadow-xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-on-surface">{editingBatch ? t('admin1.batch.editTitle') : t('admin1.batch.create')}</h2>
              <button onClick={() => setShowCreate(false)} className="text-muted hover:text-on-surface"><X className="h-5 w-5" /></button>
            </div>
            <div className="space-y-4">
              {!editingBatch && (
                <div className="space-y-1.5">
                  <Label>{t('admin1.batch.courseLabel')}</Label>
                  <Select value={form.course_id} onChange={e => setForm({ ...form, course_id: e.target.value })}>
                    <option value="">{t('admin1.batch.selectCourse')}</option>
                    {courses.map(c => (
                      <option key={c.id} value={c.id}>{getCourseName(c.id)}</option>
                    ))}
                  </Select>
                </div>
              )}
              <div className="space-y-1.5">
                <Label>{t('admin1.batch.nameLabel')}</Label>
                <Input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder={t('admin1.batch.namePlaceholder')} />
              </div>
              <div className="space-y-1.5">
                <Label>{t('admin1.batch.codeLabel')}</Label>
                <Input value={form.code} onChange={e => setForm({ ...form, code: e.target.value })} placeholder={t('admin1.batch.codePlaceholder')} />
              </div>
              <div className="space-y-1.5">
                <Label>{t('admin1.batch.capacityLabel')}</Label>
                <Input type="number" min={1} value={form.capacity} onChange={e => setForm({ ...form, capacity: parseInt(e.target.value) || 1 })} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label>{t('admin1.batch.startDateLabel')}</Label>
                  <Input type="date" value={form.start_date} onChange={e => setForm({ ...form, start_date: e.target.value })} />
                </div>
                <div className="space-y-1.5">
                  <Label>{t('admin1.batch.endDateLabel')}</Label>
                  <Input type="date" value={form.end_date} onChange={e => setForm({ ...form, end_date: e.target.value })} />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>{t('admin1.batch.zoomLinkLabel') || 'Link Zoom'}</Label>
                <Input value={form.zoom_link} onChange={e => setForm({ ...form, zoom_link: e.target.value })} placeholder="https://zoom.us/j/..." />
              </div>
              {editingBatch && (
                <div className="space-y-1.5">
                  <Label>{t('admin1.batch.statusLabel')}</Label>
                  <Select value={form.status} onChange={e => setForm({ ...form, status: e.target.value })}>
                    <option value="active">{t('admin1.batch.statusActive')}</option>
                    <option value="upcoming">{t('admin1.batch.statusUpcoming')}</option>
                    <option value="completed">{t('admin1.batch.statusCompleted')}</option>
                    <option value="cancelled">{t('admin1.batch.statusCancelled')}</option>
                  </Select>
                </div>
              )}
              {saveError && <p className="text-xs text-destructive">{saveError}</p>}
              <div className="flex justify-end gap-2 pt-2">
                <Button variant="outline" onClick={() => setShowCreate(false)}>{t('admin1.batch.cancel')}</Button>
                <Button onClick={handleSave} loading={saving} disabled={!form.name || !form.course_id || !form.start_date || !form.end_date}>
                  {editingBatch ? t('admin1.batch.update') : t('admin1.batch.createShort')}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
