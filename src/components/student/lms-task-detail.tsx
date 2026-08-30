'use client'

import { useEffect, useMemo, useState, useCallback } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { createClient } from '@/lib/supabase-client'
import { useAuth } from '@/lib/auth-context'
import { useI18n } from '@/lib/i18n/client'
import { computeStudentTaskView, fetchStudentProgress, fetchTaskTree, type StudentTaskView } from '@/lib/learning-student'
import type { CourseTask } from '@/types'
import {
  ArrowLeft, ArrowRight, CheckCircle2, Clock, Flag, Loader2, Lock,
  PlayCircle, Unlock, Phone,
} from 'lucide-react'
import DialogPhoneView from '@/components/student/dialog-phone-view'

const NODE_X = [66, 34]
const NODE_GAP = 190
const NODE_START_Y = 96

interface PathNode {
  id: string
  x: number
  y: number
  kind: 'lesson' | 'dialog'
  locked: boolean
  done: boolean
  current: boolean
  title: string
  subtitle: string
  icon: React.ReactNode
  circleCls: string
  href: string
}

export default function LmsTaskDetail({ courseId, taskId }: { courseId: string; taskId: string }) {
  const { user } = useAuth()
  const { t } = useI18n()
  const supabase = createClient()
  const router = useRouter()

  const [view, setView] = useState<StudentTaskView | null>(null)
  const [loading, setLoading] = useState(true)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [dialogStatus, setDialogStatus] = useState<'none'|'active'|'completed'|'expired'|null>(null)
  const [dialogRemaining, setDialogRemaining] = useState<number | null>(null)
  const [dialogEnabled, setDialogEnabled] = useState(false)

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

      const tree = await fetchTaskTree(supabase, taskId)
      if (!tree.task) {
        setView(null)
        return
      }
      const actIds = tree.activities.map((a) => a.id)
      const lessonIds = tree.lessons.map((l) => l.id)
      const progress = await fetchStudentProgress(supabase, user.id, batch, taskId, actIds, lessonIds)
      const computed = computeStudentTaskView({
        tree,
        lessonMap: progress.lessonMap,
        actMap: progress.actMap,
        taskProgress: progress.taskProgress,
      })
      setView(computed)

      // dialog status
      const t = tree.task as unknown as Record<string, unknown>
      const enabled = !!t.dialog_enabled
      setDialogEnabled(enabled)
      if (enabled) {
        try {
          const r = await fetch(`/api/dialog/session?taskId=${taskId}`)
          if (r.ok) {
            const d = await r.json()
            if (d.session) {
              setDialogStatus(d.session.status)
              setDialogRemaining(d.remainingSec)
            } else {
              setDialogStatus('none')
            }
          }
        } catch {}
      }
    } catch (err) {
      console.error('Failed to load task detail', err)
    }
    setLoading(false)
  }, [courseId, taskId, supabase, user])

  useEffect(() => {
    fetchView()
  }, [fetchView])

  const nodes = useMemo<PathNode[]>(() => {
    if (!view) return []
    const out: PathNode[] = []
    const firstActive = view.lessonViews.find((lv) => lv.unlocked && lv.status !== 'completed')
    view.lessonViews.forEach((lv, i) => {
      const y = NODE_START_Y + i * NODE_GAP
      const done = lv.status === 'completed'
      const active = !done && lv.unlocked
      const isCurrent = firstActive?.lesson.id === lv.lesson.id
      const circleCls = done
        ? 'border-emerald-200 bg-emerald-500'
        : isCurrent
          ? 'border-amber-100 bg-amber-400 ring-8 ring-amber-400/25'
          : active
            ? 'border-indigo-100 bg-indigo-500'
            : 'border-slate-200/70 bg-slate-300/80'
      const iconCls = done || active ? 'text-white' : 'text-slate-400'
      out.push({
        id: lv.lesson.id,
        x: NODE_X[i % NODE_X.length],
        y,
        kind: 'lesson',
        locked: !lv.unlocked,
        done,
        current: isCurrent,
        title: lv.lesson.title || `Lesson ${i + 1}`,
        subtitle: done
          ? `${lv.completedActivities}/${lv.totalActivities} ${t('tasks.activities')}${lv.score !== null ? ` • ${t('tasks.score')}: ${lv.score}%` : ''}`
          : active
            ? `${lv.completedActivities}/${lv.totalActivities} ${t('tasks.activities')}`
            : t('student1.tasks.notStarted'),
        icon: done ? (
          <CheckCircle2 className={`h-7 w-7 ${iconCls}`} />
        ) : active ? (
          <PlayCircle className={`h-8 w-8 ${iconCls}`} />
        ) : (
          <Lock className="h-6 w-6 text-slate-400" />
        ),
        circleCls,
        href: `/student/kursus/${courseId}/tasks/${taskId}/lessons/${lv.lesson.id}`,
      })
    })
    // Dialog bot — selalu di akhir learning path (di atasnya semua lessons baru)
    if (dialogEnabled) {
      const taskTitle = (view.tree.task as unknown as Record<string, unknown>).dialog_topic as string | undefined
      const topicShort = taskTitle ? taskTitle.slice(0, 24) : 'Bot Dialog'
      const y = NODE_START_Y + out.length * NODE_GAP
      const done = dialogStatus === 'completed'
      // locked until semua lesson benar-benar completed (bukan sticky taskProgress)
      const allLessonsDone = view.lessonViews.length > 0 && view.lessonViews.every(lv => lv.status === 'completed')
      const locked = !allLessonsDone
      const isCurrent = !done && !locked
      const circleCls = done
        ? 'border-emerald-200 bg-emerald-500'
        : isCurrent
          ? 'border-amber-100 bg-amber-400 ring-8 ring-amber-400/25'
          : locked
            ? 'border-slate-200/70 bg-slate-300/80'
            : 'border-indigo-100 bg-indigo-500'
      const iconCls = done || isCurrent ? 'text-white' : locked ? 'text-slate-400' : 'text-white'
      out.push({
        id: '__dialog__',
        x: 50,
        y,
        kind: 'dialog',
        locked,
        done,
        current: isCurrent,
        title: topicShort,
        subtitle: done ? 'Selesai • Wajib' : locked ? 'Selesaikan semua lesson dulu' : dialogStatus === 'active' && dialogRemaining !== null ? `Sisa ${Math.floor(dialogRemaining/60)}:${String(dialogRemaining%60).padStart(2,'0')} • Wajib` : 'Wajib • 7 Menit • Tap untuk mulai',
        icon: done ? <CheckCircle2 className={`h-7 w-7 ${iconCls}`} /> : <Phone className={`h-6 w-6 ${iconCls}`} />,
        circleCls,
        href: '#dialog',
      })
    }
    return out
  }, [view, dialogEnabled, dialogStatus, dialogRemaining, courseId, taskId, t])

  const last = nodes[nodes.length - 1]
  const pathHeight = last ? last.y + 110 : 120
  const pathD = useMemo(() => {
    const pts = [{ x: 50, y: 60 }, ...nodes.map((n) => ({ x: n.x, y: n.y }))]
    let d = `M ${pts[0].x} ${pts[0].y}`
    for (let i = 1; i < pts.length; i++) {
      const my = (pts[i - 1].y + pts[i].y) / 2
      d += ` C ${pts[i - 1].x} ${my}, ${pts[i].x} ${my}, ${pts[i].x} ${pts[i].y}`
    }
    return d
  }, [nodes])

  const doneCount = nodes.filter((n) => n.done).length
  const pathFraction = nodes.length > 0 ? Math.min(1, Math.max(0, doneCount / nodes.length)) : 0

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-indigo-400" />
      </div>
    )
  }

  if (!view?.tree.task) {
    return (
      <div className="py-20 text-center">
        <p className="mb-4 text-on-surface-variant">{t('tasks.notFound')}</p>
        <Button variant="outline" onClick={() => router.push(`/student/kursus/${courseId}`)}>
          <ArrowLeft className="mr-1 h-4 w-4" /> {t('common.back')}
        </Button>
      </div>
    )
  }

  const task: CourseTask = view.tree.task

  return (
    <div className="space-y-6">
      {/* header */}
      <Card className="overflow-hidden">
        {task.cover_image_url && (
          <img src={task.cover_image_url} alt={task.title} className="h-40 w-full object-cover" />
        )}
        <CardContent className="space-y-4 p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex min-w-0 items-start gap-3">
              <Link href={`/student/kursus/${courseId}`} className="mt-1">
                <ArrowLeft className="h-4 w-4 text-on-surface-variant" />
              </Link>
              <div className="min-w-0">
                <h1 className="text-xl font-bold text-on-surface">{task.title}</h1>
                {task.description && <p className="mt-1 text-sm text-on-surface-variant">{task.description}</p>}
                <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-on-surface-variant">
                  {task.estimated_duration && (
                    <span className="inline-flex items-center gap-1">
                      <Clock className="h-3 w-3" /> {task.estimated_duration}
                    </span>
                  )}
                  {(task.lesson_unlock_rule ?? 'all_available') !== 'all_available' && (
                    <span className="inline-flex items-center gap-1">
                      <Lock className="h-3 w-3" /> {t('tasks.sequentialLessons')}
                    </span>
                  )}
                  {(task.activity_unlock_rule ?? 'sequential') === 'sequential' && (
                    <span className="inline-flex items-center gap-1">
                      <Unlock className="h-3 w-3" /> {t('tasks.sequentialActivities')}
                    </span>
                  )}
                </div>
              </div>
            </div>
            {(() => {
              const effectiveCompleted = view.completed && (!dialogEnabled || dialogStatus === 'completed')
              return (
                <Badge variant={effectiveCompleted ? 'success' : view.percent > 0 || (view.completed && dialogEnabled) ? 'warning' : 'outline'}>
                  {effectiveCompleted
                    ? t('student1.tasks.completed')
                    : view.percent > 0 || (view.completed && dialogEnabled)
                      ? t('student1.tasks.inProgress')
                      : t('student1.tasks.notStarted')}
                </Badge>
              )
            })()}
          </div>

          {(() => {
            const effectiveCompleted = view.completed && (!dialogEnabled || dialogStatus === 'completed')
            const effectivePercent = view.completed && dialogEnabled && dialogStatus !== 'completed' ? Math.min(90, view.percent) : view.percent
            return (
              <div className="flex items-center gap-3">
                <div className="h-2 flex-1 overflow-hidden rounded-full bg-surface-container-highest">
                  <div
                    className={`h-full rounded-full transition-all ${effectiveCompleted ? 'bg-emerald-500' : 'bg-gradient-to-r from-indigo-500 to-indigo-400'}`}
                    style={{ width: `${effectivePercent}%` }}
                  />
                </div>
                <span className="text-sm font-bold text-indigo-400">{effectivePercent}%</span>
              </div>
            )
          })()}

          {!view.completed && view.next?.activityId && (
            <Button
              size="sm"
              onClick={() =>
                router.push(
                  `/student/kursus/${courseId}/tasks/${taskId}/lessons/${view.next!.lessonId}?activity=${view.next!.activityId}`,
                )
              }
            >
              <PlayCircle className="mr-1 h-4 w-4" /> {t('tasks.continueLearning')}
              <ArrowRight className="ml-1 h-3.5 w-3.5" />
            </Button>
          )}
          {view.completed && dialogEnabled && dialogStatus !== 'completed' && (
            <Button size="sm" onClick={() => setDialogOpen(true)} className="bg-emerald-600 hover:bg-emerald-500 text-white">
              <Phone className="mr-1 h-4 w-4" /> {dialogStatus === 'active' ? `Lanjutkan Dialog ${dialogRemaining !== null ? `(${Math.floor(dialogRemaining/60)}:${String(dialogRemaining%60).padStart(2,'0')})` : ''}` : 'Mulai Dialog 7 Menit (Wajib)'}
            </Button>
          )}
          {view.completed && dialogEnabled && dialogStatus === 'completed' && (
            <Badge variant="success"><CheckCircle2 className="mr-1 h-3 w-3" /> Dialog Selesai</Badge>
          )}
        </CardContent>
      </Card>

      {/* learning path */}
      {nodes.length === 0 ? (
        <Card>
          <CardContent className="p-5">
            <p className="py-8 text-center text-sm text-on-surface-variant">{t('tasks.noLessons')}</p>
          </CardContent>
        </Card>
      ) : (
        <div className="relative overflow-hidden rounded-3xl border border-white/10 shadow-xl">
          {/* background image + dark overlay */}
          <div
            className="absolute inset-0 bg-cover bg-center"
            style={{ backgroundImage: "url('/backround-learnpath.jpeg')" }}
          />
          <div className="absolute inset-0 bg-[#0b1326]/65" />
          <div className="absolute inset-0 bg-gradient-to-b from-[#0b1326]/50 via-transparent to-[#0b1326]/70" />

          <div className="relative mx-auto w-full max-w-[640px] py-10">
            <div className="relative" style={{ height: pathHeight }}>
              <svg
                className="pointer-events-none absolute inset-0 h-full w-full"
                viewBox={`0 0 100 ${pathHeight}`}
                preserveAspectRatio="none"
              >
                <path
                  d={pathD}
                  fill="none"
                  stroke="rgba(255,255,255,0.22)"
                  strokeWidth={5}
                  strokeLinecap="round"
                  pathLength={1000}
                />
                <path
                  d={pathD}
                  fill="none"
                  stroke="url(#pathGrad)"
                  strokeWidth={5}
                  strokeLinecap="round"
                  pathLength={1000}
                  strokeDasharray={1000}
                  strokeDashoffset={1000 - pathFraction * 1000}
                  style={{ transition: 'stroke-dashoffset 700ms ease' }}
                />
                <defs>
                  <linearGradient id="pathGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#6366f1" />
                    <stop offset="100%" stopColor="#8b5cf6" />
                  </linearGradient>
                </defs>
              </svg>

              {/* START flag */}
              <div className="absolute left-1/2 top-0 -translate-x-1/2">
                <div className="flex h-8 w-8 items-center justify-center rounded-full border border-white/30 bg-amber-400 shadow-lg shadow-amber-400/30">
                  <Flag className="h-3.5 w-3.5 text-white" />
                </div>
              </div>

            {nodes.map((n) => {
              const right = n.x >= 50
              const size = n.current ? 72 : 64
              const pillCls = right ? 'items-end text-right' : 'items-start text-left'
              const pill = (
                <div
                  className={`flex w-44 max-w-[44vw] flex-col rounded-2xl border border-border bg-surface px-4 py-2.5 shadow-md ${
                    n.locked ? 'opacity-75' : ''
                  } ${pillCls}`}
                >
                  <span className={`truncate text-sm font-semibold ${n.locked ? 'text-muted' : 'text-on-surface'}`}>
                    {n.title}
                  </span>
                  <span
                    className={`mt-0.5 text-xs ${
                      n.locked
                        ? 'text-muted'
                        : n.circleCls.includes('emerald')
                          ? 'text-emerald-600'
                          : n.circleCls.includes('amber')
                            ? 'text-amber-600'
                            : 'text-indigo-500'
                    }`}
                  >
                    {n.subtitle}
                  </span>
                </div>
              )
              const circle = (
                <button
                  type="button"
                  disabled={n.locked}
                  onClick={() => {
                    if (n.locked) return
                    if (n.kind === 'dialog') setDialogOpen(true)
                    else router.push(n.href)
                  }}
                  className={`relative z-10 flex shrink-0 items-center justify-center rounded-full border-4 shadow-lg transition-transform ${
                    n.circleCls
                  } ${n.locked ? 'cursor-not-allowed' : 'hover:scale-110'}`}
                  style={{ width: size, height: size }}
                  aria-label={n.title}
                >
                  {n.current && <span className="absolute inset-0 animate-ping rounded-full bg-amber-400/30" />}
                  <span className="relative">{n.icon}</span>
                </button>
              )
              return (
                <div
                  key={n.id}
                  className="absolute -translate-x-1/2"
                  style={{ left: `${n.x}%`, top: n.y - size / 2 }}
                >
                  <div className={`relative flex items-center gap-3 ${right ? 'flex-row-reverse' : ''}`}>
                    {circle}
                    {pill}
                  </div>
                </div>
              )
            })}
            </div>
          </div>
        </div>
      )}

      {/* Dialog CTA card when at end of unit */}
      {view.completed && dialogEnabled && dialogStatus !== 'completed' && (
        <Card className="overflow-hidden border-emerald-200 bg-emerald-50 dark:bg-emerald-950/20">
          <CardContent className="p-5 flex items-center justify-between gap-4">
            <div>
              <p className="font-semibold text-emerald-700 dark:text-emerald-300">Wajib: Simulasi Telepon 7 Menit</p>
              <p className="text-sm text-emerald-600/80 dark:text-emerald-300/70">Ngobrol turn-based tentang topik unit. Bot hanya membahas topik unit — durasi dari server, refresh tidak reset.</p>
              {dialogStatus === 'active' && dialogRemaining !== null && <p className="text-xs text-emerald-600 mt-1">Sisa waktu: {Math.floor(dialogRemaining/60)}:{String(dialogRemaining%60).padStart(2,'0')}</p>}
            </div>
            <Button onClick={() => setDialogOpen(true)} className="rounded-full bg-emerald-600 hover:bg-emerald-500">
              <Phone className="mr-1 h-4 w-4" /> {dialogStatus === 'active' ? 'Lanjutkan' : 'Mulai'}
            </Button>
          </CardContent>
        </Card>
      )}

      <DialogPhoneView taskId={taskId} open={dialogOpen} onClose={() => { setDialogOpen(false); fetchView() }} onCompleted={() => { setDialogStatus('completed'); fetchView() }} />
    </div>
  )
}
