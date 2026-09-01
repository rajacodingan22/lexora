'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { createClient } from '@/lib/supabase-client'
import { useAuth } from '@/lib/auth-context'
import { useI18n } from '@/lib/i18n/client'
import { fetchAssignedTasks, fetchEnrollmentBatch, fetchTaskTree, type TaskTree } from '@/lib/learning-student'
import { buildTaskWithMeta, courseTaskStats, type TaskWithMeta } from '@/lib/tasks'
import type { CourseTask, StudentTaskProgress, TaskMaterial, MaterialProgressStatus } from '@/types'
import {
  ListChecks, Loader2, Lock, PlayCircle, CheckCircle2, Clock,
  ArrowRight, Layers
} from 'lucide-react'

interface TasksTabProps {
  courseId: string
}

interface LmsTaskRow {
  task: CourseTask
  tree: TaskTree
  progress: StudentTaskProgress | null
  totalActivities: number
  completedActivities: number
  lessonTitles: string[]
}

function TaskCover({ task, className }: { task: CourseTask; className?: string }) {
  const [error, setError] = useState(false)
  if (!task.cover_image_url || error) {
    return (
      <div className={`flex items-center justify-center bg-gradient-to-br from-indigo-500/15 via-purple-500/10 to-transparent ${className || ''}`}>
        <ListChecks className="h-8 w-8 text-indigo-400/60" />
      </div>
    )
  }
  return (
    <img
      src={task.cover_image_url}
      alt={task.title}
      onError={() => setError(true)}
      className={`object-cover ${className || ''}`}
    />
  )
}

function LmsStateBadge({ row }: { row: LmsTaskRow }) {
  const { t } = useI18n()
  const completed = row.progress?.status === 'completed' || (row.totalActivities > 0 && row.completedActivities === row.totalActivities)
  if (completed) {
    return <Badge variant="success"><CheckCircle2 className="mr-1 h-3 w-3" />{t('student1.tasks.completed')}</Badge>
  }
  if (row.completedActivities > 0) {
    return <Badge variant="warning"><Clock className="mr-1 h-3 w-3" />{t('student1.tasks.inProgress')}</Badge>
  }
  return <Badge variant="outline">{t('student1.tasks.notStarted')}</Badge>
}

function LegacyStateBadge({ task }: { task: TaskWithMeta }) {
  const { t } = useI18n()
  if (task.taskState === 'completed') {
    return <Badge variant="success"><CheckCircle2 className="mr-1 h-3 w-3" />{t('student1.tasks.completed')}</Badge>
  }
  if (task.taskState === 'in_progress') {
    return <Badge variant="warning"><Clock className="mr-1 h-3 w-3" />{t('student1.tasks.inProgress')}</Badge>
  }
  return <Badge variant="outline">{t('student1.tasks.notStarted')}</Badge>
}

export default function TasksTab({ courseId }: TasksTabProps) {
  const { user } = useAuth()
  const { t } = useI18n()
  const supabase = createClient()

  const [lmsRows, setLmsRows] = useState<LmsTaskRow[]>([])
  const [legacyTasks, setLegacyTasks] = useState<TaskWithMeta[]>([])
  const [loading, setLoading] = useState(true)

  const fetchLegacy = useCallback(async (taskIds: string[]) => {
    if (!user || taskIds.length === 0) {
      setLegacyTasks([])
      return
    }
    const [materialsRes, progressRes] = await Promise.all([
      supabase
        .from('task_materials')
        .select('*')
        .in('task_id', taskIds)
        .order('sort_order', { ascending: true }),
      supabase
        .from('student_material_progress')
        .select('material_id, status')
        .eq('user_id', user.id),
    ])

    const materials = (materialsRes.data || []) as TaskMaterial[]
    const materialsByTask = new Map<string, TaskMaterial[]>()
    for (const m of materials) {
      const list = materialsByTask.get(m.task_id) || []
      list.push(m)
      materialsByTask.set(m.task_id, list)
    }

    const progressMap = new Map<string, MaterialProgressStatus>()
    for (const p of (progressRes.data || []) as { material_id: string; status: MaterialProgressStatus }[]) {
      progressMap.set(p.material_id, p.status)
    }

    const { data: legacyRaw } = await supabase
      .from('course_tasks')
      .select('*')
      .in('id', taskIds)
      .eq('status', 'published')
      .order('sort_order', { ascending: true })

    setLegacyTasks(
      ((legacyRaw || []) as CourseTask[]).map(task => {
        const matList = materialsByTask.get(task.id) || []
        const prog: Record<string, MaterialProgressStatus> = {}
        for (const m of matList) {
          prog[m.id] = progressMap.get(m.id) || 'not_started'
        }
        return buildTaskWithMeta(task, matList, prog)
      })
    )
  }, [supabase, user])

  const fetchTasks = useCallback(async () => {
    if (!user) return
    setLoading(true)
    try {
      const batchId = await fetchEnrollmentBatch(supabase, user.id, courseId)
      const assigned = await fetchAssignedTasks(supabase, courseId, batchId)

      if (assigned.length === 0) {
        setLmsRows([])
        setLegacyTasks([])
        setLoading(false)
        return
      }

      const taskIds = assigned.map(({ task }) => task.id)

      // Batch fetch: all lessons for assigned tasks
      const { data: allLessons } = await supabase
        .from('task_lessons')
        .select('*')
        .in('task_id', taskIds)
        .eq('status', 'published')
        .order('sort_order', { ascending: true })

      const lessonsByTask = new Map<string, typeof allLessons>()
      for (const l of (allLessons || []) as any[]) {
        const arr = lessonsByTask.get(l.task_id) || []
        arr.push(l)
        lessonsByTask.set(l.task_id, arr)
      }

      const publishedTaskIds = [...lessonsByTask.keys()]
      const legacyIds: string[] = taskIds.filter(id => !publishedTaskIds.includes(id))

      // For LMS tasks, batch fetch activities + contents + progress
      let lmsRowsOut: LmsTaskRow[] = []
      if (publishedTaskIds.length > 0) {
        const publishedLessons = (allLessons || []) as any[]
        const lessonIds = publishedLessons.map(l => l.id)

        const { data: allActivities } = await supabase.from('lesson_activities').select('*').in('lesson_id', lessonIds).eq('status', 'published').order('sort_order', { ascending: true })

        // Fetch contents via activity ids
        const actIdsAll = ((allActivities || []) as any[]).map(a => a.id)
        const { data: contentsData } = actIdsAll.length > 0
          ? await supabase.from('activity_content').select('activity_id, content').in('activity_id', actIdsAll)
          : { data: [] as any[] }

        const contentsMap = new Map<string, Record<string, unknown>>()
        for (const row of (contentsData || []) as any[]) {
          contentsMap.set(row.activity_id, row.content)
        }

        const activitiesByLesson = new Map<string, any[]>()
        for (const a of (allActivities || []) as any[]) {
          const arr = activitiesByLesson.get(a.lesson_id) || []
          arr.push(a)
          activitiesByLesson.set(a.lesson_id, arr)
        }

        // Batch progress fetch (skip if no batch - user not yet assigned)
        let taskProgressMap = new Map<string, StudentTaskProgress>()
        let completedByActivity = new Map<string, number>()
        let countByTask = new Map<string, { total: number; completed: number }>()
        if (batchId) {
          const [{ data: allTaskProgress }, { data: allActProgress }] = await Promise.all([
            supabase.from('student_task_progress').select('*').eq('user_id', user.id).eq('batch_id', batchId).in('task_id', publishedTaskIds),
            supabase.from('student_activity_progress').select('activity_id, status').eq('user_id', user.id).eq('batch_id', batchId).in('activity_id', actIdsAll),
          ])
          for (const p of (allTaskProgress || []) as StudentTaskProgress[]) {
            taskProgressMap.set(p.task_id, p)
          }
          const completedSet = new Set((allActProgress || []).filter((p:any)=>p.status==='completed').map((p:any)=>p.activity_id))
          for (const act of (allActivities || []) as any[]) {
            const tid = publishedLessons.find((l:any)=>l.id===act.lesson_id)?.task_id
            if (!tid) continue
            const cur = countByTask.get(tid) || { total: 0, completed: 0 }
            cur.total++
            if (completedSet.has(act.id)) cur.completed++
            countByTask.set(tid, cur)
          }
        } else {
          // No batch: no progress yet, but still show tasks
          for (const act of (allActivities || []) as any[]) {
            const tid = publishedLessons.find((l:any)=>l.id===act.lesson_id)?.task_id
            if (!tid) continue
            const cur = countByTask.get(tid) || { total: 0, completed: 0 }
            cur.total++
            countByTask.set(tid, cur)
          }
        }

        lmsRowsOut = assigned.filter(({ task }) => publishedTaskIds.includes(task.id)).map(({ task }) => {
          const taskLessons = lessonsByTask.get(task.id) || []
          const taskActs = taskLessons.flatMap(l => activitiesByLesson.get(l.id) || [])
          const contents: Record<string, Record<string, unknown>> = {}
          for (const a of taskActs) {
            if (contentsMap.has(a.id)) contents[a.id] = contentsMap.get(a.id)!
          }
          const tree: TaskTree = {
            task,
            lessons: taskLessons,
            activities: taskActs,
            contents,
          }
          const cnt = countByTask.get(task.id) || { total: 0, completed: 0 }
          return {
            task,
            tree,
            progress: taskProgressMap.get(task.id) || null,
            totalActivities: cnt.total,
            completedActivities: cnt.completed,
            lessonTitles: taskLessons.map((l: any) => l.title || l.name || ''),
          }
        })
      }

      setLmsRows(lmsRowsOut)

      if (legacyIds.length > 0) {
        await fetchLegacy(legacyIds)
      } else {
        setLegacyTasks([])
      }
    } catch (err) {
      console.error('Failed to fetch tasks', err)
    } finally {
      setLoading(false)
    }
  }, [courseId, user, fetchLegacy])

  useEffect(() => {
    fetchTasks()
  }, [fetchTasks])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-8 w-8 animate-spin text-indigo-400" />
      </div>
    )
  }

  if (lmsRows.length === 0 && legacyTasks.length === 0) {
    return (
      <Card className="flex flex-col items-center justify-center px-6 py-16 text-center">
        <ListChecks className="h-12 w-12 text-muted mb-3" />
        <h3 className="text-base font-semibold text-on-surface">{t('student1.tasks.emptyTitle')}</h3>
        <p className="mt-1 text-sm text-on-surface-variant max-w-sm">{t('student1.tasks.emptyDesc')}</p>
      </Card>
    )
  }

  const lmsTotalActivities = lmsRows.reduce((s, r) => s + r.totalActivities, 0)
  const lmsCompletedActivities = lmsRows.reduce((s, r) => s + r.completedActivities, 0)
  const overall = courseTaskStats(legacyTasks)
  const overallPercent =
    overall.total + lmsTotalActivities > 0
      ? Math.round(
          ((overall.done + lmsCompletedActivities) / (overall.total + lmsTotalActivities)) * 100,
        )
      : 0

  // --- Rosetta / Duolingo style pastel grid ---
  const PASTEL = ['#E8F5C8','#E6F0FA','#DDE3FF','#FDE4C8','#E0F7F7','#EDE5FD','#FFF3B0','#DDE8F7','#FFD6D6','#F5E6C8'] as const
  const allUnits = [
    ...lmsRows.map(r => ({ id: r.task.id, task: r.task, cover: r.task.cover_image_url, title: r.task.title, number: r.task.task_number, row: r as LmsTaskRow | null, legacy: null as TaskWithMeta | null, lessonTitles: r.lessonTitles })),
    ...legacyTasks.map(lt => ({ id: lt.id, task: lt as unknown as CourseTask, cover: (lt as any).cover_image_url ?? null, title: (lt as any).title, number: (lt as any).task_number, row: null, legacy: lt, lessonTitles: [] as string[] })),
  ].sort((a,b) => (a.number ?? 0) - (b.number ?? 0))

  // Find next not-completed unit for Start button highlight (like screenshot UNIT 2)
  const nextIdx = allUnits.findIndex(u => {
    if (u.row) return !(u.row.progress?.status === 'completed' || (u.row.totalActivities>0 && u.row.completedActivities===u.row.totalActivities))
    if (u.legacy) return u.legacy.taskState !== 'completed'
    return true
  })
  const activeIdx = nextIdx >= 0 ? nextIdx : 0

  return (
    <div className="space-y-6">
      {(lmsRows.length > 0 || legacyTasks.length > 0) && (
        <Card className="overflow-hidden">
          <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-indigo-500/15">
              <ListChecks className="h-6 w-6 text-indigo-400" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-semibold text-on-surface">{t('student1.tasks.overallProgress')}</p>
              <p className="text-xs text-on-surface-variant mt-0.5">{t('student1.tasks.overallDesc')}</p>
            </div>
            <div className="flex items-center gap-3">
              <div className="text-right">
                <p className="text-2xl font-bold text-indigo-400">{overallPercent}%</p>
                <p className="text-[10px] text-muted">{t('student1.tasks.taskProgress', { done: overall.done + lmsCompletedActivities, total: overall.total + lmsTotalActivities })}</p>
              </div>
              <div className="h-2 w-28 overflow-hidden rounded-full bg-surface-container-highest">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-indigo-400 transition-all"
                  style={{ width: `${overallPercent}%` }}
                />
              </div>
            </div>
          </div>
        </Card>
      )}

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
        {allUnits.map((u, idx) => {
          const bg = PASTEL[idx % PASTEL.length]
          const isActive = idx === activeIdx
          const isCompleted = u.row ? (u.row.progress?.status === 'completed' || (u.row.totalActivities>0 && u.row.completedActivities===u.row.totalActivities)) : u.legacy ? u.legacy.taskState==='completed' : false
          return (
            <Link key={u.id} href={`/student/kursus/${courseId}/tasks/${u.id}`} className="group block">
              <div className="relative flex h-[320px] flex-col overflow-hidden rounded-2xl border-2 border-black/5 p-3 transition-all duration-200 group-hover:-translate-y-1 group-hover:shadow-xl" style={{ background: bg }}>
                {/* Top bar: UNIT badge + check */}
                <div className="flex items-start justify-between">
                  <span className="rounded-md bg-white px-2.5 py-1 text-xs font-bold tracking-wider text-black shadow-sm">UNIT {u.number ?? idx+1}</span>
                  {isCompleted && <span className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-500 text-white"><CheckCircle2 className="h-4 w-4" /></span>}
                </div>
                {/* Title */}
                <h3 className="mt-4 line-clamp-2 min-h-[3rem] text-[18px] font-bold leading-tight text-black">{u.title}</h3>
                {/* Lesson titles preview */}
                {u.lessonTitles.length > 0 && (
                  <div className="mt-1 space-y-0.5">
                    {u.lessonTitles.slice(0, 3).map((lt, li) => (
                      <p key={li} className="text-[11px] text-black/60 truncate">• {lt}</p>
                    ))}
                    {u.lessonTitles.length > 3 && <p className="text-[10px] text-black/40">+{u.lessonTitles.length - 3} lessons</p>}
                  </div>
                )}
                {/* Spacer */}
                <div className="flex-1" />
                {/* Image + Start button overlay */}
                <div className="relative mt-3 overflow-hidden rounded-xl bg-white/40">
                  {u.cover ? (
                    <img src={u.cover} alt={u.title} className="h-36 w-full object-cover" />
                  ) : (
                    <div className="flex h-36 w-full items-center justify-center bg-white/60">
                      <ListChecks className="h-10 w-10 text-black/30" />
                    </div>
                  )}
                  {isActive && (
                    <div className="absolute inset-0 flex items-center justify-center bg-black/10">
                      <span className="rounded-full bg-[#1E90FF] px-8 py-2 text-sm font-bold text-white shadow-lg group-hover:bg-[#187bdb]">Start</span>
                    </div>
                  )}
                  {!isActive && isCompleted && (
                    <div className="absolute inset-0 flex items-center justify-center bg-white/20">
                      <span className="rounded-full bg-white px-4 py-1 text-xs font-bold text-black shadow">Done</span>
                    </div>
                  )}
                </div>
              </div>
            </Link>
          )
        })}
      </div>
    </div>
  )
}
