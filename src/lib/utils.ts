import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'
import type { Lang } from '@/lib/i18n/config'
import { ui2 } from '@/lib/i18n/namespaces/ui2'
import { interpolate } from '@/lib/i18n/translate'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatDate(date: string | Date, locale = 'id-ID') {
  return new Intl.DateTimeFormat(locale, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(date))
}

export function formatDateOnly(date: string | Date, locale = 'id-ID') {
  return new Intl.DateTimeFormat(locale, {
    dateStyle: 'medium',
  }).format(new Date(date))
}

export function languageLabel(
  lang: Lang,
  t: (key: string) => string,
  data: { code?: string; name?: { id?: string; en?: string } | null } | undefined | null
): string {
  const code = data?.code || ''
  const name = data?.name
  if (lang === 'id' && name?.id) return name.id
  if (lang === 'en' && name?.en) return name.en
  const fallback = t(`common.langName.${code}`)
  if (fallback && fallback !== `common.langName.${code}`) return fallback
  return name?.en || name?.id || code
}

export function pickName(
  lang: Lang,
  name: { id?: string; en?: string } | string | null | undefined
): string {
  if (!name) return ''
  if (typeof name === 'string') return name
  if (lang === 'en' && name.en) return name.en
  return name.id || name.en || ''
}

export function timeAgo(dateStr: string, lang: Lang = 'id'): string {
  const now = Date.now()
  const then = new Date(dateStr).getTime()
  const diffMs = now - then
  const diffSec = Math.floor(diffMs / 1000)
  const d = ui2[lang]

  if (diffSec < 60) return d['ui2.time.justNow']
  const diffMin = Math.floor(diffSec / 60)
  if (diffMin < 60) return interpolate(d['ui2.time.minutesAgo'], { count: diffMin })
  const diffHour = Math.floor(diffMin / 60)
  if (diffHour < 24) return interpolate(d['ui2.time.hoursAgo'], { count: diffHour })
  const diffDay = Math.floor(diffHour / 24)
  if (diffDay < 7) return interpolate(d['ui2.time.daysAgo'], { count: diffDay })
  const diffWeek = Math.floor(diffDay / 7)
  if (diffWeek < 5) return interpolate(d['ui2.time.weeksAgo'], { count: diffWeek })
  const diffMonth = Math.floor(diffDay / 30)
  return interpolate(d['ui2.time.monthsAgo'], { count: diffMonth })
}

export interface TeacherScoped {
  course_id: string
  teacher_id?: string | null
}

export function isVisibleForTeacher<T extends TeacherScoped>(
  row: T,
  teacherId: string | null | undefined
): boolean {
  if (!teacherId || !row.teacher_id) return true
  return row.teacher_id === teacherId
}

export function filterByTeacher<T extends TeacherScoped>(
  rows: T[],
  teacherIdByCourse: Map<string, string | null>
): T[] {
  return rows.filter((row) => isVisibleForTeacher(row, teacherIdByCourse.get(row.course_id) ?? null))
}

export function buildTeacherIdByCourse(
  enrollments: { course_id: string; teacher_id: string | null }[]
): Map<string, string | null> {
  const map = new Map<string, string | null>()
  for (const e of enrollments) {
    if (!map.has(e.course_id)) map.set(e.course_id, e.teacher_id)
  }
  return map
}

export interface MeetingTimeWindow {
  starts_at: string | null
  duration_minutes: number | null
  status?: string | null
}

export function isMeetingLinkOpen(
  meeting: MeetingTimeWindow,
  now: Date = new Date()
): boolean {
  if (!meeting.starts_at || meeting.status === 'cancelled') return false
  const start = new Date(meeting.starts_at).getTime()
  if (Number.isNaN(start)) return false
  const durationMin = meeting.duration_minutes && meeting.duration_minutes > 0 ? meeting.duration_minutes : 60
  const end = start + durationMin * 60000
  const OPEN_BEFORE_MS = 5 * 60 * 1000 // 5 minutes before start
  return now.getTime() >= start - OPEN_BEFORE_MS && now.getTime() <= end
}

export type MeetingPhase = 'upcoming' | 'ongoing' | 'past' | 'cancelled'

export function getMeetingPhase(
  meeting: MeetingTimeWindow,
  now: Date = new Date()
): MeetingPhase {
  if (meeting.status === 'cancelled') return 'cancelled'
  if (!meeting.starts_at) return 'upcoming'
  const start = new Date(meeting.starts_at).getTime()
  if (Number.isNaN(start)) return 'upcoming'
  const durationMin = meeting.duration_minutes && meeting.duration_minutes > 0 ? meeting.duration_minutes : 60
  const end = start + durationMin * 60000
  const t = now.getTime()
  if (t < start) return 'upcoming'
  if (t <= end) return 'ongoing'
  return 'past'
}

export interface BatchRange {
  id?: string | null
  start_date?: string | null
  end_date?: string | null
}

/**
 * Batch-specific session filter: jumlah link Zoom ngikutin jumlah pertemuan di batch.
 * Urutan: 1) batch_id eksplisit (robust, anti-overlap), 2) range start_date..end_date
 * (legacy rows yang batch_id-nya null), 3) semua sesi (preview / fallback).
 */
export function filterSessionsByBatch<T extends MeetingTimeWindow & { batch_id?: string | null }>(
  sessions: T[],
  batch: BatchRange | null | undefined,
  isEnrolled: boolean
): T[] {
  if (!isEnrolled || !batch?.id) return sessions
  const byBatch = sessions.filter(s => s.batch_id === batch.id)
  if (byBatch.length > 0) return byBatch
  if (!batch?.start_date) return sessions
  const start = new Date(batch.start_date).getTime()
  const end = batch.end_date ? new Date(batch.end_date).getTime() : null
  if (Number.isNaN(start)) return sessions
  const filtered = sessions.filter(s => {
    if (!s.starts_at) return false
    const d = new Date(s.starts_at).getTime()
    if (Number.isNaN(d)) return false
    if (d < start) return false
    if (end !== null && !Number.isNaN(end) && d > end) return false
    return true
  })
  return filtered.length > 0 ? filtered : sessions
}

/** Returns minutes until the meeting link opens (5 min before start). Returns 0 if already open. */
export function minutesUntilJoinable(
  meeting: MeetingTimeWindow,
  now: Date = new Date()
): number {
  if (!meeting.starts_at || meeting.status === 'cancelled') return 0
  const start = new Date(meeting.starts_at).getTime()
  if (Number.isNaN(start)) return 0
  const OPEN_BEFORE_MS = 5 * 60 * 1000
  const joinableAt = start - OPEN_BEFORE_MS
  const diff = joinableAt - now.getTime()
  return diff <= 0 ? 0 : Math.ceil(diff / 60000)
}
