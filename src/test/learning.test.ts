import { describe, it, expect } from 'vitest'
import {
  computeActivityResult,
  isLessonUnlocked,
  isActivityUnlocked,
  checkTaskPublishable,
  activityContentReady,
  rollupTaskProgress,
} from '@/lib/learning'
import type { CourseTask, TaskLesson, LessonActivity, StudentLessonProgress, StudentActivityProgress } from '@/types'

describe('computeActivityResult', () => {
  it('returns 0 completed false when no answers', () => {
    expect(computeActivityResult('reading', {}, null)).toEqual({ score: 0, correct: 0, total: 1, completed: false })
    expect(computeActivityResult('reading', {}, undefined)).toEqual({ score: 0, correct: 0, total: 1, completed: false })
  })
  it('returns aiScore when present', () => {
    expect(computeActivityResult('reading', {}, { aiScore: 85 })).toEqual({ score: 85, correct: 1, total: 1, completed: true })
    expect(computeActivityResult('reading', {}, { aiScore: 60 })).toEqual({ score: 60, correct: 0, total: 1, completed: true })
  })
  it('returns 0 completed true when aiError with response', () => {
    expect(computeActivityResult('reading', {}, { response: 'some text', aiError: 'failed' })).toEqual({ score: 0, correct: 0, total: 1, completed: true })
  })
  it('returns incomplete when no aiScore and no aiError', () => {
    expect(computeActivityResult('reading', {}, { response: '' })).toEqual({ score: 0, correct: 0, total: 1, completed: false })
    expect(computeActivityResult('reading', {}, {})).toEqual({ score: 0, correct: 0, total: 1, completed: false })
  })
})

describe('activityContentReady', () => {
  it('reading requires text', () => {
    expect(activityContentReady('reading', { text: 'hello' })).toBe(true)
    expect(activityContentReady('reading', { text: '  ' })).toBe(false)
    expect(activityContentReady('reading', {})).toBe(false)
  })
  it('listening TTS mode requires audio_text', () => {
    expect(activityContentReady('listening', { audio_text: 'hello' })).toBe(true)
    expect(activityContentReady('listening', { audio_text: '' })).toBe(false)
  })
  it('listening upload mode requires audio_url + transcript', () => {
    expect(activityContentReady('listening', { audio_url: 'https://a.com/b.mp3', transcript: 'hi' })).toBe(true)
    expect(activityContentReady('listening', { audio_url: 'https://a.com/b.mp3', transcript: '' })).toBe(false)
    expect(activityContentReady('listening', { audio_url: '', transcript: 'hi' })).toBe(false)
  })
})

describe('isLessonUnlocked', () => {
  const baseTask = { lesson_unlock_rule: 'sequential' } as CourseTask
  const lessonA = { id: 'a' } as TaskLesson
  const lessonB = { id: 'b' } as TaskLesson
  const lessons = [lessonA, lessonB]

  it('all_available always true', () => {
    expect(isLessonUnlocked(lessonB, {}, { lesson_unlock_rule: 'all_available' } as CourseTask, lessons)).toBe(true)
  })
  it('sequential requires previous completed', () => {
    expect(isLessonUnlocked(lessonB, {}, baseTask, lessons)).toBe(false)
    expect(isLessonUnlocked(lessonB, { a: { status: 'completed' } as StudentLessonProgress }, baseTask, lessons)).toBe(true)
  })
  it('minimum_score requires score', () => {
    const task = { lesson_unlock_rule: 'minimum_score', required_lesson_score: 70 } as CourseTask
    expect(isLessonUnlocked(lessonB, { a: { score: 60 } as StudentLessonProgress }, task, lessons)).toBe(false)
    expect(isLessonUnlocked(lessonB, { a: { score: 80 } as StudentLessonProgress }, task, lessons)).toBe(true)
  })
})

describe('isActivityUnlocked', () => {
  const task = { activity_unlock_rule: 'sequential' } as CourseTask
  const a1 = { id: '1' } as LessonActivity
  const a2 = { id: '2' } as LessonActivity
  const acts = [a1, a2]

  it('first always unlocked', () => {
    expect(isActivityUnlocked(a1, {}, task, acts)).toBe(true)
  })
  it('second requires previous completed', () => {
    expect(isActivityUnlocked(a2, {}, task, acts)).toBe(false)
    expect(isActivityUnlocked(a2, { '1': { status: 'completed' } as StudentActivityProgress }, task, acts)).toBe(true)
  })
})

describe('checkTaskPublishable', () => {
  const baseTask = { title: 'Test', cover_image_url: 'https://a.com/img.jpg', lesson_unlock_rule: 'all_available' } as CourseTask
  const lesson = { id: 'l1', title: 'L1', status: 'published' } as TaskLesson
  const activity = { id: 'a1', lesson_id: 'l1', activity_type: 'reading', title: 'Read', status: 'published' } as LessonActivity

  it('fails when no title or cover', () => {
    const res = checkTaskPublishable({ task: { ...baseTask, title: '' } as CourseTask, lessons: [lesson], activities: [activity], contents: { a1: { text: 'hi' } } })
    expect(res.ok).toBe(false)
    expect(res.errors.some(e => e.includes('title'))).toBe(true)
  })
  it('succeeds when valid', () => {
    const res = checkTaskPublishable({ task: baseTask, lessons: [lesson], activities: [activity], contents: { a1: { text: 'hi' } } })
    expect(res.ok).toBe(true)
  })
  it('fails when activity content not ready', () => {
    const res = checkTaskPublishable({ task: baseTask, lessons: [lesson], activities: [activity], contents: { a1: {} } })
    expect(res.ok).toBe(false)
  })
})

describe('rollupTaskProgress', () => {
  it('calculates percent correctly', () => {
    const tree = {
      task: { id: 't1' } as CourseTask,
      lessons: [{ id: 'l1', status: 'published' } as TaskLesson, { id: 'l2', status: 'published' } as TaskLesson],
      activities: {
        l1: [{ id: 'a1', status: 'published' } as LessonActivity, { id: 'a2', status: 'published' } as LessonActivity],
        l2: [{ id: 'a3', status: 'published' } as LessonActivity],
      },
      contents: {},
    }
    const lessonProgress = { l1: { status: 'completed' } as StudentLessonProgress }
    const activityProgress = {
      a1: { status: 'completed' } as StudentActivityProgress,
      a2: { status: 'in_progress' } as StudentActivityProgress,
      a3: { status: 'not_started' } as StudentActivityProgress,
    }
    const res = rollupTaskProgress(tree as any, lessonProgress, activityProgress)
    expect(res.totalLessons).toBe(2)
    expect(res.completedLessons).toBe(1)
    expect(res.totalActivities).toBe(3)
    expect(res.completedActivities).toBe(1)
    expect(res.percent).toBe(33) // 1/3
    expect(res.completed).toBe(false)
  })
})
