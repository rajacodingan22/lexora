import type { CourseTask, TaskMaterial, MaterialProgressStatus } from '@/types'

export type TaskStatus = 'not_started' | 'in_progress' | 'completed'

export interface TaskWithMeta extends CourseTask {
  materials: TaskMaterial[]
  progress: Record<string, MaterialProgressStatus>
  taskState: TaskStatus
  completedCount: number
  totalCount: number
  percent: number
}

export function computeTaskStatus(
  materials: TaskMaterial[],
  progress: Record<string, MaterialProgressStatus>,
  _sequential_learning: boolean
): TaskStatus {
  const required = materials.filter(m => m.is_required)
  if (required.length === 0) {
    const total = materials.length
    if (total === 0) return 'not_started'
    const done = materials.filter(m => progress[m.id] === 'completed').length
    return done === total ? 'completed' : done > 0 ? 'in_progress' : 'not_started'
  }
  const done = required.filter(m => progress[m.id] === 'completed').length
  if (done === required.length) return 'completed'
  return done > 0 ? 'in_progress' : 'not_started'
}

export function isMaterialLocked(
  task: CourseTask,
  material: TaskMaterial,
  orderedMaterials: TaskMaterial[],
  progress: Record<string, MaterialProgressStatus>
): boolean {
  if (!task.sequential_learning) return false
  const idx = orderedMaterials.findIndex(m => m.id === material.id)
  if (idx <= 0) return false
  for (let i = 0; i < idx; i++) {
    if (progress[orderedMaterials[i].id] !== 'completed') return true
  }
  return false
}

export function taskPercent(materials: TaskMaterial[], progress: Record<string, MaterialProgressStatus>): number {
  if (materials.length === 0) return 0
  const done = materials.filter(m => progress[m.id] === 'completed').length
  return Math.round((done / materials.length) * 100)
}

export function courseTaskStats(tasks: TaskWithMeta[]): { done: number; total: number; percent: number } {
  let done = 0
  let total = 0
  for (const t of tasks) {
    total += t.materials.length
    done += Object.values(t.progress).filter(s => s === 'completed').length
  }
  return { done, total, percent: total > 0 ? Math.round((done / total) * 100) : 0 }
}

export function buildTaskWithMeta(
  task: CourseTask,
  materials: TaskMaterial[],
  progress: Record<string, MaterialProgressStatus>
): TaskWithMeta {
  const ordered = [...materials].sort((a, b) => a.sort_order - b.sort_order)
  const completedCount = ordered.filter(m => progress[m.id] === 'completed').length
  return {
    ...task,
    materials: ordered,
    progress,
    taskState: computeTaskStatus(ordered, progress, task.sequential_learning),
    completedCount,
    totalCount: ordered.length,
    percent: taskPercent(ordered, progress),
  }
}

export function firstActionableMaterial(task: TaskWithMeta): TaskMaterial | null {
  for (const m of task.materials) {
    const locked = isMaterialLocked(task, m, task.materials, task.progress)
    if (!locked && task.progress[m.id] !== 'completed') return m
  }
  return null
}

export function getTaskStateLabel(task: TaskWithMeta): TaskStatus {
  return task.taskState
}