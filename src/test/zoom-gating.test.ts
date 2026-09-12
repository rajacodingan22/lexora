import { describe, it, expect } from 'vitest'
import {
  isMeetingLinkOpen,
  minutesUntilJoinable,
  getMeetingPhase,
  filterSessionsByBatch,
} from '@/lib/utils'
import { renderNotification } from '@/lib/notif-text'
import type { Notification } from '@/types'

const HOUR = 60 * 60 * 1000

function iso(offsetMs: number): string {
  return new Date(Date.now() + offsetMs).toISOString()
}

describe('isMeetingLinkOpen (5 min early window)', () => {
  it('opens 5 minutes before start', () => {
    expect(isMeetingLinkOpen({ starts_at: iso(5 * 60 * 1000), duration_minutes: 60 })).toBe(true)
    expect(isMeetingLinkOpen({ starts_at: iso(6 * 60 * 1000), duration_minutes: 60 })).toBe(false)
  })
  it('stays open during the meeting', () => {
    expect(isMeetingLinkOpen({ starts_at: iso(-30 * 60 * 1000), duration_minutes: 60 })).toBe(true)
  })
  it('closes after end', () => {
    expect(isMeetingLinkOpen({ starts_at: iso(-2 * HOUR), duration_minutes: 60 })).toBe(false)
  })
  it('closed without starts_at or when cancelled', () => {
    expect(isMeetingLinkOpen({ starts_at: null, duration_minutes: 60 })).toBe(false)
    expect(isMeetingLinkOpen({ starts_at: iso(0), duration_minutes: 60, status: 'cancelled' })).toBe(false)
  })
})

describe('minutesUntilJoinable', () => {
  it('returns 0 when already joinable', () => {
    expect(minutesUntilJoinable({ starts_at: iso(0), duration_minutes: 60 })).toBe(0)
  })
  it('ceil minutes until 5-min window', () => {
    expect(minutesUntilJoinable({ starts_at: iso(30 * 60 * 1000), duration_minutes: 60 })).toBe(25)
  })
})

describe('getMeetingPhase', () => {
  it('classifies upcoming / ongoing / past', () => {
    expect(getMeetingPhase({ starts_at: iso(HOUR), duration_minutes: 60 })).toBe('upcoming')
    expect(getMeetingPhase({ starts_at: iso(-10 * 60 * 1000), duration_minutes: 60 })).toBe('ongoing')
    expect(getMeetingPhase({ starts_at: iso(-2 * HOUR), duration_minutes: 60 })).toBe('past')
  })
})

describe('filterSessionsByBatch (link count follows batch pertemuan)', () => {
  const sessions = [
    { id: 's1', starts_at: '2026-09-10T10:00:00Z', duration_minutes: 60, batch_id: 'b1' },
    { id: 's2', starts_at: '2026-09-17T10:00:00Z', duration_minutes: 60, batch_id: 'b1' },
    { id: 's3', starts_at: '2026-10-05T10:00:00Z', duration_minutes: 60, batch_id: 'b2' },
    { id: 's4', starts_at: '2026-09-24T10:00:00Z', duration_minutes: 60, batch_id: null },
  ] as any[]

  it('prefers explicit batch_id (anti-overlap) + keeps unassigned visible', () => {
    const out = filterSessionsByBatch(sessions, { id: 'b1', start_date: '2026-09-01', end_date: '2026-09-30' }, true)
    expect(out.map(s => s.id)).toEqual(['s1', 's2', 's4'])
  })
  it('falls back to date range for legacy rows', () => {
    const legacy = sessions.map(s => ({ ...s, batch_id: null }))
    const out = filterSessionsByBatch(legacy, { id: 'b9', start_date: '2026-09-01', end_date: '2026-09-30' }, true)
    expect(out.map(s => s.id).sort()).toEqual(['s1', 's2', 's4'])
  })
  it('returns all sessions when not enrolled (preview)', () => {
    expect(filterSessionsByBatch(sessions, { id: 'b1', start_date: '2026-09-01' }, false)).toHaveLength(4)
  })
})

describe('renderNotification is English-only', () => {
  const t = ((k: string) => k) as any
  function notif(patch: Partial<Notification>): Notification {
    return {
      id: 'n1', user_id: 'u1', type: 'warning', title: 'ID fallback', body: 'ID body',
      link: '/x', is_read: false, created_at: new Date().toISOString(),
      ...patch,
    } as Notification
  }
  it('renders taskOverdue template in English regardless of UI lang', () => {
    const { title, body } = renderNotification(
      notif({ template_key: 'taskOverdue', params: { task: 'Writing 3', course: 'TOEFL' } as any }),
      t
    )
    expect(title).toContain('Task')
    expect(title).not.toContain('Tugas')
    expect(body).toContain('Writing 3')
  })
  it('falls back to raw title when template key unknown', () => {
    const { title } = renderNotification(notif({ template_key: 'nope' }), t)
    expect(title).toBe('ID fallback')
  })
})
