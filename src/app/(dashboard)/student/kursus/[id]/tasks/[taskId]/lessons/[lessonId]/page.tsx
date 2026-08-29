'use client'

import { useEffect, useState, useCallback } from 'react'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { createClient } from '@/lib/supabase-client'
import { useAuth } from '@/lib/auth-context'
import { useI18n } from '@/lib/i18n/client'
import { computeStudentTaskView, fetchStudentProgress, fetchTaskTree, type StudentTaskView } from '@/lib/learning-student'
import { ActivityRenderer, type SubmitPayload } from '@/components/student/activities/activity-renderer'
import { getActivityIcon } from '@/components/learning/admin/activity-type-picker'
import { getActivityTypeLabel } from '@/lib/learning'
import {
  ArrowLeft, CheckCircle2, ChevronRight, Lock, Loader2, PlayCircle, Unlock,
} from 'lucide-react'

export default function StudentLessonPlayerPage() {
  const { id: courseId, taskId, lessonId } = useParams<{ id: string; taskId: string; lessonId: string }>()
  const router = useRouter()
  const searchParams = useSearchParams()
  const { user } = useAuth()
  const { t } = useI18n()
  const supabase = createClient()

  const [view, setView] = useState<StudentTaskView | null>(null)
  const [batchId, setBatchId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [result, setResult] = useState<SubmitPayload | null>(null)

  const activityId = searchParams.get('activity')

  const fetchView = useCallback(async () => {
    if (!user) return
    setLoading(true)
    try {
      const { data: enroll } = await supabase
        .from('enrollments')
        .select('batch_id')
        .eq('user_id', user.id)
        .eq('course_id', courseId)
        .maybeSingle()
      const batch = (enroll?.batch_id as string | null) ?? null
      setBatchId(batch)

      const tree = await fetchTaskTree(supabase, taskId)
      if (!tree.task) {
        setView(null)
        return
      }
      const actIds = tree.activities.map((a) => a.id)
      const lessonIds = tree.lessons.map((l) => l.id)
      const progress = await fetchStudentProgress(supabase, user.id, batch, taskId, actIds, lessonIds)
      setView(
        computeStudentTaskView({
          tree,
          lessonMap: progress.lessonMap,
          actMap: progress.actMap,
          taskProgress: progress.taskProgress,
        }),
      )
    } catch (err) {
      console.error('Failed to load lesson player', err)
    }
    setLoading(false)
  }, [courseId, taskId, supabase, user])

  useEffect(() => {
    setResult(null)
    fetchView()
  }, [fetchView, activityId, lessonId])

  async function persistProgress(activityId: string, lessonId: string, payload: SubmitPayload) {
    if (!user || !batchId) return
    setSaving(true)
    try {
      const res = await fetch('/api/student/progress', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          activityId,
          lessonId,
          taskId,
          score: payload.result.score,
          answers: payload.answers,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        console.error('Failed to save progress via API:', data.error)
        // Fallback: still refresh view so UI not stuck
      }
      // Refresh view from server source of truth
      await fetchView()
    } catch (e) {
      console.error('persistProgress API error', e)
    } finally {
      setSaving(false)
    }
  }

  const activityViews = view && view.lessonViews.find((lv) => lv.lesson.id === lessonId)
  const acts = activityViews ? view.activityViewsByLesson[lessonId] ?? [] : []
  const currentIdx = acts.findIndex((av) => av.activity.id === activityId)
  const current = currentIdx >= 0 ? acts[currentIdx] : null
  const content = current ? view?.tree.contents[current.activity.id] ?? {} : {}

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-indigo-400" />
      </div>
    )
  }

  if (!view?.tree.task || !activityViews) {
    return <div className="py-20 text-center text-on-surface-variant">{t('tasks.notFound')}</div>
  }

  if (!current) {
    const firstUnlocked = acts.find((av) => av.unlocked)
    if (firstUnlocked) {
      router.replace(`/student/kursus/${courseId}/tasks/${taskId}/lessons/${lessonId}?activity=${firstUnlocked.activity.id}`)
      return null
    }
    return (
      <div className="py-20 text-center">
        <Lock className="mx-auto mb-3 h-8 w-8 text-on-surface-variant/40" />
        <p className="text-on-surface-variant">{t('tasks.lessonLocked')}</p>
      </div>
    )
  }

  const completed = view.completed

  return (
    <div className="mx-auto max-w-4xl space-y-5 p-4 sm:p-6">
      {/* header */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Link href={`/student/kursus/${courseId}/tasks/${taskId}`} className="inline-flex items-center gap-1 text-sm text-on-surface-variant hover:text-indigo-500">
          <ArrowLeft className="h-4 w-4" /> {view.tree.task.title}
        </Link>
        <div className="flex items-center gap-2 text-xs text-on-surface-variant">
          <span className="font-medium text-on-surface">{activityViews.lesson.title}</span>
          <span className="text-muted">•</span>
          <span>
            {currentIdx + 1} / {acts.length}
          </span>
        </div>
      </div>

      {/* progress bar */}
      <div className="h-1.5 overflow-hidden rounded-full bg-surface-container-highest">
        <div
          className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-indigo-400 transition-all"
          style={{ width: `${Math.round((currentIdx / Math.max(1, acts.length)) * 100)}%` }}
        />
      </div>

      {/* sidebar-less activity list (horizontal chips) */}
      <div className="flex flex-wrap gap-1.5">
        {acts.map((av, i) => {
          const Icon = getActivityIcon(av.activity.activity_type)
          const active = i === currentIdx
          return (
            <button
              key={av.activity.id}
              type="button"
              disabled={!av.unlocked}
              onClick={() => {
                setResult(null)
                router.replace(`/student/kursus/${courseId}/tasks/${taskId}/lessons/${lessonId}?activity=${av.activity.id}`)
              }}
              className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs transition-colors ${
                active
                  ? 'border-primary bg-primary text-primary-foreground'
                  : av.status === 'completed'
                    ? 'border-success bg-success/10 text-success'
                    : av.unlocked
                      ? 'border-border text-on-surface hover:border-primary/50'
                      : 'border-border text-on-surface-variant/40'
              }`}
            >
              {av.status === 'completed' ? (
                <CheckCircle2 className="h-3 w-3" />
              ) : av.unlocked ? (
                <Unlock className="h-3 w-3" />
              ) : (
                <Lock className="h-3 w-3" />
              )}
              <Icon className="h-3 w-3" />
              <span className="max-w-28 truncate">{av.activity.title}</span>
            </button>
          )
        })}
      </div>

      {/* activity card */}
      <Card>
        <CardContent className="p-5">
          <div className="mb-4 flex items-center gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-indigo-50">
              {(() => {
                const Icon = getActivityIcon(current.activity.activity_type)
                return <Icon className="h-4.5 w-4.5 text-indigo-600" />
              })()}
            </span>
            <div className="min-w-0 flex-1">
              <h2 className="truncate font-semibold text-on-surface">{current.activity.title}</h2>
              <p className="text-xs text-on-surface-variant">
                {getActivityTypeLabel(current.activity.activity_type).en}
              </p>
            </div>
            {current.status === 'completed' && <Badge variant="success">{t('student1.tasks.completed')}</Badge>}
          </div>

          {result ? (
            <div className="space-y-4 py-4">
              <div className="text-center">
                <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500/10">
                  <CheckCircle2 className="h-8 w-8 text-emerald-500" />
                </div>
                <div>
                  <p className="text-3xl font-bold text-on-surface">{result.result.score}%</p>
                  <p className="mt-1 text-sm text-on-surface-variant">
                    {result.result.correct} / {result.result.total} {t('tasks.correct')}
                  </p>
                </div>
              </div>

              {Boolean((result.answers as Record<string, unknown>)?.aiFeedback) && (
                <div className="rounded-xl border border-indigo-200 bg-indigo-50 p-4 text-left">
                  <p className="mb-2 text-sm font-semibold text-indigo-800">AI Feedback</p>
                  <p className="whitespace-pre-wrap text-sm text-indigo-700">
                    {String((result.answers as Record<string, unknown>).aiFeedback)}
                  </p>
                </div>
              )}

              {Array.isArray((result.answers as Record<string, unknown>)?.aiCorrections) &&
                ((result.answers as Record<string, unknown>).aiCorrections as Array<Record<string, string>>).length > 0 && (
                <div className="rounded-xl border border-warning/30 bg-warning/5 p-4 text-left">
                  <p className="mb-2 text-sm font-semibold text-warning">Corrections</p>
                  <div className="space-y-2">
                    {((result.answers as Record<string, unknown>).aiCorrections as Array<Record<string, string>>).map((c, i) => (
                      <div key={i} className="text-sm">
                        <span className="text-destructive line-through">{c.original}</span>
                        <span className="mx-1 text-on-surface-variant/40">→</span>
                        <span className="text-success font-medium">{c.corrected}</span>
                        {c.explanation && <p className="mt-0.5 text-xs text-on-surface-variant">{c.explanation}</p>}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {result.result.score < 100 && (
                <p className="mx-auto max-w-sm text-center text-xs text-amber-600">{t('tasks.retryHint')}</p>
              )}
              <div className="flex justify-center gap-2">
                <Button
                  variant="outline"
                  onClick={() => router.push(`/student/kursus/${courseId}/tasks/${taskId}`)}
                >
                  {t('tasks.backToTask')}
                </Button>
                <Button
                  disabled={saving}
                  onClick={() => {
                    setResult(null)
                    router.push(`/student/kursus/${courseId}/tasks/${taskId}`)
                  }}
                >
                  {t('tasks.finish')} <ChevronRight className="ml-1 h-4 w-4" />
                </Button>
              </div>
            </div>
          ) : (
            <ActivityRenderer
              activity={current.activity}
              content={content}
              taskId={taskId}
              batchId={batchId ?? undefined}
              onComplete={async (payload) => {
                setResult(payload)
                await persistProgress(current.activity.id, lessonId, payload)
              }}
            />
          )}

          {saving && (
            <div className="mt-3 flex items-center justify-center gap-2 text-xs text-on-surface-variant">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> {t('tasks.savingProgress')}
            </div>
          )}
        </CardContent>
      </Card>

      {/* bottom nav */}
      <div className="flex items-center justify-between">
        <Button
          variant="outline"
          disabled={currentIdx === 0}
          onClick={() => {
            setResult(null)
            router.replace(`/student/kursus/${courseId}/tasks/${taskId}/lessons/${lessonId}?activity=${acts[currentIdx - 1].activity.id}`)
          }}
        >
          <ArrowLeft className="mr-1 h-4 w-4" /> {t('tasks.prevActivity')}
        </Button>
        {currentIdx < acts.length - 1 && (
          <Button
            disabled={current.status !== 'completed'}
            onClick={() => {
              setResult(null)
              router.replace(`/student/kursus/${courseId}/tasks/${taskId}/lessons/${lessonId}?activity=${acts[currentIdx + 1].activity.id}`)
            }}
          >
            {t('tasks.nextActivity')} <ChevronRight className="ml-1 h-4 w-4" />
          </Button>
        )}
        {currentIdx === acts.length - 1 && !completed && (
          <Button
            disabled={current.status !== 'completed'}
            onClick={() => {
              setResult(null)
              router.push(`/student/kursus/${courseId}/tasks/${taskId}`)
            }}
          >
            {t('tasks.finishLesson')} <ChevronRight className="ml-1 h-4 w-4" />
          </Button>
        )}
        {currentIdx === acts.length - 1 && completed && (
          <Button onClick={() => router.push(`/student/kursus/${courseId}/tasks/${taskId}`)}>
            <PlayCircle className="mr-1 h-4 w-4" /> {t('tasks.finishLesson')}
          </Button>
        )}
      </div>
    </div>
  )
}
