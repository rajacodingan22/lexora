'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Users, BookOpen, ClipboardList, Calendar, BarChart3,
  Clock, ChevronRight, Play,
  ArrowRight, CheckCircle2, Video, Monitor,
  FileText, BookMarked, UserCheck,
  AlertCircle, Timer, Megaphone
} from 'lucide-react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase-client'
import { useAuth } from '@/lib/auth-context'
import { useI18n } from '@/lib/i18n/client'
import { cn } from '@/lib/utils'
import { motion } from 'framer-motion'
import { Flag } from '@/components/ui/flag'
import { getMeetingPhase, isMeetingLinkOpen, minutesUntilJoinable } from '@/lib/utils'
import type { Course, Assignment, Submission, LiveSession } from '@/types'

interface CourseWithStats extends Course {
  student_count?: number
  avg_progress?: number
  avg_grade?: number
}

const containerVariants = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.05 }
  },
}

const itemVariants = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0 },
}

const statsConfig = [
  { labelKey: 'teacher1.dashboard.activeClasses', icon: BookOpen, gradient: 'from-indigo-500/20 to-purple-500/10', iconColor: 'text-indigo-400' },
  { labelKey: 'teacher1.dashboard.totalStudents', icon: Users, gradient: 'from-emerald-500/20 to-teal-500/10', iconColor: 'text-emerald-400' },
  { labelKey: 'teacher1.dashboard.needGrading', icon: ClipboardList, gradient: 'from-amber-500/20 to-orange-500/10', iconColor: 'text-amber-400' },
  { labelKey: 'teacher1.dashboard.avgGrade', icon: BarChart3, gradient: 'from-sky-500/20 to-blue-500/10', iconColor: 'text-sky-400' },
]

const LOCALE_MAP: Record<string, string> = { en: 'en-US', id: 'id-ID', zh: 'zh-CN' }

export default function TeacherDashboard() {
  const { user, loading: authLoading } = useAuth()
  const { t, lang } = useI18n()
  const supabase = createClient()
  const locale = LOCALE_MAP[lang] || 'en-US'

  const [courses, setCourses] = useState<CourseWithStats[]>([])
  const [totalStudents, setTotalStudents] = useState(0)
  const [avgGrade, setAvgGrade] = useState(0)
  const [enrollmentCounts, setEnrollmentCounts] = useState<Record<string, number>>({})
  const [pendingSubmissions, setPendingSubmissions] = useState<(Submission & { assignment?: Assignment })[]>([])
  const [recentSubmissions, setRecentSubmissions] = useState<(Submission & { assignment?: Assignment })[]>([])
  const [upcomingSessions, setUpcomingSessions] = useState<LiveSession[]>([])
  const [pastSessions, setPastSessions] = useState<LiveSession[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (authLoading || !user) return
    fetchData()
    fetch('/api/notifications/generate', { method: 'POST' }).catch(() => {})
  }, [authLoading, user])

  async function fetchData() {
    setLoading(true)
    try {
      const { data: teacherRow } = await supabase
        .from('teachers')
        .select('id')
        .eq('user_id', user!.id)
        .maybeSingle()

      if (!teacherRow) {
        setCourses([])
        setLoading(false)
        return
      }

      const { data: ctRows } = await supabase
        .from('course_teachers')
        .select('course_id')
        .eq('teacher_id', teacherRow.id)

      const courseIds = (ctRows || []).map(ct => ct.course_id)

      if (courseIds.length === 0) {
        setCourses([])
        setLoading(false)
        return
      }

      const { data: coursesData } = await supabase
        .from('courses')
        .select('*, language:languages(code, name, native_name, flag_emoji, is_rtl, level_framework), program:programs(id, name, slug, language_code, program_type)')
        .in('id', courseIds)
        .order('created_at', { ascending: false })

      const teacherCourses = (coursesData || []) as Course[]
      setCourses(teacherCourses)

      const { data: enrollmentRows } = await supabase
        .from('enrollments')
        .select('id, course_id')
        .in('course_id', courseIds)
        .eq('status', 'active')

      const counts: Record<string, number> = {}
      const enrollmentIds: string[] = []
      if (enrollmentRows) {
        for (const e of enrollmentRows) {
          counts[e.course_id] = (counts[e.course_id] || 0) + 1
          enrollmentIds.push(e.id)
        }
      }
      setEnrollmentCounts(counts)
      setTotalStudents(enrollmentIds.length)

      let computedAvgGrade = 0
      if (enrollmentIds.length > 0) {
        const { data: gradeData } = await supabase
          .from('grade_aggregates')
          .select('weighted_total')
          .in('enrollment_id', enrollmentIds)
        if (gradeData && gradeData.length > 0) {
          computedAvgGrade = Math.round(gradeData.reduce((sum, g) => sum + Number(g.weighted_total), 0) / gradeData.length)
        }
      }
      setAvgGrade(computedAvgGrade)

      const [{ data: submissionsData }, { data: sessionsData }] = await Promise.all([
        supabase.from('submissions').select('*, assignment:assignments(*)').in('assignment_id', (
          await supabase.from('assignments').select('id').in('course_id', courseIds)
        ).data?.map(a => a.id) || []).order('submitted_at', { ascending: false }),
        (() => {
          const now = new Date()
          const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate())
          const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1)
          return supabase
            .from('live_sessions')
            .select('*')
            .in('course_id', courseIds)
            .gte('starts_at', startOfDay.toISOString())
            .lt('starts_at', endOfDay.toISOString())
            .order('starts_at')
            .limit(50)
        })(),
      ])

      const sessionsToday = (sessionsData || []) as LiveSession[]
      setUpcomingSessions(sessionsToday.filter(s => getMeetingPhase(s) === 'ongoing' || getMeetingPhase(s) === 'upcoming'))
      setPastSessions(sessionsToday.filter(s => getMeetingPhase(s) === 'past'))

      const subs = (submissionsData || []) as (Submission & { assignment?: Assignment })[]
      setRecentSubmissions(subs.slice(0, 5))
      setPendingSubmissions(subs.filter(s => s.status === 'submitted' && s.grade == null))
    } catch (err) {
      console.error('Failed to fetch teacher dashboard data', err)
    } finally {
      setLoading(false)
    }
  }

  if (loading || authLoading) return <DashboardSkeleton />

  // Pending approval screen
  if (user?.status === 'pending') {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="mx-auto max-w-md text-center">
          <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-gradient-to-br from-amber-500/20 to-orange-500/20">
            <Clock className="h-10 w-10 text-amber-400" />
          </div>
          <Badge variant="warning" className="mb-4 px-3 py-1">{t('teacher1.dashboard.pendingBadge')}</Badge>
          <h1 className="mb-3 text-2xl font-bold text-on-surface">{t('teacher1.dashboard.pendingTitle')}</h1>
          <p className="mb-2 text-on-surface-variant">
            {t('teacher1.dashboard.pendingDesc')}
          </p>
          <p className="mb-8 text-sm text-on-surface-variant">
            {t('teacher1.dashboard.pendingDesc2')}
          </p>
          <Link href="/teacher/apply">
            <Button variant="default">
              <CheckCircle2 className="mr-2 h-4 w-4" /> {t('teacher1.dashboard.checkStatus')}
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </Link>
        </motion.div>
      </div>
    )
  }

  return (
    <motion.div variants={containerVariants} initial="hidden" animate="show" className="space-y-6">
      {/* Hero Header */}
      <motion.div variants={itemVariants}>
        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-indigo-900/60 via-purple-900/40 to-slate-900/80 border border-indigo-500/20 p-6 sm:p-8">
          <div className="absolute inset-0 bg-[url('/dots.svg')] opacity-20" />
          <div className="absolute -top-20 -right-20 h-40 w-40 rounded-full bg-indigo-500/20 blur-3xl" />
          <div className="absolute -bottom-10 -left-10 h-32 w-32 rounded-full bg-purple-500/20 blur-3xl" />
          <div className="relative">
            <div className="flex items-start justify-between flex-wrap gap-4">
              <div className="flex items-center gap-4">
                {user?.photo_url ? (
                  <img src={user.photo_url} alt="" className="h-14 w-14 rounded-full object-cover ring-2 ring-white/20 shadow-lg shadow-indigo-500/20" />
                ) : (
                  <div className="flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-indigo-400 to-purple-500 text-lg font-bold text-white shadow-lg shadow-indigo-500/20">
                    {(user?.display_name || 'G')[0].toUpperCase()}
                  </div>
                )}
                <div>
                  <h1 className="text-2xl font-bold text-white">
                    {t('teacher1.dashboard.greeting', { name: user?.display_name || t('teacher1.dashboard.teacher') })}
                  </h1>
                  <p className="mt-1 text-white/70 text-sm">{t('teacher1.dashboard.subtitle')}</p>
                </div>
              </div>
              <Link href="/teacher/kelas">
                <Button size="sm" className="bg-white/10 text-white border border-white/20 hover:bg-white/20 backdrop-blur-sm">
                  <UserCheck className="mr-1.5 h-4 w-4" /> {t('teacher1.dashboard.chooseClass')}
                </Button>
              </Link>
            </div>

            <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
              {[
                { labelKey: 'teacher1.dashboard.activeClasses', value: String(courses.length), icon: statsConfig[0].icon, color: statsConfig[0].gradient, iconColor: statsConfig[0].iconColor },
                { labelKey: 'teacher1.dashboard.totalStudents', value: String(totalStudents), icon: statsConfig[1].icon, color: statsConfig[1].gradient, iconColor: statsConfig[1].iconColor },
                { labelKey: 'teacher1.dashboard.needGrading', value: String(pendingSubmissions.length), icon: statsConfig[2].icon, color: statsConfig[2].gradient, iconColor: statsConfig[2].iconColor },
                { labelKey: 'teacher1.dashboard.avgGrade', value: avgGrade > 0 ? `${avgGrade}%` : '--', icon: statsConfig[3].icon, color: statsConfig[3].gradient, iconColor: statsConfig[3].iconColor },
              ].map((stat) => (
                <div key={stat.labelKey} className={cn('rounded-xl p-3 border border-white/10 backdrop-blur-sm', stat.color)}>
                  <div className="flex items-center gap-2 text-white/60 text-xs">
                    <stat.icon className={cn('h-3.5 w-3.5', stat.iconColor)} /> {t(stat.labelKey)}
                  </div>
                  <div className="mt-1.5 text-2xl font-bold text-white">{stat.value}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </motion.div>

      {/* Quick Actions — Assignment & Schedule dikelola Admin, Quiz tetap guru */}
      <motion.div variants={itemVariants}>
        <div className="grid grid-cols-2 sm:grid-cols-2 gap-3">
          {[
            { labelKey: 'teacher1.dashboard.chooseClass', icon: UserCheck, href: '/teacher/kelas', color: 'from-indigo-500/20 to-purple-500/10', textColor: 'text-indigo-400' },
            { labelKey: 'teacher1.dashboard.createQuiz', icon: BookMarked, href: '/teacher/quiz', color: 'from-emerald-500/20 to-teal-500/10', textColor: 'text-emerald-400' },
          ].map((action) => (
            <Link key={action.href} href={action.href}>
              <Card className={cn('group cursor-pointer border-border/50 hover:border-primary/30 transition-all duration-300 hover:shadow-md overflow-hidden', action.color)}>
                <CardContent className="flex flex-col items-center gap-2 py-5 text-center">
                  <div className={cn('rounded-xl p-3 bg-background/50 group-hover:scale-110 transition-transform duration-300', action.color)}>
                    <action.icon className={cn('h-6 w-6', action.textColor)} />
                  </div>
                  <span className="text-sm font-medium text-on-surface">{t(action.labelKey)}</span>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      </motion.div>

      {courses.length === 0 ? (
        /* Empty State */
        <motion.div variants={itemVariants}>
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-16 text-center">
              <div className="rounded-full bg-gradient-to-br from-indigo-500/10 to-purple-500/10 p-6 mb-5">
                <BookOpen className="h-12 w-12 text-indigo-400" />
              </div>
              <h2 className="text-xl font-semibold text-on-surface mb-2">{t('teacher1.dashboard.emptyTitle')}</h2>
              <p className="text-sm text-on-surface-variant max-w-sm mb-6">
                {t('teacher1.dashboard.emptyDesc')}
              </p>
              <Link href="/teacher/kelas">
                <Button size="default">
                  <UserCheck className="mr-2 h-4 w-4" /> {t('teacher1.dashboard.chooseClass')}
                </Button>
              </Link>
            </CardContent>
          </Card>
        </motion.div>
      ) : (
        <>
          {/* Main Grid */}
          <div className="grid gap-6 lg:grid-cols-2">
            {/* Today's Schedule */}
            <motion.div variants={itemVariants}>
              <Card>
                <CardHeader className="flex flex-row items-center justify-between pb-3">
                  <CardTitle className="flex items-center gap-2 text-sm">
                    <Calendar className="h-4 w-4 text-primary" /> {t('teacher1.dashboard.todaySchedule')}
                  </CardTitle>
                  <Link href="/teacher/kalender" className="text-xs text-primary">{t('teacher1.dashboard.viewAll')}</Link>
                </CardHeader>
                <CardContent className="space-y-3">
                  {upcomingSessions.length === 0 && pastSessions.length === 0 ? (
                    <div className="text-center py-6">
                      <div className="rounded-full bg-surface-container-low p-3 w-fit mx-auto mb-3">
                        <Calendar className="h-5 w-5 text-muted" />
                      </div>
                      <p className="text-xs text-muted">{t('teacher1.dashboard.noScheduleToday')}</p>
                    </div>
                  ) : (
                    <>
                    {upcomingSessions.slice(0, 4).map((s) => {
                      const course = courses.find(c => c.id === s.course_id)
                      const title = course?.title?.id || course?.title?.en || t('teacher1.dashboard.courseFallback')
                      const startDate = new Date(s.starts_at)
                      const phase = getMeetingPhase(s)
                      const ProviderIcon = s.provider?.toLowerCase() === 'google_meet' ? Monitor : Video
                      const timeStr = startDate.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' })
                      return (
                        <div key={s.id} className={cn(
                          'rounded-lg border p-3 transition-colors',
                          phase === 'ongoing' ? 'border-emerald-500/40 bg-emerald-500/5' : 'border-border bg-surface-container-low'
                        )}>
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex items-center gap-3 flex-1 min-w-0">
                              <div className="flex flex-col items-center min-w-[48px]">
                                <span className="text-xs font-bold text-primary">{timeStr}</span>
                                <span className="text-[10px] text-muted">{startDate.toLocaleDateString(locale, { weekday: 'short' })}</span>
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium text-on-surface truncate">{s.title}</p>
                                <p className="text-xs text-on-surface-variant">{title}</p>
                              </div>
                            </div>
                            <div className="flex items-center gap-1 shrink-0">
                              <ProviderIcon className="h-3.5 w-3.5 text-muted" />
                              {phase === 'ongoing' ? (
                                <span className="flex items-center gap-1 rounded-full bg-emerald-500/20 px-2 py-0.5">
                                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                                  <span className="text-[10px] font-medium text-emerald-400">{t('teacher1.dashboard.live')}</span>
                                </span>
                              ) : (
                                <span className="h-2 w-2 rounded-full bg-emerald-400" />
                              )}
                            </div>
                          </div>
                          <div className="mt-2 flex gap-2">
                            {s.meeting_link && isMeetingLinkOpen(s) ? (
                              <a href={s.meeting_link} target="_blank" rel="noopener noreferrer" className="flex-1">
                                <Button size="sm" variant="default" className="w-full text-xs h-7 bg-gradient-to-r from-emerald-500 to-teal-500 text-white hover:from-emerald-600 hover:to-teal-600">
                                  <Play className="mr-1 h-3 w-3" /> {phase === 'ongoing' ? '🔥 Join' : 'Gabung'}
                                </Button>
                              </a>
                            ) : (
                              <Button size="sm" variant="outline" className="flex-1 text-xs h-7" disabled>
                                <Clock className="mr-1 h-3 w-3" /> {minutesUntilJoinable(s) > 0 ? `${minutesUntilJoinable(s)}m` : 'Link belum ada'}
                              </Button>
                            )}
                            <Link href={`/teacher/kelas`} className="flex-1">
                              <Button size="sm" variant="outline" className="w-full text-xs h-7">
                                {t('teacher1.dashboard.detail')}
                              </Button>
                            </Link>
                          </div>
                        </div>
                      )
                    })}
                    {pastSessions.length > 0 && (
                      <div className="pt-1 border-t border-border/60">
                        <p className="text-[10px] font-medium uppercase tracking-wider text-muted mt-2 mb-2">
                          {t('teacher1.dashboard.historyLabel')}
                        </p>
                        {pastSessions.map((s) => {
                          const course = courses.find(c => c.id === s.course_id)
                          const title = course?.title?.id || course?.title?.en || t('teacher1.dashboard.courseFallback')
                          const startDate = new Date(s.starts_at)
                          const ProviderIcon = s.provider?.toLowerCase() === 'google_meet' ? Monitor : Video
                          const timeStr = startDate.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' })
                          return (
                            <div key={s.id} className="flex items-center justify-between rounded-lg p-2 opacity-70">
                              <div className="flex items-center gap-3 min-w-0">
                                <div className="flex flex-col items-center min-w-[48px]">
                                  <span className="text-xs font-bold text-on-surface-variant">{timeStr}</span>
                                  <span className="text-[10px] text-muted">{startDate.toLocaleDateString(locale, { weekday: 'short' })}</span>
                                </div>
                                <div className="flex-1 min-w-0">
                                  <p className="text-sm font-medium text-on-surface truncate">{s.title}</p>
                                  <p className="text-xs text-on-surface-variant">{title}</p>
                                </div>
                              </div>
                              <div className="flex items-center gap-2 shrink-0">
                                <ProviderIcon className="h-3.5 w-3.5 text-muted" />
                                <Badge variant="outline" className="text-[10px]">{t('teacher1.dashboard.done')}</Badge>
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    )}
                    </>
                  )}
                </CardContent>
              </Card>
            </motion.div>

            {/* Pending Reviews */}
            <motion.div variants={itemVariants}>
              <Card>
                <CardHeader className="flex flex-row items-center justify-between pb-3">
                  <CardTitle className="flex items-center gap-2 text-sm">
                    <ClipboardList className="h-4 w-4 text-primary" /> {t('teacher1.dashboard.needGrading')}
                  </CardTitle>
                  <Link href="/teacher/penugasan" className="text-xs text-primary">{t('teacher1.dashboard.viewAll')}</Link>
                </CardHeader>
                <CardContent className="space-y-3">
                  {pendingSubmissions.length === 0 ? (
                    <div className="text-center py-6">
                      <div className="rounded-full bg-surface-container-low p-3 w-fit mx-auto mb-3">
                        <CheckCircle2 className="h-5 w-5 text-emerald-400" />
                      </div>
                      <p className="text-xs text-muted">{t('teacher1.dashboard.allGraded')}</p>
                    </div>
                  ) : (
                    pendingSubmissions.slice(0, 4).map((s) => {
                      const assignment = s.assignment
                      const overdue = assignment?.due_date ? new Date(assignment.due_date) < new Date() : false
                      return (
                        <div key={s.id} className="flex items-center justify-between rounded-lg border border-border bg-surface-container-low p-3 hover:bg-surface-container transition-colors">
                          <div className="flex items-center gap-3 min-w-0 flex-1">
                            <div className={cn(
                              'flex h-8 w-8 items-center justify-center rounded-full',
                              overdue ? 'bg-red-500/20' : 'bg-amber-500/20'
                            )}>
                              {overdue ? <AlertCircle className="h-4 w-4 text-red-400" /> : <Timer className="h-4 w-4 text-amber-400" />}
                            </div>
                            <div className="min-w-0">
                              <p className="text-sm font-medium text-on-surface truncate">{assignment?.title || t('teacher1.dashboard.assignment')}</p>
                              <p className="text-xs text-muted">{overdue ? t('teacher1.dashboard.overdue') : t('teacher1.dashboard.onTime')}</p>
                            </div>
                          </div>
                          <Badge variant={overdue ? 'destructive' : 'warning'} className="text-[10px] px-1.5 py-0.5 shrink-0 ml-2">
                            {overdue ? t('teacher1.dashboard.missed') : t('teacher1.dashboard.waiting')}
                          </Badge>
                        </div>
                      )
                    })
                  )}
                  {pendingSubmissions.length > 4 && (
                    <Link href="/teacher/penugasan" className="block text-center text-xs text-primary mt-2">
                      {t('teacher1.dashboard.moreToGrade', { count: pendingSubmissions.length - 4 })} <ChevronRight className="inline h-3 w-3" />
                    </Link>
                  )}
                </CardContent>
              </Card>
            </motion.div>
          </div>

          {/* Course Overview */}
          <motion.div variants={itemVariants}>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-3">
                <CardTitle className="flex items-center gap-2 text-sm">
                  <BookOpen className="h-4 w-4 text-primary" /> {t('teacher1.dashboard.courseOverview')}
                </CardTitle>
                <Link href="/teacher/kelas" className="text-xs text-primary">{t('teacher1.dashboard.manage')}</Link>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {courses.map((c, idx) => {
                    const title = c.title?.id || c.title?.en || t('teacher1.dashboard.untitled')
                    const studentCount = enrollmentCounts[c.id] || 0
                    const progress = Math.min(Math.round((studentCount > 0 ? 70 : 0)), 100)
                    return (
                      <motion.div
                        key={c.id}
                        initial={{ opacity: 0, x: -8 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: idx * 0.05 }}
                        className="flex items-center justify-between rounded-lg p-3 hover:bg-surface-container-low transition-colors -mx-3"
                      >
                        <div className="flex items-center gap-3 flex-1 min-w-0">
                          <div className={cn(
                            'flex h-9 w-9 items-center justify-center rounded-lg text-sm',
                            c.status === 'active' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-amber-500/20 text-amber-400'
                          )}>
                            {c.language?.flag_emoji ? <Flag emoji={c.language.flag_emoji} className="h-4 w-auto" /> : '📚'}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <p className="text-sm font-medium text-on-surface truncate">{title}</p>
                              <Badge variant={c.mode === 'online' ? 'info' : 'default'} className="text-[10px] px-1.5 py-0">
                                {c.mode === 'online' ? t('teacher1.dashboard.online') : c.mode || t('teacher1.dashboard.courseFallback')}
                              </Badge>
                            </div>
                            <p className="text-xs text-on-surface-variant mt-0.5">
                              {c.program?.name?.id || c.program?.slug || t('teacher1.dashboard.program')} • {c.language_code?.toUpperCase()}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-4 shrink-0 ml-4">
                          <div className="hidden sm:flex items-center gap-1.5 text-xs text-muted">
                            <Users className="h-3 w-3" />
                            <span>{studentCount}</span>
                          </div>
                          <div className="w-20 hidden sm:block">
                            <div className="h-1.5 rounded-full bg-surface-container-highest overflow-hidden">
                              <div className="h-full rounded-full bg-gradient-to-r from-primary to-accent" style={{ width: `${progress}%` }} />
                            </div>
                          </div>
                          <Badge variant={c.status === 'active' ? 'success' : 'warning'} className="text-[10px] px-1.5 py-0.5 hidden sm:inline-flex">
                            {c.status === 'active' ? t('teacher1.dashboard.active') : t('teacher1.dashboard.draft')}
                          </Badge>
                          <ChevronRight className="h-4 w-4 text-muted" />
                        </div>
                      </motion.div>
                    )
                  })}
                </div>
              </CardContent>
            </Card>
          </motion.div>

          {/* News Feed */}
          <motion.div variants={itemVariants}>
            <NewsFeed />
          </motion.div>

          {/* Recent Submissions */}
          {recentSubmissions.length > 0 && (
            <motion.div variants={itemVariants}>
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center gap-2 text-sm">
                    <Clock className="h-4 w-4 text-primary" /> {t('teacher1.dashboard.recentActivity')}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {recentSubmissions.map((s) => (
                    <div key={s.id} className="flex items-center justify-between rounded-lg border border-border bg-surface-container-low p-3 hover:bg-surface-container transition-colors">
                      <div className="flex items-center gap-3 min-w-0 flex-1">
                        <div className={cn(
                          'flex h-8 w-8 items-center justify-center rounded-full',
                          s.status === 'submitted' ? 'bg-amber-500/20' : s.status === 'graded' ? 'bg-emerald-500/20' : 'bg-surface-container-highest'
                        )}>
                          {s.status === 'submitted' ? <Timer className="h-4 w-4 text-amber-400" /> :
                           s.status === 'graded' ? <CheckCircle2 className="h-4 w-4 text-emerald-400" /> :
                           <Clock className="h-4 w-4 text-muted" />}
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-on-surface truncate">{s.assignment?.title || t('teacher1.dashboard.assignment')}</p>
                          <p className="text-xs text-muted">
                            {s.submitted_at ? new Date(s.submitted_at).toLocaleDateString(locale, { dateStyle: 'medium' }) : t('teacher1.dashboard.notSubmitted')}
                          </p>
                        </div>
                      </div>
                      <Badge variant={s.status === 'submitted' ? 'warning' : s.status === 'graded' ? 'success' : 'default'} className="text-[10px] px-1.5 py-0.5 shrink-0 ml-2">
                        {s.status === 'submitted' ? t('teacher1.dashboard.waiting') : s.status === 'graded' ? t('teacher1.dashboard.graded') : s.status}
                      </Badge>
                    </div>
                  ))}
                </CardContent>
              </Card>
            </motion.div>
          )}
        </>
      )}
    </motion.div>
  )
}

interface NewsFeedItem {
  id: string
  title: string | { id: string; en: string }
  content: string | { id: string; en: string }
  image_url?: string | null
  published_at: string | null
  slug: string
  category?: string | null
}

function NewsFeed() {
  const supabase = createClient()
  const { t, lang } = useI18n()
  const [news, setNews] = useState<NewsFeedItem[]>([])
  const [loading, setLoading] = useState(true)
  const locale = LOCALE_MAP[lang] || 'en-US'

  useEffect(() => {
    supabase.from('news').select('*').eq('status', 'published').order('published_at', { ascending: false }).limit(5).then(({ data }) => {
      setNews((data || []) as NewsFeedItem[])
      setLoading(false)
    })
  }, [])

  if (loading) return null
  if (news.length === 0) return null

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-3">
        <CardTitle className="flex items-center gap-2 text-sm">
          <Megaphone className="h-4 w-4 text-primary" /> {t('teacher1.dashboard.newsTitle')}
        </CardTitle>
        <Link href="/event" className="text-xs text-primary">{t('teacher1.dashboard.viewAll')}</Link>
      </CardHeader>
      <CardContent className="space-y-3">
        {news.map((item) => (
          <Link key={item.slug} href={`/berita/${item.slug}`} className="flex items-start gap-3 rounded-lg border border-border bg-surface-container-low p-3 hover:bg-surface-container transition-colors group">
            {item.image_url && (
              <div className="size-12 shrink-0 rounded-lg overflow-hidden">
                <img src={item.image_url} alt="" className="w-full h-full object-cover" />
              </div>
            )}
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-on-surface truncate group-hover:text-primary transition-colors">
                {typeof item.title === 'string' ? item.title : item.title?.id || item.title?.en || ''}
              </p>
              <p className="text-xs text-muted mt-0.5">
                {item.published_at ? new Date(item.published_at).toLocaleDateString(locale, { dateStyle: 'medium' }) : ''}
                {item.category && ` • ${item.category}`}
              </p>
            </div>
          </Link>
        ))}
      </CardContent>
    </Card>
  )
}

function DashboardSkeleton() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="rounded-2xl bg-surface-container-low p-6 sm:p-8">
        <div className="flex items-center gap-4 mb-6">
          <div className="h-14 w-14 rounded-full bg-surface-container-highest" />
          <div>
            <div className="h-7 w-48 bg-surface-container-highest rounded mb-2" />
            <div className="h-4 w-36 bg-surface-container-highest rounded" />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="rounded-xl bg-surface-container-highest/50 p-3">
              <div className="h-3 w-16 bg-surface-container-highest rounded mb-2" />
              <div className="h-7 w-10 bg-surface-container-highest rounded" />
            </div>
          ))}
        </div>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="rounded-xl border border-border bg-surface p-5">
            <div className="flex flex-col items-center gap-2">
              <div className="h-12 w-12 rounded-xl bg-surface-container-highest" />
              <div className="h-4 w-16 bg-surface-container-highest rounded" />
            </div>
          </div>
        ))}
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-xl border border-border bg-surface p-4">
          <div className="h-5 w-36 bg-surface-container-highest rounded mb-4" />
          <div className="h-12 w-full bg-surface-container-highest rounded" />
        </div>
        <div className="rounded-xl border border-border bg-surface p-4">
          <div className="h-5 w-36 bg-surface-container-highest rounded mb-4" />
          <div className="h-12 w-full bg-surface-container-highest rounded" />
        </div>
      </div>
      <div className="rounded-xl border border-border bg-surface p-4">
        <div className="h-5 w-44 bg-surface-container-highest rounded mb-4" />
        <div className="space-y-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="h-9 w-9 rounded-lg bg-surface-container-highest" />
                <div className="h-4 w-32 bg-surface-container-highest rounded" />
              </div>
              <div className="h-4 w-16 bg-surface-container-highest rounded" />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
