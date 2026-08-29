'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase-client'
import { useI18n } from '@/lib/i18n/client'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { ImageUpload } from '@/components/ui/image-upload'
import type { CourseTask, TaskStatus, BatchTask, Batch } from '@/types'
import {
  ArrowLeft, Plus, Loader2, Pencil, Trash2, Copy, Layers, ListOrdered,
  ChevronUp, ChevronDown, Eye, EyeOff, X, CalendarDays, BookOpen,
} from 'lucide-react'

interface CourseRow {
  id: string
  title: { en: string; id: string }
  language_code: string
  image_url: string | null
  status: string
}

interface TaskStats {
  lessons: number
  activities: number
}

interface TaskForm {
  title: string
  description: string
  cover_image_url: string
  task_number: number
  sort_order: number
  status: TaskStatus
}

const EMPTY_FORM: TaskForm = {
  title: '',
  description: '',
  cover_image_url: '',
  task_number: 1,
  sort_order: 0,
  status: 'draft',
}

export default function AdminLearningCourseDetailPage() {
  const { courseId } = useParams<{ courseId: string }>()
  const router = useRouter()
  const { t } = useI18n()
  const supabase = useMemo(() => createClient(), [])

  const [course, setCourse] = useState<CourseRow | null>(null)
  const [tasks, setTasks] = useState<CourseTask[]>([])
  const [taskStats, setTaskStats] = useState<Record<string, TaskStats>>({})
  const [batches, setBatches] = useState<Batch[]>([])
  const [batchAssignments, setBatchAssignments] = useState<Record<string, BatchTask[]>>({})
  const [loading, setLoading] = useState(true)

  const [showTaskModal, setShowTaskModal] = useState(false)
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null)
  const [form, setForm] = useState<TaskForm>(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [publishingId, setPublishingId] = useState<string | null>(null)

  const [assignBatchId, setAssignBatchId] = useState('')
  const [assignTaskId, setAssignTaskId] = useState('')
  const [assigning, setAssigning] = useState(false)

  const fetchAll = useCallback(async () => {
    if (!courseId) return
    setLoading(true)
    try {
      const [courseRes, tasksRes, batchRes] = await Promise.all([
        supabase.from('courses').select('id, title, language_code, image_url, status').eq('id', courseId).single(),
        supabase.from('course_tasks').select('*').eq('course_id', courseId).order('sort_order', { ascending: true }),
        supabase.from('batches').select('*').eq('course_id', courseId).order('start_date', { ascending: true }),
      ])

      setCourse(courseRes.data as CourseRow | null)

      const tData = (tasksRes.data ?? []) as CourseTask[]
      setTasks(tData)

      const bData = (batchRes.data ?? []) as Batch[]
      setBatches(bData)

      const lessonData = tData.length > 0
        ? (await supabase.from('task_lessons').select('id, task_id').in('task_id', tData.map((x) => x.id))).data ?? []
        : []

      const [actRes, btRes] = await Promise.all([
        lessonData.length > 0
          ? supabase.from('lesson_activities').select('id, lesson_id').in('lesson_id', lessonData.map((l: any) => l.id))
          : Promise.resolve({ data: [] as never[], error: null } as any),
        bData.length > 0
          ? supabase.from('batch_tasks').select('*').in('batch_id', bData.map((b) => b.id)).order('sort_order', { ascending: true })
          : Promise.resolve({ data: [] as never[], error: null }),
      ])

      const stats: Record<string, TaskStats> = {}
      for (const l of lessonData as any[]) {
        stats[l.task_id] = stats[l.task_id] || { lessons: 0, activities: 0 }
        stats[l.task_id].lessons++
      }
      for (const a of actRes?.data ?? ([] as any[])) {
        for (const l of lessonData as any[]) {
          if (l.id === a.lesson_id) {
            if (!stats[l.task_id]) stats[l.task_id] = { lessons: 0, activities: 0 }
            stats[l.task_id].activities++
          }
        }
      }
      setTaskStats(stats)

      const assignments: Record<string, BatchTask[]> = {}
      for (const bt of (btRes?.data ?? []) as BatchTask[]) {
        if (!assignments[bt.batch_id]) assignments[bt.batch_id] = []
        assignments[bt.batch_id].push(bt)
      }
      setBatchAssignments(assignments)
    } catch (err) {
      console.error('Failed to fetch course detail:', err)
    }
    setLoading(false)
  }, [courseId, supabase])

  useEffect(() => {
    fetchAll()
  }, [fetchAll])

  function openCreateTask() {
    setEditingTaskId(null)
    setForm({ ...EMPTY_FORM, task_number: tasks.length + 1, sort_order: (tasks.at(-1)?.sort_order ?? 0) + 1 })
    setSaveError('')
    setShowTaskModal(true)
  }

  function openEditTask(task: CourseTask) {
    setEditingTaskId(task.id)
    setForm({
      title: task.title,
      description: task.description || '',
      cover_image_url: task.cover_image_url || '',
      task_number: task.task_number,
      sort_order: task.sort_order,
      status: task.status,
    })
    setSaveError('')
    setShowTaskModal(true)
  }

  async function saveTask() {
    if (!form.title.trim()) {
      setSaveError('Title is required')
      return
    }
    setSaving(true)
    setSaveError('')
    try {
      if (editingTaskId) {
        const { error } = await supabase
          .from('course_tasks')
          .update({
            title: form.title,
            description: form.description,
            cover_image_url: form.cover_image_url,
            task_number: form.task_number,
            sort_order: form.sort_order,
            status: form.status,
          })
          .eq('id', editingTaskId)
        if (error) throw error
      } else {
        const { data, error } = await supabase
          .from('course_tasks')
          .insert({
            course_id: courseId,
            title: form.title,
            description: form.description,
            cover_image_url: form.cover_image_url,
            task_number: form.task_number,
            sort_order: form.sort_order,
            status: form.status,
          })
          .select('id')
          .single()
        if (error) throw error
        setShowTaskModal(false)
        if (data?.id) {
          router.push(`/admin/learning/tasks/${data.id}`)
          return
        }
      }
      setShowTaskModal(false)
      fetchAll()
    } catch (err: any) {
      setSaveError(err?.message || 'Failed to save task')
    }
    setSaving(false)
  }

  async function deleteTask(task: CourseTask) {
    if (!window.confirm(t('deleteTask.confirm'))) return
    setDeletingId(task.id)
    try {
      const { error } = await supabase.from('course_tasks').delete().eq('id', task.id)
      if (error) throw error
      fetchAll()
    } catch (err: any) {
      console.error('Failed to delete task:', err)
      window.alert(err?.message || 'Failed to delete task')
    }
    setDeletingId(null)
  }

  async function toggleTaskPublish(task: CourseTask) {
    setPublishingId(task.id)
    try {
      const next: TaskStatus = task.status === 'published' ? 'draft' : 'published'
      const { error } = await supabase.from('course_tasks').update({ status: next }).eq('id', task.id)
      if (error) throw error
      fetchAll()
    } catch (err: any) {
      console.error('Failed to toggle publish:', err)
    }
    setPublishingId(null)
  }

  async function duplicateTask(task: CourseTask) {
    try {
      const t = task as unknown as Record<string, unknown>
      const { data, error } = await supabase
        .from('course_tasks')
        .insert({
          course_id: task.course_id,
          title: `${task.title} (Copy)`,
          description: task.description,
          cover_image_url: task.cover_image_url,
          task_number: tasks.length + 1,
          sort_order: (tasks.at(-1)?.sort_order ?? 0) + 1,
          status: 'draft',
          estimated_duration: task.estimated_duration,
          min_completion_score: task.min_completion_score,
          completion_requirement: task.completion_requirement,
          lesson_unlock_rule: task.lesson_unlock_rule,
          required_lesson_score: task.required_lesson_score,
          activity_unlock_rule: task.activity_unlock_rule,
          dialog_enabled: (t.dialog_enabled as boolean) ?? false,
          dialog_topic: t.dialog_topic as string | null,
          dialog_character_name: t.dialog_character_name as string | null,
          dialog_character_role: t.dialog_character_role as string | null,
          dialog_instructions: t.dialog_instructions as string | null,
          dialog_duration_sec: (t.dialog_duration_sec as number) ?? 420,
        })
        .select('id')
        .single()
      if (error) throw error
      const newTaskId = data?.id
      if (!newTaskId) return

      // Copy lessons + activities + content from the original task
      const { data: origLessons } = await supabase
        .from('task_lessons')
        .select('*')
        .eq('task_id', task.id)
        .order('sort_order')

      for (const lesson of (origLessons || []) as any[]) {
        const { data: newLesson } = await supabase
          .from('task_lessons')
          .insert({
            task_id: newTaskId,
            lesson_number: lesson.lesson_number,
            title: lesson.title,
            description: lesson.description,
            icon: lesson.icon,
            sort_order: lesson.sort_order,
            status: 'draft',
          })
          .select('id')
          .single()

        if (!newLesson?.id) continue

        // Copy activities for this lesson
        const { data: origActivities } = await supabase
          .from('lesson_activities')
          .select('*')
          .eq('lesson_id', lesson.id)
          .order('sort_order')

        for (const act of (origActivities || []) as any[]) {
          const { data: newAct } = await supabase
            .from('lesson_activities')
            .insert({
              lesson_id: newLesson.id,
              activity_type: act.activity_type,
              title: act.title,
              instruction: act.instruction,
              sort_order: act.sort_order,
              status: 'draft',
            })
            .select('id')
            .single()

          // Copy activity content
          if (newAct?.id) {
            const { data: origContent } = await supabase
              .from('activity_content')
              .select('content, content_type')
              .eq('activity_id', act.id)
              .maybeSingle()
            if (origContent) {
              await supabase.from('activity_content').insert({
                activity_id: newAct.id,
                content_type: origContent.content_type,
                content: origContent.content,
              })
            }
          }
        }
      }

      fetchAll()
      router.push(`/admin/learning/tasks/${newTaskId}`)
    } catch (err: any) {
      console.error('Failed to duplicate task:', err)
    }
  }

  async function addTaskToBatch() {
    if (!assignBatchId || !assignTaskId) return
    setAssigning(true)
    try {
      const existing = batchAssignments[assignBatchId] ?? []
      const { error } = await supabase.from('batch_tasks').insert({
        batch_id: assignBatchId,
        task_id: assignTaskId,
        sort_order: existing.length,
      })
      if (error) throw error
      setAssignTaskId('')
      fetchAll()
    } catch (err: any) {
      console.error('Failed to assign task:', err)
      window.alert(err?.message || 'Failed to assign task')
    }
    setAssigning(false)
  }

  async function removeTaskFromBatch(batchId: string, bt: BatchTask) {
    const { error } = await supabase.from('batch_tasks').delete().eq('id', bt.id)
    if (!error) fetchAll()
  }

  async function reorderBatchTask(batchId: string, bt: BatchTask, dir: -1 | 1) {
    const list = [...(batchAssignments[batchId] ?? [])].sort((a, b) => a.sort_order - b.sort_order)
    const idx = list.findIndex((x) => x.id === bt.id)
    const target = idx + dir
    if (idx < 0 || target < 0 || target >= list.length) return
    const other = list[target]
    const { error } = await supabase
      .from('batch_tasks')
      .upsert([
        { id: bt.id, sort_order: other.sort_order },
        { id: other.id, sort_order: bt.sort_order },
      ])
    if (!error) fetchAll()
  }

  async function toggleBatchTaskStatus(batchId: string, bt: BatchTask) {
    const next = bt.status === 'published' ? 'unpublished' : 'published'
    const { error } = await supabase.from('batch_tasks').update({ status: next }).eq('id', bt.id)
    if (!error) fetchAll()
  }

  async function updateBatchAvailability(batchId: string, bt: BatchTask, field: 'availability_start' | 'availability_end', value: string) {
    const { error } = await supabase.from('batch_tasks').update({ [field]: value || null }).eq('id', bt.id)
    if (!error) fetchAll()
  }

  function taskStatusBadge(status: TaskStatus) {
    const map: Record<TaskStatus, { label: string; variant: 'outline' | 'success' | 'ghost' }> = {
      draft: { label: t('tasks.statusDraft'), variant: 'outline' },
      published: { label: t('tasks.statusPublished'), variant: 'success' },
      archived: { label: t('tasks.statusArchived'), variant: 'ghost' },
    }
    const s = map[status] ?? map.draft
    return <Badge variant={s.variant}>{s.label}</Badge>
  }

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-on-surface-variant" />
      </div>
    )
  }

  if (!course) {
    return (
      <div className="py-20 text-center text-on-surface-variant">
        <p>Course not found</p>
        <Button className="mt-4" variant="outline" onClick={() => router.push('/admin/learning/courses')}>
          {t('builder.back')}
        </Button>
      </div>
    )
  }

  const taskTitle = (task: CourseTask) => task.title || 'Untitled Task'
  const courseTitle = course.title as unknown as { en: string; id: string }
  const courseTitleStr = (courseTitle?.id || courseTitle?.en) as string

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => router.push('/admin/learning/courses')}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold text-on-surface">{courseTitleStr || '—'}</h1>
          <p className="text-sm text-on-surface-variant">{course.language_code}</p>
        </div>
      </div>

      {/* Master Tasks */}
      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle>{t('courseDetail.tasks')}</CardTitle>
          <Button onClick={openCreateTask}>
            <Plus className="mr-1 h-4 w-4" /> {t('tasks.create')}
          </Button>
        </CardHeader>
        <CardContent className="space-y-3">
          {tasks.length === 0 ? (
            <div className="py-12 text-center">
              <BookOpen className="mx-auto mb-3 h-10 w-10 text-on-surface-variant/40" />
              <p className="text-sm text-on-surface-variant">{t('tasks.noTasks')}</p>
            </div>
          ) : (
            tasks.map((task, idx) => {
              const stats = taskStats[task.id] ?? { lessons: 0, activities: 0 }
              return (
                <div
                  key={task.id}
                  className="group flex flex-wrap items-center gap-3 rounded-xl border border-border bg-surface-container-low p-4 transition-all hover:border-border-strong hover:shadow-sm"
                >
                  {/* Number + Title */}
                  <button
                    type="button"
                    className="flex min-w-0 flex-1 items-center gap-3 text-left"
                    onClick={() => router.push(`/admin/learning/tasks/${task.id}`)}
                  >
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-sm font-bold text-primary">
                      {idx + 1}
                    </span>
                    <div className="min-w-0">
                      <p className="truncate font-semibold text-on-surface group-hover:text-primary transition-colors">
                        {taskTitle(task)}
                      </p>
                      <div className="mt-1 flex items-center gap-3 text-xs text-on-surface-variant">
                        <span className="flex items-center gap-1">
                          <Layers className="h-3 w-3" /> {stats.lessons} {t('tasks.lessons')}
                        </span>
                        <span className="flex items-center gap-1">
                          <ListOrdered className="h-3 w-3" /> {stats.activities} {t('tasks.activities')}
                        </span>
                      </div>
                    </div>
                  </button>

                  {/* Status + Actions */}
                  <div className="flex items-center gap-2">
                    {taskStatusBadge(task.status)}
                    <div className="flex items-center gap-0.5 opacity-60 group-hover:opacity-100 transition-opacity">
                      <Button
                        size="icon-sm"
                        variant="ghost"
                        disabled={publishingId === task.id}
                        onClick={() => toggleTaskPublish(task)}
                        title={task.status === 'published' ? t('tasks.unpublish') : t('tasks.publish')}
                      >
                        {publishingId === task.id ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : task.status === 'published' ? (
                          <EyeOff className="h-3.5 w-3.5" />
                        ) : (
                          <Eye className="h-3.5 w-3.5" />
                        )}
                      </Button>
                      <Button size="icon-sm" variant="ghost" title={t('tasks.edit')} onClick={() => openEditTask(task)}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button size="icon-sm" variant="ghost" title={t('tasks.duplicate')} onClick={() => duplicateTask(task)}>
                        <Copy className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        size="icon-sm"
                        variant="ghost"
                        className="text-destructive hover:bg-destructive/10"
                        title={t('tasks.delete')}
                        disabled={deletingId === task.id}
                        onClick={() => deleteTask(task)}
                      >
                        {deletingId === task.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                      </Button>
                    </div>
                  </div>
                </div>
              )
            })
          )}
        </CardContent>
      </Card>

      {/* Batch Assignments */}
      <Card>
        <CardHeader>
          <CardTitle>{t('courseDetail.batches')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {batches.length === 0 ? (
            <div className="py-12 text-center">
              <CalendarDays className="mx-auto mb-3 h-10 w-10 text-on-surface-variant/40" />
              <p className="text-sm text-on-surface-variant">{t('courseDetail.noBatches')}</p>
            </div>
          ) : (
            batches.map((batch) => {
              const assigned = (batchAssignments[batch.id] ?? []).sort((a, b) => a.sort_order - b.sort_order)
              const assignedIds = new Set(assigned.map((a) => a.task_id))
              const available = tasks.filter((x) => !assignedIds.has(x.id))
              return (
                <div key={batch.id} className="rounded-xl border border-border bg-surface-container-low p-4">
                  {/* Batch header */}
                  <div className="mb-4 flex items-center justify-between">
                    <div>
                      <p className="font-semibold text-on-surface">{batch.name}</p>
                      <p className="text-xs text-on-surface-variant">
                        {assigned.length} {t('courseDetail.tasksInBatch')}
                      </p>
                    </div>
                  </div>

                  {/* Assigned tasks */}
                  {assigned.length === 0 ? (
                    <p className="mb-4 text-sm text-on-surface-variant/60">{t('courseDetail.tasksInBatch')}: —</p>
                  ) : (
                    <div className="mb-4 space-y-2">
                      {assigned.map((bt, i) => {
                        const task = tasks.find((x) => x.id === bt.task_id)
                        if (!task) return null
                        return (
                          <div
                            key={bt.id}
                            className="flex flex-wrap items-center gap-2 rounded-lg bg-surface-container-high px-3 py-2.5"
                          >
                            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-primary/10 text-[10px] font-bold text-primary">
                              {i + 1}
                            </span>
                            <button
                              type="button"
                              className="min-w-0 flex-1 truncate text-left text-sm font-medium text-on-surface hover:text-primary transition-colors"
                              onClick={() => router.push(`/admin/learning/tasks/${task.id}`)}
                            >
                              {task.title}
                            </button>
                            <div className="flex items-center gap-0.5">
                              <Button size="icon-sm" variant="ghost" disabled={i === 0} onClick={() => reorderBatchTask(batch.id, bt, -1)}>
                                <ChevronUp className="h-3.5 w-3.5" />
                              </Button>
                              <Button size="icon-sm" variant="ghost" disabled={i === assigned.length - 1} onClick={() => reorderBatchTask(batch.id, bt, 1)}>
                                <ChevronDown className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                            <Badge variant={bt.status === 'published' ? 'success' : 'outline'} size="sm">
                              {bt.status === 'published' ? t('courseDetail.published') : t('courseDetail.unpublished')}
                            </Badge>
                            <Button size="icon-sm" variant="ghost" onClick={() => toggleBatchTaskStatus(batch.id, bt)}>
                              {bt.status === 'published' ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                            </Button>

                            {/* Date pickers */}
                            <div className="flex items-center gap-2 text-xs text-on-surface-variant">
                              <div className="flex items-center gap-1.5">
                                <CalendarDays className="h-3 w-3 text-on-surface-variant/60" />
                                <input
                                  type="datetime-local"
                                  className="h-7 rounded-md border border-border bg-surface px-2 text-xs text-on-surface focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/30 w-[150px]"
                                  defaultValue={bt.availability_start ? new Date(bt.availability_start).toISOString().slice(0, 16) : ''}
                                  onBlur={(e) => updateBatchAvailability(batch.id, bt, 'availability_start', e.target.value)}
                                />
                              </div>
                              <span className="text-on-surface-variant/40">—</span>
                              <div className="flex items-center gap-1.5">
                                <input
                                  type="datetime-local"
                                  className="h-7 rounded-md border border-border bg-surface px-2 text-xs text-on-surface focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/30 w-[150px]"
                                  defaultValue={bt.availability_end ? new Date(bt.availability_end).toISOString().slice(0, 16) : ''}
                                  onBlur={(e) => updateBatchAvailability(batch.id, bt, 'availability_end', e.target.value)}
                                />
                              </div>
                            </div>

                            <Button
                              size="icon-sm"
                              variant="ghost"
                              className="text-destructive hover:bg-destructive/10"
                              onClick={() => removeTaskFromBatch(batch.id, bt)}
                            >
                              <X className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        )
                      })}
                    </div>
                  )}

                  {/* Add task to batch */}
                  {available.length > 0 && (
                    <div className="flex flex-wrap items-end gap-2 pt-2 border-t border-border">
                      <div className="flex flex-col gap-1">
                        <Label className="text-xs text-on-surface-variant">{t('batches.selectBatch')}</Label>
                        <Select
                          value={assignBatchId || batch.id}
                          onChange={(e) => setAssignBatchId(e.target.value)}
                          className="w-48"
                        >
                          {batches.map((b) => (
                            <option key={b.id} value={b.id}>{b.name}</option>
                          ))}
                        </Select>
                      </div>
                      <div className="flex flex-col gap-1">
                        <Label className="text-xs text-on-surface-variant">{t('courseDetail.addTask')}</Label>
                        <Select value={assignTaskId} onChange={(e) => setAssignTaskId(e.target.value)} className="w-56">
                          <option value="">—</option>
                          {available.map((x) => (
                            <option key={x.id} value={x.id}>{x.title}</option>
                          ))}
                        </Select>
                      </div>
                      <Button
                        size="sm"
                        disabled={!assignTaskId || !(assignBatchId || batch.id) || assigning}
                        onClick={() => {
                          if (assignBatchId || batch.id) {
                            addTaskToBatch()
                          }
                        }}
                      >
                        {assigning ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
                      </Button>
                    </div>
                  )}
                </div>
              )
            })
          )}
        </CardContent>
      </Card>

      {/* Task create/edit modal */}
      {showTaskModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm" onClick={() => setShowTaskModal(false)}>
          <Card className="w-full max-w-lg">
            <div onClick={(e) => e.stopPropagation()} className="p-5">
              <div className="mb-4 flex items-center justify-between">
                <h3 className="text-lg font-semibold text-on-surface">
                  {editingTaskId ? t('tasks.edit') : t('tasks.create')}
                </h3>
                <Button size="icon-sm" variant="ghost" onClick={() => setShowTaskModal(false)}>
                  <X className="h-4 w-4" />
                </Button>
              </div>
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div className="flex flex-col gap-1">
                    <Label className="text-xs">{t('overview.taskNumber')}</Label>
                    <Input
                      type="number"
                      value={form.task_number}
                      onChange={(e) => setForm({ ...form, task_number: Number(e.target.value) })}
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <Label className="text-xs">{t('builder.status')}</Label>
                    <Select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as TaskStatus })}>
                      <option value="draft">{t('tasks.statusDraft')}</option>
                      <option value="published">{t('tasks.statusPublished')}</option>
                      <option value="archived">{t('tasks.statusArchived')}</option>
                    </Select>
                  </div>
                </div>
                <div className="flex flex-col gap-1">
                  <Label className="text-xs">{t('builder.lessonTitle')}</Label>
                  <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
                </div>
                <div className="flex flex-col gap-1">
                  <Label className="text-xs">{t('builder.lessonDescription')}</Label>
                  <Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={2} />
                </div>
                <div className="flex flex-col gap-1">
                  <Label className="text-xs">{t('settings.cover')}</Label>
                  <ImageUpload
                    value={form.cover_image_url}
                    onUpload={(url) => setForm({ ...form, cover_image_url: url })}
                    onRemove={() => setForm({ ...form, cover_image_url: '' })}
                    bucket="materials"
                    pathPrefix={`tasks/${courseId}/covers`}
                  />
                </div>
                {saveError && <p className="text-sm text-destructive">{saveError}</p>}
                <div className="flex justify-end gap-2 pt-2">
                  <Button variant="outline" onClick={() => setShowTaskModal(false)}>
                    {t('common.cancel')}
                  </Button>
                  <Button disabled={saving} onClick={saveTask}>
                    {saving ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null}
                    {editingTaskId ? t('common.save') : t('tasks.create')}
                  </Button>
                </div>
              </div>
            </div>
          </Card>
        </div>
      )}
    </div>
  )
}
