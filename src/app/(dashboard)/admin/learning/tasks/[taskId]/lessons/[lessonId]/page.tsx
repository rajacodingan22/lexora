'use client'

import { useEffect, useState, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { Reorder } from 'framer-motion'
import { createClient } from '@/lib/supabase-client'
import { useI18n } from '@/lib/i18n/client'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { ActivityEditorModal, defaultContentFor } from '@/components/learning/admin/activity-editor'
import { ActivityTypePicker, getActivityIcon } from '@/components/learning/admin/activity-type-picker'
import { LibraryModal } from '@/components/learning/admin/library-modal'
import { getActivityTypeLabel } from '@/lib/learning'
import type { ActivityLibraryItem, ActivityType, CourseTask, LessonActivity, TaskLesson } from '@/types'
import {
  ArrowLeft, Plus, Loader2, Pencil, Trash2, Copy, Eye, GripVertical,
  Library, X, EyeOff, Save,
} from 'lucide-react'

type ContentMap = Record<string, Record<string, unknown>>

export default function AdminLessonBuilderPage() {
  const { taskId, lessonId } = useParams<{ taskId: string; lessonId: string }>()
  const router = useRouter()
  const { t } = useI18n()
  const supabase = createClient()

  const [task, setTask] = useState<CourseTask | null>(null)
  const [lesson, setLesson] = useState<TaskLesson | null>(null)
  const [activities, setActivities] = useState<LessonActivity[]>([])
  const [contents, setContents] = useState<ContentMap>({})
  const [loading, setLoading] = useState(true)

  const [pickerOpen, setPickerOpen] = useState(false)
  const [libraryOpen, setLibraryOpen] = useState(false)
  const [editingActivity, setEditingActivity] = useState<LessonActivity | null>(null)
  const [editingContent, setEditingContent] = useState<Record<string, unknown>>({})
  const [lessonModalOpen, setLessonModalOpen] = useState(false)
  const [lessonForm, setLessonForm] = useState({ title: '', description: '', icon: '', estimated_duration: '', status: 'draft' })
  const [lessonSaving, setLessonSaving] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [publishingId, setPublishingId] = useState<string | null>(null)

  const fetchAll = useCallback(async () => {
    if (!taskId || !lessonId) return
    setLoading(true)
    try {
      const [taskRes, lessonRes, actRes] = await Promise.all([
        supabase.from('course_tasks').select('*').eq('id', taskId).single(),
        supabase.from('task_lessons').select('*').eq('id', lessonId).single(),
        supabase.from('lesson_activities').select('*').eq('lesson_id', lessonId).order('sort_order', { ascending: true }),
      ])
      setTask(taskRes.data as CourseTask | null)
      setLesson(lessonRes.data as TaskLesson | null)
      const acts = (actRes.data ?? []) as LessonActivity[]
      setActivities(acts)

      if (acts.length > 0) {
        const { data } = await supabase
          .from('activity_content')
          .select('activity_id, content')
          .in('activity_id', acts.map((a) => a.id))
        const map: ContentMap = {}
        for (const row of data ?? []) map[row.activity_id] = row.content
        setContents(map)
      } else {
        setContents({})
      }
    } catch (err) {
      console.error('Failed to load lesson builder:', err)
    }
    setLoading(false)
  }, [taskId, lessonId, supabase])

  useEffect(() => {
    fetchAll()
  }, [fetchAll])

  async function addActivity(type: ActivityType) {
    const sortOrder = activities.length > 0 ? Math.max(...activities.map((a) => a.sort_order)) + 1 : 0
    const { data, error } = await supabase
      .from('lesson_activities')
      .insert({
        lesson_id: lessonId,
        activity_type: type,
        title: getActivityTypeLabel(type).en,
        sort_order: sortOrder,
        status: 'draft',
      })
      .select('id')
      .single()
    if (error) {
      console.error(error)
      return
    }
    await supabase.from('activity_content').insert({
      activity_id: data.id,
      content_type: type,
      content: defaultContentFor(type),
    })
    setPickerOpen(false)
    fetchAll()
  }

  async function useFromLibrary(item: ActivityLibraryItem) {
    const sortOrder = activities.length > 0 ? Math.max(...activities.map((a) => a.sort_order)) + 1 : 0
    const { data, error } = await supabase
      .from('lesson_activities')
      .insert({
        lesson_id: lessonId,
        activity_type: item.activity_type,
        title: `${item.title}`,
        sort_order: sortOrder,
        status: 'draft',
      })
      .select('id')
      .single()
    if (error) {
      console.error(error)
      return
    }
    await supabase.from('activity_content').insert({
      activity_id: data.id,
      content_type: item.activity_type,
      content: item.content,
    })
    await supabase.from('activity_library_items').update({ usage_count: (item.usage_count || 0) + 1 }).eq('id', item.id)
    setLibraryOpen(false)
    fetchAll()
  }

  async function saveActivityPatch(activityId: string, patch: { activity: Partial<LessonActivity>; content: Record<string, unknown> }) {
    const { error: actErr } = await supabase
      .from('lesson_activities')
      .update({
        title: patch.activity.title,
        instruction: patch.activity.instruction ?? null,
      })
      .eq('id', activityId)
    if (actErr) throw actErr

    const existing = contents[activityId]
    const contentVersion = (existing && (patch.content as any).__version
      ? (patch.content as any).__version
      : ((await supabase.from('activity_content').select('content_version').eq('activity_id', activityId).maybeSingle()).data?.content_version ?? 0)) + 1

    const clean = { ...patch.content }
    delete (clean as any).__version
    const { error: cErr } = await supabase
      .from('activity_content')
      .upsert({
        activity_id: activityId,
        content_type: patch.activity.activity_type ?? activities.find((a) => a.id === activityId)?.activity_type,
        content: clean,
        content_version: contentVersion,
        schema_version: 1,
      })
      .eq('activity_id', activityId)
    if (cErr) throw cErr
    fetchAll()
  }

  async function duplicateActivity(a: LessonActivity) {
    const sortOrder = activities.length > 0 ? Math.max(...activities.map((x) => x.sort_order)) + 1 : 0
    const { data, error } = await supabase
      .from('lesson_activities')
      .insert({
        lesson_id: lessonId,
        activity_type: a.activity_type,
        title: `${a.title} (Copy)`,
        instruction: a.instruction,
        sort_order: sortOrder,
        status: 'draft',
      })
      .select('id')
      .single()
    if (error) return
    await supabase.from('activity_content').insert({
      activity_id: data.id,
      content_type: a.activity_type,
      content: contents[a.id] ?? defaultContentFor(a.activity_type),
    })
    fetchAll()
  }

  async function saveToLibrary(a: LessonActivity) {
    const { error } = await supabase.from('activity_library_items').insert({
      activity_type: a.activity_type,
      title: a.title,
      description: a.instruction,
      content: contents[a.id] ?? {},
    })
    if (error) {
      window.alert(error.message)
      return
    }
    window.alert('Saved to library')
  }

  async function deleteActivity(a: LessonActivity) {
    const { count } = await supabase
      .from('student_activity_progress')
      .select('id', { count: 'exact', head: true })
      .eq('activity_id', a.id)
    const used = (count ?? 0) > 0
    const msg = used
      ? 'This activity has existing student progress. Deleting it may affect progress and completion calculations.\n\nDelete anyway?'
      : 'Delete this activity?'
    if (!window.confirm(msg)) return
    setDeletingId(a.id)
    const { error } = await supabase.from('lesson_activities').delete().eq('id', a.id)
    if (error) window.alert(error.message)
    setDeletingId(null)
    fetchAll()
  }

  async function toggleActivityStatus(a: LessonActivity) {
    setPublishingId(a.id)
    const next = a.status === 'published' ? 'draft' : 'published'
    await supabase.from('lesson_activities').update({ status: next }).eq('id', a.id)
    setPublishingId(null)
    fetchAll()
  }

  async function reorder(newList: LessonActivity[]) {
    setActivities(newList)
    const rows = newList.map((a, i) => ({ id: a.id, sort_order: i }))
    await supabase.from('lesson_activities').upsert(rows)
    fetchAll()
  }

  async function saveLesson() {
    setLessonSaving(true)
    const { error } = await supabase
      .from('task_lessons')
      .update({
        title: lessonForm.title,
        description: lessonForm.description || null,
        icon: lessonForm.icon || null,
        estimated_duration: lessonForm.estimated_duration || null,
        status: lessonForm.status,
      })
      .eq('id', lessonId)
    if (error) window.alert(error.message)
    setLessonSaving(false)
    setLessonModalOpen(false)
    fetchAll()
  }

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
      </div>
    )
  }

  if (!task || !lesson) {
    return <div className="py-20 text-center text-slate-400">Lesson not found</div>
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => router.push(`/admin/learning/tasks/${taskId}`)}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-xl font-bold text-slate-900">{lesson.title || 'Untitled Lesson'}</h1>
            <p className="text-xs text-slate-500">{task.title} • Lesson {lesson.lesson_number}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant={lesson.status === 'published' ? 'success' : lesson.status === 'archived' ? 'outline' : 'outline'}>
            {lesson.status}
          </Badge>
          <Button size="sm" variant="outline" onClick={() => router.push(`/admin/learning/preview/${taskId}?lesson=${lessonId}`)}>
            <Eye className="mr-1 h-3.5 w-3.5" /> {t('builder.preview')}
          </Button>
          <Button
            size="sm"
            variant={lesson.status === 'published' ? 'outline' : 'default'}
            disabled={publishingId === lesson.id}
            onClick={async () => {
              setPublishingId(lesson.id)
              const next = lesson.status === 'published' ? 'draft' : 'published'
              await supabase.from('task_lessons').update({ status: next }).eq('id', lesson.id)
              setPublishingId(null)
              fetchAll()
            }}
          >
            {publishingId === lesson.id ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : lesson.status === 'published' ? (
              <EyeOff className="h-3.5 w-3.5" />
            ) : (
              <Eye className="h-3.5 w-3.5" />
            )}
          </Button>
          <Button size="sm" variant="outline" onClick={() => {
            setLessonForm({
              title: lesson.title,
              description: lesson.description || '',
              icon: lesson.icon || '',
              estimated_duration: lesson.estimated_duration || '',
              status: lesson.status,
            })
            setLessonModalOpen(true)
          }}>
            <Pencil className="mr-1 h-3.5 w-3.5" /> Edit
          </Button>
        </div>
      </div>

      <Card className="p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-semibold text-slate-800">Activities ({activities.length})</h2>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" onClick={() => setLibraryOpen(true)}>
              <Library className="mr-1 h-3.5 w-3.5" /> Use from Library
            </Button>
            <Button size="sm" onClick={() => setPickerOpen(true)}>
              <Plus className="mr-1 h-3.5 w-3.5" /> {t('builder.addActivity')}
            </Button>
          </div>
        </div>

        {activities.length === 0 ? (
          <p className="py-8 text-center text-sm text-slate-400">No activities yet. Add the first activity.</p>
        ) : (
          <Reorder.Group axis="y" values={activities} onReorder={reorder} className="space-y-2">
            {activities.map((a) => {
              const Icon = getActivityIcon(a.activity_type)
              return (
                <Reorder.Item key={a.id} value={a} className="cursor-grab rounded-xl border border-slate-200 bg-white p-3 active:cursor-grabbing">
                  <div className="flex items-center gap-3">
                    <GripVertical className="h-4 w-4 shrink-0 text-slate-300" />
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-indigo-50">
                      <Icon className="h-4.5 w-4.5 text-indigo-600" />
                    </span>
                    <button
                      type="button"
                      className="min-w-0 flex-1 text-left"
                      onClick={() => {
                        setEditingActivity(a)
                        setEditingContent(contents[a.id] ?? defaultContentFor(a.activity_type))
                      }}
                    >
                      <p className="truncate text-sm font-medium text-slate-800">{a.title}</p>
                      <p className="truncate text-xs text-slate-500">
                        {getActivityTypeLabel(a.activity_type).en}
                        {a.instruction ? ` • ${a.instruction}` : ''}
                      </p>
                    </button>
                    <Badge variant={a.status === 'published' ? 'success' : 'outline'}>{a.status}</Badge>
                    <div className="flex items-center gap-0.5">
                      <Button size="sm" variant="ghost" disabled={publishingId === a.id} onClick={() => toggleActivityStatus(a)} title="Publish/Unpublish">
                        {publishingId === a.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : a.status === 'published' ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => saveToLibrary(a)} title="Save to library">
                        <Library className="h-3.5 w-3.5" />
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => duplicateActivity(a)} title="Duplicate">
                        <Copy className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-red-600 hover:bg-red-50"
                        disabled={deletingId === a.id}
                        onClick={() => deleteActivity(a)}
                        title="Delete"
                      >
                        {deletingId === a.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                      </Button>
                    </div>
                  </div>
                </Reorder.Item>
              )
            })}
          </Reorder.Group>
        )}
      </Card>

      <ActivityEditorModal
        open={!!editingActivity}
        activity={editingActivity ?? ({} as LessonActivity)}
        content={editingContent}
        title={editingActivity?.title ?? ''}
        onSave={async (patch) => {
          if (editingActivity) await saveActivityPatch(editingActivity.id, patch)
        }}
        onClose={() => setEditingActivity(null)}
      />

      <ActivityTypePicker open={pickerOpen} onSelect={addActivity} onClose={() => setPickerOpen(false)} />
      <LibraryModal open={libraryOpen} onClose={() => setLibraryOpen(false)} onUse={useFromLibrary} />

      {lessonModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4" onClick={() => setLessonModalOpen(false)}>
          <div className="w-full max-w-lg rounded-2xl bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-semibold">Edit Lesson</h3>
              <Button size="sm" variant="ghost" onClick={() => setLessonModalOpen(false)}>
                <X className="h-4 w-4" />
              </Button>
            </div>
            <div className="space-y-3">
              <div className="flex flex-col gap-1">
                <Label className="text-xs">{t('builder.lessonTitle')}</Label>
                <Input value={lessonForm.title} onChange={(e) => setLessonForm({ ...lessonForm, title: e.target.value })} />
              </div>
              <div className="flex flex-col gap-1">
                <Label className="text-xs">{t('builder.lessonDescription')}</Label>
                <Textarea rows={2} value={lessonForm.description} onChange={(e) => setLessonForm({ ...lessonForm, description: e.target.value })} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1">
                  <Label className="text-xs">Icon (emoji)</Label>
                  <Input value={lessonForm.icon} onChange={(e) => setLessonForm({ ...lessonForm, icon: e.target.value })} />
                </div>
                <div className="flex flex-col gap-1">
                  <Label className="text-xs">{t('common.duration')}</Label>
                  <Input value={lessonForm.estimated_duration} onChange={(e) => setLessonForm({ ...lessonForm, estimated_duration: e.target.value })} />
                </div>
              </div>
              <div className="flex flex-col gap-1">
                <Label className="text-xs">{t('builder.status')}</Label>
                <Select value={lessonForm.status} onChange={(e) => setLessonForm({ ...lessonForm, status: e.target.value })}>
                  <option value="draft">draft</option>
                  <option value="published">published</option>
                  <option value="archived">archived</option>
                </Select>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <Button variant="outline" onClick={() => setLessonModalOpen(false)}>{t('common.cancel')}</Button>
                <Button disabled={lessonSaving} onClick={saveLesson}>
                  {lessonSaving ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Save className="mr-1 h-4 w-4" />}
                  {t('common.save')}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}