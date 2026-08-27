'use client'

import { useEffect, useState, useCallback } from 'react'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase-client'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { getActivityTypeLabel, activityContentReady } from '@/lib/learning'
import { getActivityIcon } from '@/components/learning/admin/activity-type-picker'
import { ActivityRenderer, type SubmitPayload } from '@/components/student/activities/activity-renderer'
import type { CourseTask, LessonActivity, TaskLesson } from '@/types'
import { CheckCircle2, Loader2, X, Lock } from 'lucide-react'

export default function AdminPreviewPage() {
  const { taskId } = useParams<{ taskId: string }>()
  const router = useRouter()
  const searchParams = useSearchParams()
  const supabase = createClient()

  const [task, setTask] = useState<CourseTask | null>(null)
  const [lessons, setLessons] = useState<TaskLesson[]>([])
  const [activities, setActivities] = useState<LessonActivity[]>([])
  const [contents, setContents] = useState<Record<string, Record<string, unknown>>>({})
  const [loading, setLoading] = useState(true)
  const [previewResult, setPreviewResult] = useState<SubmitPayload | null>(null)

  const lessonId = searchParams.get('lesson')
  const activeLesson = lessons.find((l) => l.id === lessonId) ?? lessons[0]
  const activeActivities = activities.filter((a) => a.lesson_id === activeLesson?.id)

  const fetchAll = useCallback(async () => {
    if (!taskId) return
    setLoading(true)
    const [taskRes, lessonRes] = await Promise.all([
      supabase.from('course_tasks').select('*').eq('id', taskId).single(),
      supabase.from('task_lessons').select('*').eq('task_id', taskId).order('sort_order', { ascending: true }),
    ])
    setTask(taskRes.data as CourseTask | null)
    const lsn = (lessonRes.data ?? []) as TaskLesson[]
    setLessons(lsn)
    if (lsn.length > 0) {
      const actRes = await supabase
        .from('lesson_activities')
        .select('*')
        .in('lesson_id', lsn.map((l) => l.id))
        .order('sort_order', { ascending: true })
      const acts = (actRes.data ?? []) as LessonActivity[]
      setActivities(acts)
      if (acts.length > 0) {
        const cRes = await supabase
          .from('activity_content')
          .select('activity_id, content')
          .in('activity_id', acts.map((a) => a.id))
        const map: Record<string, Record<string, unknown>> = {}
        for (const row of cRes.data ?? []) map[row.activity_id] = row.content
        setContents(map)
      }
    }
    setLoading(false)
  }, [taskId, supabase])

  useEffect(() => {
    fetchAll()
  }, [fetchAll])

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-50">
      {/* admin preview banner */}
      <div className="sticky top-0 z-40 flex items-center justify-center gap-3 bg-indigo-600 px-4 py-2 text-sm font-medium text-white">
        ADMIN PREVIEW MODE — no student progress will be saved
        <Button
          size="sm"
          variant="outline"
          className="h-7 border-white/40 bg-white/10 text-white hover:bg-white/20"
          onClick={() => router.push(`/admin/learning/tasks/${taskId}`)}
        >
          <X className="mr-1 h-3.5 w-3.5" /> Exit Preview
        </Button>
      </div>

      <div className="mx-auto flex max-w-6xl gap-5 p-5">
        {/* lesson sidebar */}
        <div className="w-64 shrink-0">
          <div className="rounded-2xl border border-slate-200 bg-white p-3">
            <p className="mb-2 truncate px-2 text-sm font-semibold text-slate-800">{task?.title}</p>
            {lessons.map((l, i) => {
              const lessonActs = activities.filter((a) => a.lesson_id === l.id)
              const allPublished = lessonActs.length > 0 && lessonActs.every((a) => a.status === 'published')
              return (
                <button
                  key={l.id}
                  type="button"
                  onClick={() => router.replace(`/admin/learning/preview/${taskId}?lesson=${l.id}`)}
                  className={`flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-sm transition-colors ${
                    activeLesson?.id === l.id ? 'bg-indigo-50 text-indigo-700' : 'text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-slate-500">
                    {i + 1}
                  </span>
                  <span className="min-w-0 flex-1 truncate">{l.title}</span>
                  {lessonActs.length > 0 && allPublished ? (
                    <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-500" />
                  ) : lessonActs.length > 0 ? (
                    <Lock className="h-3.5 w-3.5 shrink-0 text-slate-300" />
                  ) : null}
                </button>
              )
            })}
          </div>
        </div>

        {/* activity viewer */}
        <div className="min-w-0 flex-1">
          {!activeLesson ? (
            <div className="py-20 text-center text-slate-400">No lessons in this task</div>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <h1 className="text-lg font-bold text-slate-900">
                    {activeLesson.icon ? `${activeLesson.icon} ` : ''}
                    {activeLesson.title}
                  </h1>
                  <p className="text-xs text-slate-500">{activeLesson.description}</p>
                </div>
                <Badge variant="outline">{activeLesson.lesson_number}</Badge>
              </div>

              {activeActivities.length === 0 ? (
                <p className="py-16 text-center text-sm text-slate-400">No activities in this lesson</p>
              ) : (
                activeActivities.map((a) => {
                  const content = contents[a.id] ?? {}
                  const ready = activityContentReady(a.activity_type, content)
                  const Icon = getActivityIcon(a.activity_type)
                  return (
                    <div key={a.id} className="rounded-2xl border border-slate-200 bg-white p-4">
                      <div className="flex items-center gap-3">
                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-indigo-50">
                          <Icon className="h-4.5 w-4.5 text-indigo-600" />
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-semibold text-slate-800">{a.title}</p>
                          <p className="text-xs text-slate-500">
                            {getActivityTypeLabel(a.activity_type).en} • {a.status}
                          </p>
                        </div>
                        {ready ? (
                          <Badge variant="success">Ready</Badge>
                        ) : (
                          <Badge variant="warning">Incomplete</Badge>
                        )}
                      </div>
                      <div className="mt-3 border-t border-slate-100 pt-4">
                        <ActivityRenderer
                          activity={a}
                          content={content}
                          preview
                          onComplete={(payload) => setPreviewResult(payload)}
                        />
                        {previewResult && (
                          <div className="mt-3 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-700">
                            Preview result: {previewResult.result.score}% ({previewResult.result.correct}/{previewResult.result.total})
                          </div>
                        )}
                      </div>
                    </div>
                  )
                })
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
