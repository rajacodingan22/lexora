'use client'

import { useEffect, useState, useCallback } from 'react'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/lib/auth-context'
import { useI18n } from '@/lib/i18n/client'
import { createClient } from '@/lib/supabase-client'
import { Calendar, ClipboardList, FileQuestion, BookOpen, Clock } from 'lucide-react'
import Link from 'next/link'
import { formatDate, formatDateOnly, buildTeacherIdByCourse, filterByTeacher } from '@/lib/utils'

interface CalendarItem {
  id: string
  title: string
  course_title: string
  course_id: string
  type: 'assignment' | 'quiz' | 'exam'
  deadline: string
  status: string
}

export default function StudentKalenderPage() {
  const { user } = useAuth()
  const { t } = useI18n()
  const supabase = createClient()

  const [items, setItems] = useState<CalendarItem[]>([])
  const [loading, setLoading] = useState(true)

  const fetchDeadlines = useCallback(async () => {
    if (!user) return

    try {
      const { data: enrollments } = await supabase
        .from('enrollments')
        .select('course_id, teacher_id')
        .eq('user_id', user.id)
        .in('status', ['active', 'completed'])

      const rawEnrollments = (enrollments as { course_id: string; teacher_id: string | null }[]) || []
      const courseIds = rawEnrollments.map((e) => e.course_id)

      if (courseIds.length === 0) {
        setItems([])
        setLoading(false)
        return
      }

      const { data: courses } = await supabase
        .from('courses')
        .select('id, title')
        .in('id', courseIds)

      const courseMap = new Map<string, string>()
      ;(courses || []).forEach((c: any) => {
        courseMap.set(c.id, c.title?.en || c.title?.id || 'Untitled')
      })

      const teacherByCourse = buildTeacherIdByCourse(rawEnrollments)

      const [assignmentsRes, quizzesRes, examsRes] = await Promise.all([
        supabase.from('assignments').select('*').in('course_id', courseIds),
        supabase.from('quizzes').select('*').in('course_id', courseIds),
        supabase.from('final_exams').select('*').in('course_id', courseIds),
      ])

      const now = new Date().toISOString()

      const allItems: CalendarItem[] = [
        ...filterByTeacher((assignmentsRes.data || []), teacherByCourse).map((a: any) => ({
          id: a.id,
          title: a.title,
          course_title: courseMap.get(a.course_id) || '',
          course_id: a.course_id,
          type: 'assignment' as const,
          deadline: a.due_date,
          status: a.status,
        })),
        ...(quizzesRes.data || []).map((q: any) => ({
          id: q.id,
          title: q.title,
          course_title: courseMap.get(q.course_id) || '',
          course_id: q.course_id,
          type: 'quiz' as const,
          deadline: q.created_at,
          status: q.status,
        })),
        ...(examsRes.data || []).map((e: any) => ({
          id: e.id,
          title: e.title,
          course_title: courseMap.get(e.course_id) || '',
          course_id: e.course_id,
          type: 'exam' as const,
          deadline: e.created_at,
          status: e.status,
        })),
      ].filter((item) => item.deadline >= now)
       .sort((a, b) => new Date(a.deadline).getTime() - new Date(b.deadline).getTime())

      setItems(allItems)
    } catch (err) {
      console.error('Failed to fetch deadlines:', err)
      setItems([])
    }
    setLoading(false)
  }, [user, supabase])

  useEffect(() => {
    fetchDeadlines()
  }, [fetchDeadlines])

  const groupedByDate: Record<string, CalendarItem[]> = {}
  items.forEach((item) => {
    const dateKey = formatDateOnly(item.deadline)
    if (!groupedByDate[dateKey]) groupedByDate[dateKey] = []
    groupedByDate[dateKey].push(item)
  })

  const typeConfig = {
    assignment: { label: t('student1.kalender.typeAssignment'), icon: ClipboardList, variant: 'warning' as const },
    quiz: { label: t('student1.kalender.typeQuiz'), icon: FileQuestion, variant: 'default' as const },
    exam: { label: t('student1.kalender.typeExam'), icon: BookOpen, variant: 'destructive' as const },
  }

  return (
    <section className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-on-surface">{t('student1.kalender.title')}</h1>
        <p className="text-on-surface-variant">{t('student1.kalender.subtitle')}</p>
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
      ) : items.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Calendar className="mx-auto h-12 w-12 text-muted mb-4" />
            <h3 className="font-semibold text-on-surface">{t('student1.kalender.noSchedule')}</h3>
            <p className="text-sm text-on-surface-variant mt-1">
              {t('student1.kalender.noScheduleDesc')}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          {Object.entries(groupedByDate).map(([date, dateItems]) => (
            <Card key={date}>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-sm">
                  <Calendar className="h-4 w-4 text-indigo-400" />
                  {date}
                  <Badge variant="outline" className="ml-2">{t('student1.kalender.itemCount', { count: dateItems.length })}</Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {dateItems.map((item) => {
                  const config = typeConfig[item.type]
                  const Icon = config.icon
                  return (
                    <div
                      key={`${item.type}-${item.id}`}
                      className="flex items-start justify-between rounded-lg border border-border bg-surface-container-low p-4"
                    >
                      <div className="flex items-start gap-3 flex-1 min-w-0">
                        <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-surface-container-highest">
                          <Icon className="h-4 w-4 text-on-surface-variant" />
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <Badge variant={config.variant}>{config.label}</Badge>
                            {item.status === 'submitted' && (
                              <Badge variant="success">Done</Badge>
                            )}
                          </div>
                          <p className="font-medium text-on-surface mt-1 truncate">{item.title}</p>
                          <p className="text-sm text-on-surface-variant">{item.course_title}</p>
                          <span className="flex items-center gap-1 text-xs text-muted mt-1">
                            <Clock className="h-3 w-3" />
                            {formatDate(item.deadline)}
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0 ml-4">
                        {item.type === 'assignment' && (
                          <Link href={`/student/kursus/${item.course_id}?tab=tugas`}>
                            <Button size="sm">{t('student1.kalender.doTask')}</Button>
                          </Link>
                        )}
                        {item.type === 'quiz' && (
                          <Link href={`/student/kursus/${item.course_id}?tab=quiz`}>
                            <Button size="sm">{t('student1.kalender.start')}</Button>
                          </Link>
                        )}
                        {item.type === 'exam' && (
                          <Link href={`/student/kursus/${item.course_id}?tab=ujian`}>
                            <Button size="sm">{t('student1.kalender.view')}</Button>
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
    </section>
  )
}
