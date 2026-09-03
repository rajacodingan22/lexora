'use client'

import { useEffect, useState, useCallback } from 'react'
import { DashboardLayout } from '@/components/layout/dashboard-layout'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/lib/auth-context'
import { createClient } from '@/lib/supabase-client'
import { useI18n } from '@/lib/i18n/client'
import {
  Calendar,
  ClipboardList,
  FileQuestion,
  BookOpen,
  Video,
  Clock,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react'
import Link from 'next/link'
import { formatDate, formatDateOnly } from '@/lib/utils'

interface CalendarEvent {
  id: string
  title: string
  course_title: string
  course_id: string
  type: 'kelas' | 'tugas' | 'quiz' | 'ujian'
  datetime: string
  meeting_link?: string | null
}

function getMonthBounds(date: Date) {
  const year = date.getFullYear()
  const month = date.getMonth()
  const start = new Date(year, month, 1).toISOString()
  const end = new Date(year, month + 1, 0, 23, 59, 59, 999).toISOString()
  return { start, end }
}

const LOCALE_MAP: Record<string, string> = { en: 'en-US', id: 'id-ID', zh: 'zh-CN' }

function formatMonthYear(date: Date, locale: string) {
  return new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric' }).format(date)
}

export default function TeacherCalendarPage() {
  const { user } = useAuth()
  const { t, lang } = useI18n()
  const supabase = createClient()
  const locale = LOCALE_MAP[lang] || 'en-US'

  const [events, setEvents] = useState<CalendarEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [currentMonth, setCurrentMonth] = useState(new Date())

  const fetchEvents = useCallback(async () => {
    if (!user) return

    const { start, end } = getMonthBounds(currentMonth)

    try {
      const { data: teacherRow } = await supabase
        .from('teachers')
        .select('id')
        .eq('user_id', user.id)
        .maybeSingle()

      if (!teacherRow) {
        setEvents([])
        setLoading(false)
        return
      }

      const { data: ctRows } = await supabase
        .from('course_teachers')
        .select('course_id')
        .eq('teacher_id', teacherRow.id)

      const courseIds = (ctRows || []).map(ct => ct.course_id)

      if (courseIds.length === 0) {
        setEvents([])
        setLoading(false)
        return
      }

      const { data: courses } = await supabase
        .from('courses')
        .select('id, title')
        .in('id', courseIds)

      const courseMap = new Map<string, string>()
      ;(courses || []).forEach((c: any) => {
        courseMap.set(c.id, c.title?.en || c.title?.id || t('teacher1.kalender.untitled'))
      })

      const [sessionsRes, assignmentsRes, quizzesRes, examsRes] = await Promise.all([
        supabase
          .from('live_sessions')
          .select('*')
          .in('course_id', courseIds)
          .gte('starts_at', start)
          .lte('starts_at', end),
        supabase
          .from('assignments')
          .select('*')
          .in('course_id', courseIds)
          .gte('due_date', start)
          .lte('due_date', end),
        supabase
          .from('quizzes')
          .select('*')
          .in('course_id', courseIds)
          .gte('created_at', start)
          .lte('created_at', end),
        supabase
          .from('final_exams')
          .select('*')
          .in('course_id', courseIds)
          .gte('created_at', start)
          .lte('created_at', end),
      ])

      const allEvents: CalendarEvent[] = [
        ...(sessionsRes.data || []).map((s: any) => ({
          id: s.id,
          title: s.title,
          course_title: courseMap.get(s.course_id) || '',
          course_id: s.course_id,
          type: 'kelas' as const,
          datetime: s.starts_at,
          meeting_link: s.meeting_link,
        })),
        ...(assignmentsRes.data || []).map((a: any) => ({
          id: a.id,
          title: a.title,
          course_title: courseMap.get(a.course_id) || '',
          course_id: a.course_id,
          type: 'tugas' as const,
          datetime: a.due_date,
        })),
        ...(quizzesRes.data || []).map((q: any) => ({
          id: q.id,
          title: q.title,
          course_title: courseMap.get(q.course_id) || '',
          course_id: q.course_id,
          type: 'quiz' as const,
          datetime: q.created_at,
        })),
        ...(examsRes.data || []).map((e: any) => ({
          id: e.id,
          title: e.title,
          course_title: courseMap.get(e.course_id) || '',
          course_id: e.course_id,
          type: 'ujian' as const,
          datetime: e.created_at,
        })),
      ].sort((a, b) => new Date(a.datetime).getTime() - new Date(b.datetime).getTime())

      setEvents(allEvents)
    } catch (err) {
      console.error('Failed to fetch events:', err)
      setEvents([])
    }
    setLoading(false)
  }, [user, supabase, currentMonth])

  useEffect(() => {
    setLoading(true)
    fetchEvents()
  }, [fetchEvents])

  const groupedByDate: Record<string, CalendarEvent[]> = {}
  events.forEach((ev) => {
    const key = formatDateOnly(ev.datetime, locale)
    if (!groupedByDate[key]) groupedByDate[key] = []
    groupedByDate[key].push(ev)
  })

  const typeConfig = {
    kelas: { label: t('teacher1.kalender.typeKelas'), icon: Video, variant: 'default' as const },
    tugas: { label: t('teacher1.kalender.typeTugas'), icon: ClipboardList, variant: 'warning' as const },
    quiz: { label: t('teacher1.kalender.typeQuiz'), icon: FileQuestion, variant: 'default' as const },
    ujian: { label: t('teacher1.kalender.typeUjian'), icon: BookOpen, variant: 'destructive' as const },
  }

  return (
    <DashboardLayout role="teacher">
      <div className="space-y-6">
        <div className="flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-center">
          <div>
            <h1 className="text-2xl font-bold text-on-surface">{t('teacher1.kalender.title')}</h1>
            <p className="text-on-surface-variant">{t('teacher1.kalender.subtitle')}</p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={() => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1))}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="text-sm font-medium text-on-surface min-w-[160px] text-center shrink-0">
              {formatMonthYear(currentMonth, locale)}
            </span>
            <Button variant="ghost" size="sm" onClick={() => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1))}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {loading ? (
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <Card key={i}>
                <CardContent className="p-6">
                  <div className="h-5 w-36 rounded bg-surface-container-highest animate-pulse" />
                  <div className="mt-4 space-y-3">
                    <div className="h-16 rounded-lg bg-surface-container-highest animate-pulse" />
                    <div className="h-16 rounded-lg bg-surface-container-highest animate-pulse" />
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : events.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <Calendar className="mx-auto h-12 w-12 text-muted mb-4" />
              <h3 className="font-semibold text-on-surface">{t('teacher1.kalender.emptyTitle')}</h3>
              <p className="text-sm text-on-surface-variant mt-1">
                {t('teacher1.kalender.emptyDesc')}
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-6">
            {Object.entries(groupedByDate).map(([date, dateEvents]) => (
              <Card key={date}>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-sm">
                    <Calendar className="h-4 w-4 text-indigo-400" />
                    {date}
                    <Badge variant="outline" className="ml-2">
                      {t('teacher1.kalender.activityCount', { count: dateEvents.length })}
                    </Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {dateEvents.map((ev) => {
                    const config = typeConfig[ev.type]
                    const Icon = config.icon
                    return (
                      <div
                        key={`${ev.type}-${ev.id}`}
                        className="flex items-start justify-between rounded-lg border border-border bg-surface-container-low p-4"
                      >
                        <div className="flex items-start gap-3 flex-1 min-w-0">
                          <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-surface-container-highest">
                            <Icon className="h-4 w-4 text-on-surface-variant" />
                          </div>
                          <div className="min-w-0">
                            <Badge variant={config.variant}>{config.label}</Badge>
                            <p className="font-medium text-on-surface mt-1 truncate">{ev.title}</p>
                            <p className="text-sm text-on-surface-variant">{ev.course_title}</p>
                            <span className="flex items-center gap-1 text-xs text-muted mt-1">
                              <Clock className="h-3 w-3" />
                              {formatDate(ev.datetime, locale)}
                            </span>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0 ml-4">
                          {ev.type === 'kelas' && ev.meeting_link && (
                            <a href={ev.meeting_link} target="_blank" rel="noopener noreferrer">
                              <Button size="sm">
                                <Video className="mr-1 h-3 w-3" /> {t('teacher1.kalender.join')}
                              </Button>
                            </a>
                          )}
                          {ev.type === 'tugas' && (
                            <Link href={`/teacher/penugasan?course_id=${ev.course_id}`}>
                              <Button size="sm">{t('teacher1.kalender.checkAssignment')}</Button>
                            </Link>
                          )}
                          {ev.type === 'quiz' && (
                            <Link href={`/teacher/quiz?course_id=${ev.course_id}`}>
                              <Button size="sm">{t('teacher1.kalender.viewQuiz')}</Button>
                            </Link>
                          )}
                          {ev.type === 'ujian' && (
                            <Link href={`/teacher/quiz?tab=ujian-akhir&course_id=${ev.course_id}`}>
                              <Button size="sm">{t('teacher1.kalender.viewExam')}</Button>
                            </Link>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </DashboardLayout>
  )
}
