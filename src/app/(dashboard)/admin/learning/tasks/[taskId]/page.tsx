'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { Reorder } from 'framer-motion'
import { createClient } from '@/lib/supabase-client'
import { useI18n } from '@/lib/i18n/client'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { ImageUpload } from '@/components/ui/image-upload'
import { SaveIndicator, useAutosave } from '@/components/learning/admin/autosave'
import { checkTaskPublishable } from '@/lib/learning'
import type {
  BatchTask, CourseTask, LessonActivity, TaskLesson, TaskStatus,
} from '@/types'
import {
  ArrowLeft, Plus, Loader2, Pencil, Trash2, Copy, Eye, GripVertical,
  Layers, ListOrdered, CheckCircle2, XCircle, EyeOff, ChevronUp, ChevronDown, X,
} from 'lucide-react'

type Tab = 'overview' | 'lessons' | 'settings' | 'batches'

interface TaskDraft {
  title: string
  description: string
  cover_image_url: string
  task_number: number
  sort_order: number
  estimated_duration: string
  min_completion_score: number
  completion_requirement: 'all_lessons'
  lesson_unlock_rule: 'all_available' | 'sequential' | 'minimum_score'
  required_lesson_score: number
  activity_unlock_rule: 'all_available' | 'sequential'
  status: TaskStatus
}

export default function AdminTaskBuilderPage() {
  const { taskId } = useParams<{ taskId: string }>()
  const router = useRouter()
  const { t } = useI18n()
  const supabase = useMemo(() => createClient(), [])

  const [tab, setTab] = useState<Tab>('overview')
  const [task, setTask] = useState<CourseTask | null>(null)
  const [lessons, setLessons] = useState<TaskLesson[]>([])
  const [activitiesByLesson, setActivitiesByLesson] = useState<Record<string, LessonActivity[]>>({})
  const [contents, setContents] = useState<Record<string, Record<string, unknown>>>({})
  const [batches, setBatches] = useState<{ id: string; name: string }[]>([])
  const [batchTasks, setBatchTasks] = useState<BatchTask[]>([])
  const [loading, setLoading] = useState(true)
  const [publishing, setPublishing] = useState(false)
  const [deletingLessonId, setDeletingLessonId] = useState<string | null>(null)
  const [lastValidation, setLastValidation] = useState<{ ok: boolean; errors: string[]; warnings: string[] } | null>(null)

  const fetchAll = useCallback(async () => {
    if (!taskId) return
    setLoading(true)
    try {
      const [taskRes, lessonRes, actRes, contentRes, batchRes, btRes] = await Promise.all([
        supabase.from('course_tasks').select('*').eq('id', taskId).single(),
        supabase.from('task_lessons').select('*').eq('task_id', taskId).order('sort_order', { ascending: true }),
        supabase.from('lesson_activities').select('*').in(
          'lesson_id',
          (await supabase.from('task_lessons').select('id').eq('task_id', taskId)).data?.map((l: any) => l.id) ?? [],
        ),
        supabase.from('activity_content').select('activity_id, content'),
        supabase.from('batches').select('id, name').eq(
          'course_id',
          (await supabase.from('course_tasks').select('course_id').eq('id', taskId).single()).data?.course_id ?? '',
        ),
        supabase.from('batch_tasks').select('*').eq('task_id', taskId).order('sort_order', { ascending: true }),
      ])

      setTask(taskRes.data as CourseTask | null)
      setLessons((lessonRes.data ?? []) as TaskLesson[])
      const actMap: Record<string, LessonActivity[]> = {}
      for (const a of (actRes.data ?? []) as LessonActivity[]) {
        if (!actMap[a.lesson_id]) actMap[a.lesson_id] = []
        actMap[a.lesson_id].push(a)
      }
      setActivitiesByLesson(actMap)
      const cMap: Record<string, Record<string, unknown>> = {}
      for (const row of contentRes.data ?? []) cMap[row.activity_id] = row.content
      setContents(cMap)
      setBatches((batchRes.data ?? []) as { id: string; name: string }[])
      setBatchTasks((btRes.data ?? []) as BatchTask[])
    } catch (err) {
      console.error('Failed to load task builder:', err)
    }
    setLoading(false)
  }, [taskId, supabase])

  useEffect(() => {
    fetchAll()
  }, [fetchAll])

  const saveTask = useCallback(
    async (draft: TaskDraft) => {
      if (!taskId) return
      const { error } = await supabase
        .from('course_tasks')
        .update({
          title: draft.title,
          description: draft.description || null,
          cover_image_url: draft.cover_image_url || null,
          task_number: draft.task_number,
          sort_order: draft.sort_order,
          estimated_duration: draft.estimated_duration || null,
          min_completion_score: draft.min_completion_score,
          completion_requirement: draft.completion_requirement,
          lesson_unlock_rule: draft.lesson_unlock_rule,
          required_lesson_score: draft.required_lesson_score,
          activity_unlock_rule: draft.activity_unlock_rule,
        })
        .eq('id', taskId)
      if (error) throw error
      // Don't call fetchAll() here — it creates a loop with autosave.
      // The draft already reflects what we just saved.
    },
    [taskId, supabase],
  )

  const [draft, setDraft] = useState<TaskDraft | null>(null)
  const { status, retry } = useAutosave(
    draft,
    async (d) => {
      if (d) await saveTask(d)
    },
    800,
  )

  useEffect(() => {
    if (!task) return
    const next: TaskDraft = {
      title: task.title,
      description: task.description || '',
      cover_image_url: task.cover_image_url || '',
      task_number: task.task_number,
      sort_order: task.sort_order,
      estimated_duration: task.estimated_duration || '',
      min_completion_score: task.min_completion_score ?? 70,
      completion_requirement: (task.completion_requirement ?? 'all_lessons') as 'all_lessons',
      lesson_unlock_rule: task.lesson_unlock_rule ?? 'all_available',
      required_lesson_score: task.required_lesson_score ?? 70,
      activity_unlock_rule: task.activity_unlock_rule ?? 'sequential',
      status: task.status,
    }
    // Only update draft if values actually changed (prevents autosave loop)
    setDraft((prev) => {
      if (!prev) return next
      if (
        prev.title === next.title &&
        prev.description === next.description &&
        prev.cover_image_url === next.cover_image_url &&
        prev.task_number === next.task_number &&
        prev.sort_order === next.sort_order &&
        prev.estimated_duration === next.estimated_duration &&
        prev.min_completion_score === next.min_completion_score &&
        prev.completion_requirement === next.completion_requirement &&
        prev.lesson_unlock_rule === next.lesson_unlock_rule &&
        prev.required_lesson_score === next.required_lesson_score &&
        prev.activity_unlock_rule === next.activity_unlock_rule &&
        prev.status === next.status
      ) {
        return prev // no change → same reference → autosave won't fire
      }
      return next
    })
  }, [task])

  function runValidation() {
    if (!task || !draft) return { ok: false, errors: ['Loading...'], warnings: [] }
    const allActs = Object.values(activitiesByLesson).flat()
    const res = checkTaskPublishable({
      task: {
        ...task,
        title: draft.title,
        cover_image_url: draft.cover_image_url,
        lesson_unlock_rule: draft.lesson_unlock_rule,
        required_lesson_score: draft.required_lesson_score,
        completion_requirement: draft.completion_requirement,
        min_completion_score: draft.min_completion_score,
      },
      lessons,
      activities: allActs,
      contents,
    })
    setLastValidation(res)
    return res
  }

  async function publishTask() {
    const res = runValidation()
    if (!res.ok) return
    setPublishing(true)
    const next: TaskStatus = task?.status === 'published' ? 'draft' : 'published'
    const { error } = await supabase.from('course_tasks').update({ status: next }).eq('id', taskId)
    if (error) window.alert(error.message)
    setPublishing(false)
    fetchAll()
  }

  async function addLesson() {
    const sortOrder = lessons.length > 0 ? Math.max(...lessons.map((l) => l.sort_order)) + 1 : 0
    const { data, error } = await supabase
      .from('task_lessons')
      .insert({
        task_id: taskId,
        lesson_number: lessons.length + 1,
        title: 'New Lesson',
        sort_order: sortOrder,
        status: 'draft',
      })
      .select('id')
      .single()
    if (error) {
      window.alert(error.message)
      return
    }
    router.push(`/admin/learning/tasks/${taskId}/lessons/${data.id}`)
  }

  async function duplicateLesson(lesson: TaskLesson) {
    const acts = activitiesByLesson[lesson.id] ?? []
    const sortOrder = lessons.length > 0 ? Math.max(...lessons.map((l) => l.sort_order)) + 1 : 0
    const { data, error } = await supabase
      .from('task_lessons')
      .insert({
        task_id: taskId,
        lesson_number: lessons.length + 1,
        title: `${lesson.title} (Copy)`,
        description: lesson.description,
        icon: lesson.icon,
        sort_order: sortOrder,
        status: 'draft',
      })
      .select('id')
      .single()
    if (error) return
    for (const [i, a] of acts.entries()) {
      const { data: actData } = await supabase
        .from('lesson_activities')
        .insert({
          lesson_id: data.id,
          activity_type: a.activity_type,
          title: a.title,
          instruction: a.instruction,
          sort_order: i,
          status: 'draft',
        })
        .select('id')
        .single()
      if (actData?.id) {
        await supabase.from('activity_content').insert({
          activity_id: actData.id,
          content_type: a.activity_type,
          content: contents[a.id] ?? {},
        })
      }
    }
    fetchAll()
  }

  async function deleteLesson(lesson: TaskLesson) {
    const { count } = await supabase
      .from('student_lesson_progress')
      .select('id', { count: 'exact', head: true })
      .eq('lesson_id', lesson.id)
    const used = (count ?? 0) > 0
    const msg = used
      ? 'This lesson has existing student progress. Deleting it may affect progress and completion calculations.\n\nDelete anyway?'
      : 'Delete this lesson and all its activities?'
    if (!window.confirm(msg)) return
    setDeletingLessonId(lesson.id)
    await supabase.from('task_lessons').delete().eq('id', lesson.id)
    setDeletingLessonId(null)
    fetchAll()
  }

  async function toggleLessonStatus(lesson: TaskLesson) {
    const next = lesson.status === 'published' ? 'draft' : 'published'
    await supabase.from('task_lessons').update({ status: next }).eq('id', lesson.id)
    fetchAll()
  }

  async function reorderLessons(newList: TaskLesson[]) {
    setLessons(newList)
    await supabase
      .from('task_lessons')
      .upsert(newList.map((l, i) => ({ id: l.id, sort_order: i, lesson_number: i + 1 })))
    fetchAll()
  }

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-on-surface-variant" />
      </div>
    )
  }

  if (!task || !draft) {
    return <div className="py-20 text-center text-on-surface-variant">Task not found</div>
  }

  const tabs: { key: Tab; label: string }[] = [
    { key: 'overview', label: t('builder.overview') },
    { key: 'lessons', label: t('builder.lessons') },
    { key: 'settings', label: t('builder.settings') },
    { key: 'batches', label: t('builder.batches') },
  ]

  const validation = lastValidation ?? runValidation()

  return (
    <div className="space-y-5">
      {/* header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => router.push(`/admin/learning/courses/${task.course_id}`)}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="min-w-0">
            <Input
              value={draft.title}
              onChange={(e) => setDraft({ ...draft, title: e.target.value })}
              className="h-9 border-transparent bg-transparent text-xl font-bold text-on-surface shadow-none hover:border-border"
              placeholder="Task Title"
            />
          </div>
          <Badge variant={task.status === 'published' ? 'success' : task.status === 'archived' ? 'outline' : 'outline'}>
            {task.status}
          </Badge>
        </div>
        <div className="flex items-center gap-2">
          <SaveIndicator status={status} />
          {status === 'error' && (
            <Button size="sm" variant="outline" onClick={retry}>{t('builder.retry')}</Button>
          )}
          <Button size="sm" variant="outline" onClick={() => router.push(`/admin/learning/preview/${taskId}`)}>
            <Eye className="mr-1 h-3.5 w-3.5" /> {t('builder.preview')}
          </Button>
          <Button size="sm" disabled={publishing} onClick={publishTask} variant={task.status === 'published' ? 'outline' : 'default'}>
            {publishing ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : task.status === 'published' ? (
              <EyeOff className="mr-1 h-3.5 w-3.5" />
            ) : (
              <Eye className="mr-1 h-3.5 w-3.5" />
            )}
            {task.status === 'published' ? t('tasks.unpublish') : t('tasks.publish')}
          </Button>
        </div>
      </div>

      {/* tabs */}
      <div className="flex gap-1 border-b border-border">
        {tabs.map((tb) => (
          <button
            key={tb.key}
            type="button"
            className={`-mb-px border-b-2 px-4 py-2 text-sm font-medium transition-colors ${
              tab === tb.key ? 'border-primary text-primary' : 'border-transparent text-on-surface-variant hover:text-on-surface'
            }`}
            onClick={() => setTab(tb.key)}
          >
            {tb.label}
          </button>
        ))}
      </div>

      {/* OVERVIEW */}
      {tab === 'overview' && (
        <div className="grid gap-5 lg:grid-cols-3">
          <Card className="lg:col-span-2">
            <CardContent className="space-y-4 p-5">
              <div className="flex flex-col gap-1">
                <Label className="text-xs">{t('builder.lessonDescription')}</Label>
                <Textarea
                  rows={3}
                  value={draft.description}
                  onChange={(e) => setDraft({ ...draft, description: e.target.value })}
                />
              </div>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <div className="rounded-xl bg-surface-container-low p-3 text-center">
                  <Layers className="mx-auto mb-1 h-5 w-5 text-primary" />
                  <p className="text-lg font-bold text-on-surface">{lessons.length}</p>
                  <p className="text-xs text-on-surface-variant">{t('overview.lessonsCount')}</p>
                </div>
                <div className="rounded-xl bg-surface-container-low p-3 text-center">
                  <ListOrdered className="mx-auto mb-1 h-5 w-5 text-primary" />
                  <p className="text-lg font-bold text-on-surface">{Object.values(activitiesByLesson).reduce((s, a) => s + a.length, 0)}</p>
                  <p className="text-xs text-on-surface-variant">{t('overview.activitiesCount')}</p>
                </div>
                <div className="rounded-xl bg-surface-container-low p-3 text-center">
                  <p className="text-lg font-bold text-on-surface">{draft.estimated_duration || '—'}</p>
                  <p className="text-xs text-on-surface-variant">{t('common.duration')}</p>
                </div>
              </div>
              <div className="flex flex-col gap-1">
                <Label className="text-xs">{t('settings.cover')}</Label>
                <ImageUpload
                  value={draft.cover_image_url}
                  onUpload={(url) => setDraft({ ...draft, cover_image_url: url })}
                  onRemove={() => setDraft({ ...draft, cover_image_url: '' })}
                  bucket="materials"
                  pathPrefix={`tasks/${task.course_id}/covers`}
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="space-y-3 p-5">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-on-surface">{t('validation.title')}</h3>
                {validation.ok ? (
                  <Badge variant="success">
                    <CheckCircle2 className="mr-1 h-3.5 w-3.5" /> {t('validation.ready')}
                  </Badge>
                ) : (
                  <Badge variant="warning">
                    <XCircle className="mr-1 h-3.5 w-3.5" /> {t('validation.notReady')}
                  </Badge>
                )}
              </div>
              {validation.errors.length > 0 && (
                <ul className="space-y-1.5 text-sm text-destructive">
                  {validation.errors.map((e, i) => (
                    <li key={i} className="flex items-start gap-1.5">
                      <XCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {e}
                    </li>
                  ))}
                </ul>
              )}
              {validation.warnings.length > 0 && (
                <ul className="space-y-1.5 text-sm text-warning">
                  {validation.warnings.map((w, i) => (
                    <li key={i} className="flex items-start gap-1.5">• {w}</li>
                  ))}
                </ul>
              )}
              {validation.ok && (
                <p className="flex items-center gap-1.5 text-sm text-success">
                  <CheckCircle2 className="h-3.5 w-3.5" /> {t('validation.ready')}
                </p>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* LESSONS */}
      {tab === 'lessons' && (
        <Card>
          <CardContent className="p-5">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="font-semibold text-on-surface">{t('builder.lessons')} ({lessons.length})</h3>
              <Button size="sm" onClick={addLesson}>
                <Plus className="mr-1 h-3.5 w-3.5" /> {t('builder.addLesson')}
              </Button>
            </div>
            {lessons.length === 0 ? (
              <p className="py-8 text-center text-sm text-on-surface-variant">No lessons yet. Create the first lesson.</p>
            ) : (
              <Reorder.Group axis="y" values={lessons} onReorder={reorderLessons} className="space-y-2">
                {lessons.map((lesson, i) => {
                  const acts = activitiesByLesson[lesson.id] ?? []
                  return (
                    <Reorder.Item key={lesson.id} value={lesson} className="cursor-grab rounded-xl border border-border bg-surface p-3 active:cursor-grabbing">
                      <div className="flex items-center gap-3">
                        <GripVertical className="h-4 w-4 shrink-0 text-on-surface-variant/40" />
                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-sm font-bold text-primary">
                          {i + 1}
                        </span>
                        <button
                          type="button"
                          className="min-w-0 flex-1 text-left"
                          onClick={() => router.push(`/admin/learning/tasks/${taskId}/lessons/${lesson.id}`)}
                        >
                          <p className="truncate text-sm font-medium text-on-surface">{lesson.title || 'Untitled Lesson'}</p>
                          <p className="text-xs text-on-surface-variant">
                            {lesson.icon ? `${lesson.icon} ` : ''}
                            {acts.length} {t('tasks.activities')} • {lesson.estimated_duration || '—'}
                          </p>
                        </button>
                        <Badge variant={lesson.status === 'published' ? 'success' : 'outline'}>{lesson.status}</Badge>
                        <div className="flex items-center gap-0.5">
                          <Button size="sm" variant="ghost" onClick={() => toggleLessonStatus(lesson)} title={t('tasks.publish')}>
                            {lesson.status === 'published' ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => router.push(`/admin/learning/tasks/${taskId}/lessons/${lesson.id}`)}>
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => duplicateLesson(lesson)}>
                            <Copy className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="text-destructive hover:bg-destructive/10"
                            disabled={deletingLessonId === lesson.id}
                            onClick={() => deleteLesson(lesson)}
                          >
                            {deletingLessonId === lesson.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                          </Button>
                        </div>
                      </div>
                    </Reorder.Item>
                  )
                })}
              </Reorder.Group>
            )}
          </CardContent>
        </Card>
      )}

      {/* SETTINGS */}
      {tab === 'settings' && (
        <Card>
          <CardContent className="space-y-4 p-5">
            <h3 className="font-semibold text-on-surface">{t('settings.title')}</h3>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="flex flex-col gap-1">
                <Label className="text-xs">{t('settings.unlockRule')}</Label>
                <Select
                  value={draft.lesson_unlock_rule}
                  onChange={(e) => setDraft({ ...draft, lesson_unlock_rule: e.target.value as TaskDraft['lesson_unlock_rule'] })}
                >
                  <option value="all_available">{t('settings.unlockAll')}</option>
                  <option value="sequential">{t('settings.unlockSequential')}</option>
                  <option value="minimum_score">{t('settings.unlockMinScore')}</option>
                </Select>
              </div>
              <div className="flex flex-col gap-1">
                <Label className="text-xs">{t('settings.activityUnlock')}</Label>
                <Select
                  value={draft.activity_unlock_rule}
                  onChange={(e) => setDraft({ ...draft, activity_unlock_rule: e.target.value as TaskDraft['activity_unlock_rule'] })}
                >
                  <option value="all_available">{t('settings.unlockAll')}</option>
                  <option value="sequential">{t('settings.unlockSequential')}</option>
                </Select>
              </div>
              <div className="flex flex-col gap-1">
                <Label className="text-xs">{t('settings.requiredScore')}</Label>
                <Input
                  type="number"
                  value={draft.required_lesson_score}
                  onChange={(e) => setDraft({ ...draft, required_lesson_score: Number(e.target.value) })}
                />
              </div>
              <div className="flex flex-col gap-1">
                <Label className="text-xs">{t('settings.completion')}</Label>
                <Select
                  value={draft.completion_requirement}
                  onChange={(e) => setDraft({ ...draft, completion_requirement: e.target.value as TaskDraft['completion_requirement'] })}
                >
                  <option value="all_lessons">{t('settings.completionAll')}</option>
                </Select>
              </div>
              <div className="flex flex-col gap-1">
                <Label className="text-xs">{t('settings.minCompletionScore')}</Label>
                <Input
                  type="number"
                  value={draft.min_completion_score}
                  onChange={(e) => setDraft({ ...draft, min_completion_score: Number(e.target.value) })}
                />
              </div>
              <div className="flex flex-col gap-1">
                <Label className="text-xs">{t('common.duration')}</Label>
                <Input value={draft.estimated_duration} onChange={(e) => setDraft({ ...draft, estimated_duration: e.target.value })} />
              </div>
            </div>

            <div className="flex flex-col gap-1">
              <Label className="text-xs">{t('settings.cover')}</Label>
              <ImageUpload
                value={draft.cover_image_url}
                onUpload={(url) => setDraft({ ...draft, cover_image_url: url })}
                onRemove={() => setDraft({ ...draft, cover_image_url: '' })}
                bucket="materials"
                pathPrefix={`tasks/${task.course_id}/covers`}
              />
            </div>
          </CardContent>
        </Card>
      )}

      {/* BATCHES */}
      {tab === 'batches' && (
        <Card>
          <CardContent className="space-y-4 p-5">
            <h3 className="font-semibold text-on-surface">{t('batches.title')}</h3>
            {batches.length === 0 ? (
              <p className="py-6 text-center text-sm text-on-surface-variant">{t('courseDetail.noBatches')}</p>
            ) : (
              batches.map((batch) => {
                const bt = batchTasks.find((x) => x.batch_id === batch.id)
                const inBatch = !!bt
                return (
                  <div key={batch.id} className="flex flex-wrap items-center gap-3 rounded-xl border border-border p-3">
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-on-surface">{batch.name}</p>
                      <p className="text-xs text-on-surface-variant">
                        {inBatch ? `sort #${bt!.sort_order}` : t('courseDetail.tasksInBatch') + ': —'}
                      </p>
                    </div>
                    {inBatch ? (
                      <>
                        <Badge variant={bt!.status === 'published' ? 'success' : 'outline'}>
                          {bt!.status === 'published' ? t('courseDetail.published') : t('courseDetail.unpublished')}
                        </Badge>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={async () => {
                            await supabase.from('batch_tasks').update({ status: bt!.status === 'published' ? 'unpublished' : 'published' }).eq('id', bt!.id)
                            fetchAll()
                          }}
                        >
                          {bt!.status === 'published' ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-destructive hover:bg-destructive/10"
                          onClick={async () => {
                            await supabase.from('batch_tasks').delete().eq('id', bt!.id)
                            fetchAll()
                          }}
                        >
                          <X className="h-3.5 w-3.5" />
                        </Button>
                      </>
                    ) : (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={async () => {
                          const { error } = await supabase.from('batch_tasks').insert({
                            batch_id: batch.id,
                            task_id: taskId,
                            sort_order: 0,
                          })
                          if (error) window.alert(error.message)
                          fetchAll()
                        }}
                      >
                        <Plus className="mr-1 h-3.5 w-3.5" /> {t('batches.addToBatch')}
                      </Button>
                    )}
                  </div>
                )
              })
            )}
          </CardContent>
        </Card>
      )}
    </div>
  )
}