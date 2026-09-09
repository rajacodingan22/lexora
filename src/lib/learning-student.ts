import type { SupabaseClient } from '@supabase/supabase-js'
import { getNextLearningPosition, isActivityUnlocked, isLessonUnlocked, rollupTaskProgress, type NextPosition } from '@/lib/learning'
import type {
  BatchTask, CourseTask, LessonActivity, StudentActivityProgress, StudentLessonProgress,
  StudentTaskProgress, TaskLesson,
} from '@/types'

export interface TaskTree {
  task: CourseTask | null
  lessons: TaskLesson[]
  activities: LessonActivity[]
  contents: Record<string, Record<string, unknown>>
}

export interface ActivityView {
  activity: LessonActivity
  unlocked: boolean
  status: 'not_started' | 'in_progress' | 'completed'
  score: number | null
  attempts: number | null
}

export interface LessonView {
  lesson: TaskLesson
  unlocked: boolean
  status: 'not_started' | 'in_progress' | 'completed'
  completedActivities: number
  totalActivities: number
  score: number | null
}

export interface StudentTaskView {
  tree: TaskTree
  progress: StudentTaskProgress | null
  lessonViews: LessonView[]
  activityViewsByLesson: Record<string, ActivityView[]>
  percent: number
  completed: boolean
  next: NextPosition | null
}

export async function fetchTaskTree(
  supabase: SupabaseClient,
  taskId: string,
): Promise<TaskTree> {
  const empty: TaskTree = { task: null, lessons: [], activities: [], contents: {} }
  const [taskRes, lessonRes] = await Promise.all([
    supabase.from('course_tasks').select('*').eq('id', taskId).single(),
    supabase.from('task_lessons').select('*').eq('task_id', taskId).order('sort_order', { ascending: true }),
  ])
  if (taskRes.error || !taskRes.data) return empty

  const lessons = (lessonRes.data ?? []) as TaskLesson[]
  const publishedLessons = lessons.filter((l) => l.status === 'published')
  let activities: LessonActivity[] = []
  const contents: Record<string, Record<string, unknown>> = {}

  if (publishedLessons.length > 0) {
    const ids = publishedLessons.map((l) => l.id)
    const actRes = await supabase
      .from('lesson_activities')
      .select('*')
      .in('lesson_id', ids)
      .eq('status', 'published')
      .order('sort_order', { ascending: true })
    activities = (actRes.data ?? []) as LessonActivity[]
    const actIds = activities.map((a) => a.id)
    if (actIds.length > 0) {
      const { data: cData } = await supabase.from('activity_content').select('activity_id, content').in('activity_id', actIds)
      for (const row of (cData ?? []) as { activity_id: string; content: Record<string, unknown> }[]) {
        contents[row.activity_id] = row.content
      }
    }
  }

  return { task: taskRes.data as CourseTask, lessons: publishedLessons, activities, contents }
}

export async function fetchStudentProgress(
  supabase: SupabaseClient,
  userId: string,
  batchId: string | null,
  taskId: string,
  activityIds: string[],
  lessonIds: string[],
) {
  // If no batch, user not enrolled - return empty progress (queries with batch_id='' would mismatch NOT NULL uuid)
  if (!batchId) {
    return {
      taskProgress: null as StudentTaskProgress | null,
      lessonMap: new Map<string, StudentLessonProgress>(),
      actMap: new Map<string, StudentActivityProgress>(),
    }
  }
  const [taskRes, lessonRes, actRes] = await Promise.all([
    supabase
      .from('student_task_progress')
      .select('*')
      .eq('user_id', userId)
      .eq('batch_id', batchId)
      .eq('task_id', taskId)
      .maybeSingle(),
    lessonIds.length > 0
      ? supabase.from('student_lesson_progress').select('*').eq('user_id', userId).eq('batch_id', batchId).in('lesson_id', lessonIds)
      : Promise.resolve({ data: [] as never[] }),
    activityIds.length > 0
      ? supabase.from('student_activity_progress').select('*').eq('user_id', userId).eq('batch_id', batchId).in('activity_id', activityIds)
      : Promise.resolve({ data: [] as never[] }),
  ])

  const lessonMap = new Map<string, StudentLessonProgress>()
  for (const row of (lessonRes.data ?? []) as StudentLessonProgress[]) lessonMap.set(row.lesson_id, row)

  const actMap = new Map<string, StudentActivityProgress>()
  for (const row of (actRes.data ?? []) as StudentActivityProgress[]) actMap.set(row.activity_id, row)

  return {
    taskProgress: (taskRes.data as StudentTaskProgress | null) ?? null,
    lessonMap,
    actMap,
  }
}

export function computeStudentTaskView(input: {
  tree: TaskTree
  lessonMap: Map<string, StudentLessonProgress>
  actMap: Map<string, StudentActivityProgress>
  taskProgress: StudentTaskProgress | null
}): StudentTaskView {
  const { tree, lessonMap, actMap, taskProgress } = input
  const task = tree.task
  const publishedLessons = tree.lessons
    .filter((l) => l.status === 'published')
    .sort((a, b) => a.sort_order - b.sort_order)

  const activitiesByLesson: Record<string, LessonActivity[]> = {}
  for (const a of tree.activities) {
    if (!activitiesByLesson[a.lesson_id]) activitiesByLesson[a.lesson_id] = []
    activitiesByLesson[a.lesson_id].push(a)
  }

  const lessonProgress: Record<string, StudentLessonProgress> = Object.fromEntries(lessonMap)
  const activityProgress: Record<string, StudentActivityProgress> = Object.fromEntries(actMap)

  const lessonViews: LessonView[] = publishedLessons.map((lesson) => {
    const acts = activitiesByLesson[lesson.id] ?? []
    const totalActivities = acts.length
    const completedActivities = acts.filter((a) => activityProgress[a.id]?.status === 'completed').length
    const progress = lessonMap.get(lesson.id)
    const status: 'not_started' | 'in_progress' | 'completed' =
      totalActivities > 0 && completedActivities === totalActivities
        ? 'completed'
        : completedActivities > 0
          ? 'in_progress'
          : progress?.status === 'completed'
            ? 'completed'
            : 'not_started'
    return {
      lesson,
      unlocked: task ? isLessonUnlocked(lesson, lessonProgress, task, publishedLessons) : false,
      status,
      completedActivities,
      totalActivities,
      score: progress?.score ?? null,
    }
  })

  const activityViewsByLesson: Record<string, ActivityView[]> = {}
  for (const lesson of publishedLessons) {
    activityViewsByLesson[lesson.id] = (activitiesByLesson[lesson.id] ?? []).map((activity) => {
      const p = actMap.get(activity.id)
      return {
        activity,
        unlocked: task ? isActivityUnlocked(activity, activityProgress, task, activitiesByLesson[lesson.id] ?? []) : false,
        status: p?.status ?? 'not_started',
        score: p?.score ?? null,
        attempts: p?.attempts ?? null,
      }
    })
  }

  const rollup = task
    ? rollupTaskProgress(
        { task, lessons: publishedLessons, activities: activitiesByLesson, contents: {} },
        lessonProgress,
        activityProgress,
      )
    : { percent: 0, completed: false }

  const completed = taskProgress?.status === 'completed' || rollup.completed
  const percent = taskProgress?.status === 'completed' ? 100 : rollup.percent

  const next: NextPosition | null =
    task && publishedLessons.length > 0
      ? getNextLearningPosition(
          undefined,
          [{ task, lessons: publishedLessons, activitiesByLesson }],
          lessonProgress,
          activityProgress,
        )
      : null

  return {
    tree,
    progress: taskProgress,
    lessonViews,
    activityViewsByLesson,
    percent,
    completed,
    next,
  }
}

export async function fetchEnrollmentBatch(
  supabase: SupabaseClient,
  userId: string,
  courseId: string,
): Promise<string | null> {
  const { data } = await supabase
    .from('enrollments')
    .select('batch_id')
    .eq('user_id', userId)
    .eq('course_id', courseId)
    .maybeSingle()
  return (data?.batch_id as string | null) ?? null
}

export async function fetchAssignedTasks(
  supabase: SupabaseClient,
  courseId: string,
  batchId: string | null,
): Promise<{ task: CourseTask; batchTask: BatchTask }[]> {
  const now = new Date().toISOString()

  if (batchId) {
    const { data } = await supabase
      .from('batch_tasks')
      .select('*, task:course_tasks(*)')
      .eq('batch_id', batchId)
      .order('sort_order', { ascending: true })
    return ((data ?? []) as any[])
      .filter((r) => {
        if (r.status !== 'published') return false
        if (r.task?.status !== 'published') return false
        if (r.availability_start && r.availability_start > now) return false
        if (r.availability_end && r.availability_end < now) return false
        return true
      })
      .map((r) => ({ task: r.task as CourseTask, batchTask: r as BatchTask }))
  }

  const { data: allBatches } = await supabase.from('batches').select('id').eq('course_id', courseId)
  const batchIds = (allBatches ?? []).map((b) => b.id)
  if (batchIds.length === 0) return []

  const { data } = await supabase
    .from('batch_tasks')
    .select('*, task:course_tasks(*)')
    .in('batch_id', batchIds)
    .order('sort_order', { ascending: true })

  const dedup = new Map<string, { task: CourseTask; batchTask: BatchTask }>()
  for (const r of ((data ?? []) as any[]).filter((r) => {
    if (r.status !== 'published') return false
    if (r.task?.status !== 'published') return false
    if (r.availability_start && r.availability_start > now) return false
    if (r.availability_end && r.availability_end < now) return false
    return true
  })) {
    if (!dedup.has(r.task.id)) dedup.set(r.task.id, { task: r.task as CourseTask, batchTask: r as BatchTask })
  }
  return [...dedup.values()]
}
