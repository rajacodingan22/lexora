import type {
  ActivityContentData,
  ActivityType,
  CourseTask,
  LessonActivity,
  StudentActivityProgress,
  StudentLessonProgress,
  TaskLesson,
} from '@/types'

/**
 * ACTIVE activity types - 5 types: reading, listening, image_speak, image_quiz, speaking_review
 * Admin-only creation. Student speaking uses Drive per user (Opsi A) + Supabase text+link.
 */
export const ACTIVITY_TYPES: ActivityType[] = [
  'reading',
  'listening',
  'image_speak',
  'image_quiz',
  'speaking_review',
]

export const ACTIVITY_TYPE_LABELS: Record<string, { en: string; id: string; zh: string }> = {
  reading: { en: 'Reading', id: 'Membaca', zh: '阅读' },
  listening: { en: 'Listening', id: 'Mendengarkan', zh: '听力' },
  image_speak: { en: 'Image Speak', id: 'Gambar & Ucap', zh: '看图说话' },
  image_quiz: { en: 'Image Quiz', id: 'Kuis Gambar', zh: '看图测验' },
  speaking_review: { en: 'Speaking Review', id: 'Ulasan Berbicara', zh: '口语评审' },
}

export const LEGACY_ACTIVITY_TYPE_LABELS: Record<string, { en: string; id: string; zh: string }> = {
  learn: { en: 'Learn (legacy)', id: 'Pelajari (legacy)', zh: '学习' },
  flashcard: { en: 'Flashcard (legacy)', id: 'Kartu (legacy)', zh: '卡片' },
  vocabulary: { en: 'Vocabulary (legacy)', id: 'Kosakata (legacy)', zh: '词汇' },
  speaking: { en: 'Speaking (legacy)', id: 'Berbicara (legacy)', zh: '口语' },
  grammar_fix: { en: 'Grammar Fix (legacy)', id: 'Perbaikan Grammar (legacy)', zh: '语法纠错' },
  fill_blank: { en: 'Fill Blank (legacy)', id: 'Isi Kosong (legacy)', zh: '填空' },
  arrange_sentence: { en: 'Arrange Sentence (legacy)', id: 'Susun Kalimat (legacy)', zh: '组句' },
  image_selection: { en: 'Image Selection (legacy)', id: 'Pilih Gambar (legacy)', zh: '图片选择' },
  matching: { en: 'Matching (legacy)', id: 'Mencocokkan (legacy)', zh: '配对' },
  writing: { en: 'Writing (legacy)', id: 'Menulis (legacy)', zh: '写作' },
  quick_review: { en: 'Quick Review (legacy)', id: 'Review Cepat (legacy)', zh: '快速复习' },
}

export function getActivityTypeLabel(type: string): { en: string; id: string; zh: string } {
  return ACTIVITY_TYPE_LABELS[type] ?? LEGACY_ACTIVITY_TYPE_LABELS[type] ?? { en: type, id: type, zh: type }
}

export function isSupportedActivityType(type: string): type is ActivityType {
  return (ACTIVITY_TYPES as string[]).includes(type)
}

export function defaultActivityContent(type: ActivityType): ActivityContentData {
  switch (type) {
    case 'reading':
      return { text: '', instructions: '' }
    case 'listening':
      return { audio_url: null, audio_text: '', voice: null, speed: 1, instructions: '' }
    case 'image_speak':
      return { prompt: '', images: ['', '', '', ''], correctIndex: 0, expectedText: '', threshold: 0.9, instructions: '' } as unknown as ActivityContentData
    case 'image_quiz':
      return { items: [{ image: '', options: ['', ''], correctIndex: 0 }], threshold: 0.8, instructions: '' } as unknown as ActivityContentData
    case 'speaking_review':
      return { text: '', instructions: '', voice: null, rate: 0.9 } as unknown as ActivityContentData
  }
}

export function activityContentReady(type: ActivityType, content: unknown): boolean {
  if (!content || typeof content !== 'object') return false
  const c = content as Record<string, unknown>
  switch (type) {
    case 'reading':
      return ((c.text as string) ?? '').trim().length > 0
    case 'listening': {
      const audioText = (c.audio_text as string) ?? ''
      const audioUrl = (c.audio_url as string) ?? ''
      const transcript = (c.transcript as string) ?? ''
      // TTS mode: audio_text required. Upload mode: audio_url + transcript required.
      if (audioText.trim().length > 0) return true
      if (audioUrl.trim().length > 0) return transcript.trim().length > 0
      return false
    }
    case 'image_speak': {
      const prompt = ((c.prompt as string) ?? '').trim()
      const images = (c.images as string[]) ?? []
      const correctIndex = c.correctIndex as number
      if (!prompt || images.length !== 4) return false
      if (images.some(i => !String(i).trim())) return false
      if (typeof correctIndex !== 'number' || correctIndex < 0 || correctIndex > 3) return false
      return true
    }
    case 'image_quiz': {
      const items = (c.items as { image?: unknown; options?: unknown; correctIndex?: unknown }[]) ?? []
      if (items.length === 0) return false
      return items.every((it) => {
        if (!it || typeof it !== 'object') return false
        if (!String(it.image ?? '').trim()) return false
        if (!Array.isArray(it.options) || it.options.length < 2) return false
        if (it.options.some((o) => !String(o ?? '').trim())) return false
        return typeof it.correctIndex === 'number' && it.correctIndex >= 0 && it.correctIndex < it.options.length
      })
    }
    case 'speaking_review':
      return ((c.text as string) ?? '').trim().length > 0
  }
}

export interface ActivityResult {
  score: number
  correct: number
  total: number
  completed: boolean
}

export function computeActivityResult(
  _type: ActivityType,
  _content: unknown,
  answers: Record<string, unknown> | null | undefined,
): ActivityResult {
  if (!answers) {
    return { score: 0, correct: 0, total: 1, completed: false }
  }
  if (typeof answers.aiScore === 'number' && answers.aiScore > 0) {
    return {
      score: answers.aiScore,
      correct: answers.aiScore >= 70 ? 1 : 0,
      total: 1,
      completed: true,
    }
  }
  const hasResponse = typeof answers.response === 'string' && (answers.response as string).trim().length > 0
  if (hasResponse && typeof answers.aiError === 'string') {
    return { score: 0, correct: 0, total: 1, completed: true }
  }
  return { score: 0, correct: 0, total: 1, completed: false }
}

export interface TaskTree {
  task: CourseTask
  lessons: TaskLesson[]
  activities: Record<string, LessonActivity[]>
  contents: Record<string, unknown>
}

export interface TaskProgressSummary {
  totalLessons: number
  completedLessons: number
  totalActivities: number
  completedActivities: number
  percent: number
  completed: boolean
}

export function rollupTaskProgress(
  tree: TaskTree,
  lessonProgress: Record<string, StudentLessonProgress>,
  activityProgress: Record<string, StudentActivityProgress>,
): TaskProgressSummary {
  const publishedLessons = tree.lessons.filter((l) => l.status === 'published')
  const totalLessons = publishedLessons.length
  const completedLessons = publishedLessons.filter((l) => lessonProgress[l.id]?.status === 'completed').length

  let totalActivities = 0
  let completedActivities = 0
  for (const lesson of publishedLessons) {
    const acts = (tree.activities[lesson.id] ?? []).filter((a) => a.status === 'published')
    totalActivities += acts.length
    for (const a of acts) {
      if (activityProgress[a.id]?.status === 'completed') completedActivities++
    }
  }

  const completed = totalActivities > 0 && completedActivities === totalActivities
  const percent = totalActivities > 0 ? Math.round((completedActivities / totalActivities) * 100) : 0
  return { totalLessons, completedLessons, totalActivities, completedActivities, percent, completed }
}

export interface UnlockContext {
  task: CourseTask
  lessons: TaskLesson[]
  activitiesByLesson: Record<string, LessonActivity[]>
  lessonProgress: Record<string, StudentLessonProgress>
  activityProgress: Record<string, StudentActivityProgress>
}

export function isLessonUnlocked(
  lesson: TaskLesson,
  lessonProgress: Record<string, StudentLessonProgress>,
  task: CourseTask,
  lessons: TaskLesson[],
): boolean {
  const rule = task.lesson_unlock_rule ?? 'all_available'
  if (rule === 'all_available') return true
  const idx = lessons.findIndex((l) => l.id === lesson.id)
  if (idx <= 0) return true
  const prev = lessons[idx - 1]
  const prevProgress = lessonProgress[prev.id]
  if (rule === 'sequential') return prevProgress?.status === 'completed'
  if (rule === 'minimum_score') {
    const required = task.required_lesson_score ?? 70
    return (prevProgress?.score ?? 0) >= required
  }
  return true
}

export function isActivityUnlocked(
  activity: LessonActivity,
  activityProgress: Record<string, StudentActivityProgress>,
  task: CourseTask,
  activities: LessonActivity[],
): boolean {
  const rule = task.activity_unlock_rule ?? 'sequential'
  if (rule === 'all_available') return true
  const idx = activities.findIndex((a) => a.id === activity.id)
  if (idx <= 0) return true
  return activityProgress[activities[idx - 1].id]?.status === 'completed'
}

export interface NextPosition {
  taskId: string
  lessonId?: string
  activityId?: string
  completed: boolean
}

export function getNextLearningPosition(
  _ctx: UnlockContext | undefined,
  allTasks: { task: CourseTask; lessons: TaskLesson[]; activitiesByLesson: Record<string, LessonActivity[]> }[],
  lessonProgress: Record<string, StudentLessonProgress>,
  activityProgress: Record<string, StudentActivityProgress>,
): NextPosition {
  for (const { task, lessons, activitiesByLesson } of allTasks) {
    const publishedLessons = lessons.filter((l) => l.status === 'published').sort((a, b) => a.sort_order - b.sort_order)
    for (const lesson of publishedLessons) {
      if (!isLessonUnlocked(lesson, lessonProgress, task, publishedLessons)) break
      const acts = (activitiesByLesson[lesson.id] ?? [])
        .filter((a) => a.status === 'published')
        .sort((a, b) => a.sort_order - b.sort_order)
      for (const a of acts) {
        if (activityProgress[a.id]?.status === 'in_progress') {
          return { taskId: task.id, lessonId: lesson.id, activityId: a.id, completed: false }
        }
      }
      for (const a of acts) {
        if (!isActivityUnlocked(a, activityProgress, task, acts)) break
        if (activityProgress[a.id]?.status !== 'completed') {
          return { taskId: task.id, lessonId: lesson.id, activityId: a.id, completed: false }
        }
      }
    }
  }
  return { taskId: '', completed: true }
}

export interface PublishCheckInput {
  task: CourseTask
  lessons: TaskLesson[]
  activities: LessonActivity[]
  contents: Record<string, unknown>
}

export interface PublishCheckResult {
  ok: boolean
  errors: string[]
  warnings: string[]
}

export function checkTaskPublishable(input: PublishCheckInput): PublishCheckResult {
  const errors: string[] = []
  const warnings: string[] = []
  const { task, lessons, activities, contents } = input

  if (!task.title.trim()) errors.push('Task title is required')
  if (!task.cover_image_url) errors.push('Cover image is required')

  const publishedLessons = lessons.filter((l) => l.status === 'published')
  if (publishedLessons.length === 0) errors.push('At least 1 published lesson is required')
  for (const lesson of publishedLessons) {
    const acts = activities.filter((a) => a.lesson_id === lesson.id)
    const publishedActs = acts.filter((a) => a.status === 'published')
    if (publishedActs.length === 0) errors.push(`Lesson "${lesson.title || lesson.id}" is still empty (no published activity)`)
    for (const a of publishedActs) {
      if (!activityContentReady(a.activity_type, contents[a.id])) {
        errors.push(`Activity "${a.title || a.activity_type}" content is not complete`)
      }
    }
    if (acts.length > 0 && publishedActs.length < acts.length) {
      warnings.push(`Lesson "${lesson.title || lesson.id}" has draft activities (not counted)`)
    }
  }

  if (task.lesson_unlock_rule === 'minimum_score') {
    const required = task.required_lesson_score ?? 70
    if (required < 0 || required > 100) errors.push('Required lesson score must be between 0 and 100')
  }
  if (task.min_completion_score !== undefined && (task.min_completion_score < 0 || task.min_completion_score > 100)) {
    errors.push('Min completion score must be between 0 and 100')
  }

  return { ok: errors.length === 0, errors, warnings }
}

export function progressPercent(p: { completed: number; total: number }): number {
  return p.total > 0 ? Math.round((p.completed / p.total) * 100) : 0
}

export function createDeepCopyId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `gen-${Date.now()}-${Math.random().toString(36).slice(2)}`
}
