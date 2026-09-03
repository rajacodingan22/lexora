'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  BookOpen, Clock, Trophy, TrendingUp, Play, Calendar,
  Bell, ChevronRight, Sparkles, Award,
  GraduationCap, Loader2, Inbox, Video, Monitor,
  CheckCircle, ArrowRight,
  Target, Users, BookMarked,
  MessageSquare, Megaphone
} from 'lucide-react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase-client'
import { useAuth } from '@/lib/auth-context'
import { useI18n } from '@/lib/i18n/client'
import { cn, timeAgo, buildTeacherIdByCourse, filterByTeacher, getMeetingPhase, isMeetingLinkOpen, minutesUntilJoinable } from '@/lib/utils'
import { renderNotification } from '@/lib/notif-text'
import { motion } from 'framer-motion'
import { Flag } from '@/components/ui/flag'
import { normalizeTier } from '@/lib/course-catalog'
import type { Course, Enrollment, GradeAggregate, Notification, QuizAttempt, LiveSession } from '@/types'

interface EnrolledCourse extends Enrollment {
  course: Course
}

const statIcons = [BookOpen, TrendingUp, Award, GraduationCap]
const statColors = ['from-indigo-500/20 to-purple-500/10', 'from-emerald-500/20 to-teal-500/10', 'from-amber-500/20 to-orange-500/10', 'from-sky-500/20 to-blue-500/10']
const statIconColors = ['text-indigo-400', 'text-emerald-400', 'text-amber-400', 'text-sky-400']

const LOCALE_MAP: Record<string, string> = { en: 'en-US', id: 'id-ID', zh: 'zh-CN' }

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

export default function StudentDashboard() {
  const { user, loading: authLoading } = useAuth()
  const { t, lang } = useI18n()
  const supabase = createClient()
  const locale = LOCALE_MAP[lang] || 'en-US'

  const [enrollments, setEnrollments] = useState<EnrolledCourse[]>([])
  const [grades, setGrades] = useState<GradeAggregate[]>([])
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [quizAttempts, setQuizAttempts] = useState<QuizAttempt[]>([])
  const [certCount, setCertCount] = useState(0)
  const [upcomingMeetings, setUpcomingMeetings] = useState<LiveSession[]>([])
  const [attendanceByCourse, setAttendanceByCourse] = useState<Record<string, { held: number; present: number }>>({})
  const [loading, setLoading] = useState(true)
  const [placementResult, setPlacementResult] = useState<{ level: string; language_code: string } | null>(null)
  const [placementLanguage, setPlacementLanguage] = useState<{ flag_emoji: string; name: string } | null>(null)
  const [placementLoading, setPlacementLoading] = useState(true)
  const [trialState, setTrialState] = useState<'none' | 'active' | 'waiting' | 'checking'>('checking')
  const [claiming, setClaiming] = useState(false)
  const [streak, setStreak] = useState(0)

  useEffect(() => {
    if (authLoading || !user) return
    fetchData()
    fetch('/api/notifications/generate', { method: 'POST' }).catch(() => {})
    const interval = setInterval(() => fetchData(true), 30000)
    const onFocus = () => fetchData(true)
    window.addEventListener('focus', onFocus)
    return () => {
      clearInterval(interval)
      window.removeEventListener('focus', onFocus)
    }
  }, [authLoading, user])

  async function fetchData(silent = false) {
    if (!silent) setLoading(true)
    try {
      const [enrollRes, notifRes, quizRes, certRes, placementRes, waitRes, activityRes] = await Promise.all([
        supabase.from('enrollments').select('*, course:courses(*)').eq('user_id', user!.id).eq('status', 'active'),
        supabase.from('notifications').select('*').eq('user_id', user!.id).order('created_at', { ascending: false }).limit(5),
        supabase.from('quiz_attempts').select('*, quiz:quizzes(*)').eq('user_id', user!.id).order('submitted_at', { ascending: false }),
        supabase.from('certificates').select('*', { count: 'exact', head: true }).eq('user_id', user!.id).in('status', ['issued', 'generated']),
        supabase.from('placement_results').select('provisional_level, test:test_id(language_code)').eq('user_id', user!.id).order('completed_at', { ascending: false }).limit(1).maybeSingle(),
        supabase.from('waiting_list').select('*, course:courses(is_try_class)').eq('user_id', user!.id).eq('status', 'waiting'),
        supabase.from('student_activity_progress').select('completed_at').eq('user_id', user!.id).not('completed_at', 'is', null),
      ])

      const trialActive = (enrollRes.data || []).some((e: any) => e.course?.is_try_class)
      const trialWaiting = (waitRes.data || []).some((w: any) => w.course?.is_try_class)
      setTrialState(trialActive ? 'active' : trialWaiting ? 'waiting' : 'none')

      if (placementRes.data) {
        const pData = placementRes.data as any
        const langCode = pData.test?.language_code || ''
        setPlacementResult({ level: pData.provisional_level, language_code: langCode })
        if (langCode) {
          try {
            const { data: langData } = await supabase
              .from('languages')
              .select('flag_emoji, name')
              .eq('code', langCode)
              .maybeSingle()
            if (langData) {
              const nameObj = langData.name as { id?: string; en?: string } | undefined
              setPlacementLanguage({
                flag_emoji: langData.flag_emoji || '',
                name: nameObj?.id || nameObj?.en || langCode.toUpperCase(),
              })
            }
          } catch {}
        }
      } else {
        setPlacementResult(null)
        setPlacementLanguage(null)
      }
      setPlacementLoading(false)

      const enrollmentsData = (enrollRes.data || []) as EnrolledCourse[]
      setEnrollments(enrollmentsData)
      setNotifications((notifRes.data || []) as Notification[])
      setQuizAttempts((quizRes.data || []) as QuizAttempt[])
      setCertCount(certRes.count ?? 0)

      const activityDates = (activityRes.data || [])
        .map((a: { completed_at: string }) => a.completed_at.split('T')[0])
        .filter(Boolean)
      const uniqueDays = [...new Set(activityDates)].sort().reverse()
      let currentStreak = 0
      if (uniqueDays.length > 0) {
        const today = new Date()
        today.setHours(0, 0, 0, 0)
        const yesterday = new Date(today)
        yesterday.setDate(yesterday.getDate() - 1)
        const lastDay = new Date(uniqueDays[0])
        lastDay.setHours(0, 0, 0, 0)
        if (lastDay.getTime() === today.getTime() || lastDay.getTime() === yesterday.getTime()) {
          currentStreak = 1
          for (let i = 1; i < uniqueDays.length; i++) {
            const curr = new Date(uniqueDays[i - 1])
            const prev = new Date(uniqueDays[i])
            curr.setHours(0, 0, 0, 0)
            prev.setHours(0, 0, 0, 0)
            const diffDays = Math.round((curr.getTime() - prev.getTime()) / 86400000)
            if (diffDays === 1) {
              currentStreak++
            } else {
              break
            }
          }
        }
      }
      setStreak(currentStreak)

      const courseIds = enrollmentsData.map(e => e.course_id)
      if (courseIds.length > 0) {
        const [gradeRes, sessionRes] = await Promise.all([
          supabase.from('grade_aggregates').select('*').in('enrollment_id', enrollmentsData.map(e => e.id)),
          supabase.from('live_sessions').select('*').in('course_id', courseIds).order('starts_at', { ascending: true }),
        ])
        setGrades((gradeRes.data || []) as GradeAggregate[])

        const teacherByCourse = buildTeacherIdByCourse(enrollmentsData)
        const allSessions = filterByTeacher((sessionRes.data || []) as LiveSession[], teacherByCourse)
        const now = new Date()
        setUpcomingMeetings(
          allSessions
            .filter(s => getMeetingPhase(s, now) === 'ongoing' || getMeetingPhase(s, now) === 'upcoming')
            .sort((a, b) => new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime())
            .slice(0, 5)
        )

        const sessionIds = allSessions.map(s => s.id)
        if (sessionIds.length > 0) {
          const { data: attData } = await supabase
            .from('attendance')
            .select('session_id, status')
            .eq('user_id', user!.id)
            .in('session_id', sessionIds)
          const presentSet = new Set(
            (attData || []).filter(a => a.status === 'present').map(a => a.session_id)
          )
          const byCourse: Record<string, { held: number; present: number }> = {}
          const nowMs = Date.now()
          for (const s of allSessions) {
            if (s.status === 'cancelled') continue
            if (new Date(s.starts_at).getTime() < nowMs) {
              const entry = byCourse[s.course_id] || { held: 0, present: 0 }
              entry.held++
              if (presentSet.has(s.id)) entry.present++
              byCourse[s.course_id] = entry
            }
          }
          setAttendanceByCourse(byCourse)
        }
      }
    } catch (err) {
      console.error('Failed to fetch student dashboard data', err)
    } finally {
      setLoading(false)
    }
  }

  async function handleClaimTrial() {
    setClaiming(true)
    try {
      const res = await fetch('/api/claim-trial', { method: 'POST' })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || t('student1.dashboard.claimTrialError'))
      setTrialState(json.data?.status === 'waiting' ? 'waiting' : 'active')
      fetchData()
    } catch (err: any) {
      console.error('Claim trial error:', err)
      alert(err.message || t('student1.dashboard.claimTrialError'))
    } finally {
      setClaiming(false)
    }
  }

  const gradeMap = new Map(grades.map(g => [g.enrollment_id, g.weighted_total || 0]))

  const avgGrade = grades.length
    ? Math.round(grades.reduce((s, g) => s + (g.weighted_total || 0), 0) / grades.length)
    : 0

  const avgProgress = enrollments.length
    ? Math.round(enrollments.reduce((s, e) => s + (gradeMap.get(e.id) || 0), 0) / enrollments.length)
    : 0

  if (loading || authLoading) return <DashboardSkeleton />

  return (
    <motion.div variants={containerVariants} initial="hidden" animate="show" className="space-y-6">
      {/* Hero Section */}
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
                    {(user?.display_name || 'S')[0].toUpperCase()}
                  </div>
                )}
                <div>
                  <h1 className="text-2xl font-bold text-white">
                    {t('student1.dashboard.welcome', { name: user?.display_name || t('student1.dashboard.studentFallback') })}
                  </h1>
                  <p className="mt-1 text-white/70 text-sm">
                    {t('student1.dashboard.welcomeSubtitle')}
                  </p>
                </div>
              </div>
              <Link href="/student/placement-test">
                <Button size="sm" className="bg-white/10 text-white border border-white/20 hover:bg-white/20 backdrop-blur-sm">
                  <Sparkles className="mr-1.5 h-4 w-4" /> {t('student1.dashboard.placementTest')}
                </Button>
              </Link>
            </div>
            <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-5">
              {[
                { label: t('student1.dashboard.statActiveCourses'), value: String(enrollments.length), icon: statIcons[0], color: statColors[0], iconColor: statIconColors[0] },
                { label: t('student1.dashboard.statAvgProgress'), value: `${avgProgress}%`, icon: statIcons[1], color: statColors[1], iconColor: statIconColors[1] },
                { label: t('student1.dashboard.statAvgGrade'), value: String(avgGrade), icon: statIcons[2], color: statColors[2], iconColor: statIconColors[2] },
                { label: t('student1.dashboard.statCertificates'), value: String(certCount), icon: statIcons[3], color: statColors[3], iconColor: statIconColors[3] },
                { label: t('student1.dashboard.statStreak'), value: `${streak} ${t('student1.dashboard.statStreakDays')}`, icon: Trophy, color: streak > 0 ? 'from-orange-500/20 to-red-500/10' : statColors[0], iconColor: streak > 0 ? 'text-orange-400' : statIconColors[0] },
              ].map((stat) => (
                <div key={stat.label} className={cn('rounded-xl p-3 border border-white/10 backdrop-blur-sm', stat.color)}>
                  <div className="flex items-center gap-2 text-white/60 text-xs">
                    <stat.icon className={cn('h-3.5 w-3.5', stat.iconColor)} /> {stat.label}
                  </div>
                  <div className="mt-1.5 text-2xl font-bold text-white">{stat.value}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </motion.div>

      {/* Trial Class Activation */}
      {trialState !== 'checking' && (
        <motion.div variants={itemVariants}>
          {trialState === 'none' ? (
            <Card className="border-emerald-500/20 bg-gradient-to-r from-emerald-500/10 via-teal-500/5 to-transparent overflow-hidden">
              <CardContent className="flex flex-wrap items-center justify-between gap-4 p-4 sm:p-6">
                <div className="flex items-center gap-4">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-emerald-500/20">
                    <Sparkles className="h-6 w-6 text-emerald-400" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-on-surface">{t('student1.dashboard.trialTitle')}</p>
                    <p className="text-xs text-on-surface-variant">
                      {t('student1.dashboard.trialDesc')}
                    </p>
                  </div>
                </div>
                <Button
                  size="sm"
                  className="shrink-0 bg-gradient-to-r from-emerald-500 to-teal-500 text-white hover:from-emerald-600 hover:to-teal-600"
                  onClick={handleClaimTrial}
                  disabled={claiming}
                >
                  {claiming ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Sparkles className="mr-1.5 h-4 w-4" />}
                  {t('student1.dashboard.trialActivate')}
                </Button>
              </CardContent>
            </Card>
          ) : trialState === 'waiting' ? (
            <Card className="border-orange-500/20 bg-gradient-to-r from-orange-500/10 via-amber-500/5 to-transparent overflow-hidden">
              <CardContent className="flex flex-wrap items-center justify-between gap-4 p-4 sm:p-6">
                <div className="flex items-center gap-4">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-orange-500/20">
                    <Clock className="h-6 w-6 text-orange-400" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-on-surface">{t('student1.dashboard.trialWaitingTitle')}</p>
                    <p className="text-xs text-on-surface-variant">
                      {t('student1.dashboard.trialWaitingDesc')}
                    </p>
                  </div>
                </div>
                <Link href="/project">
                  <Button size="sm" variant="outline" className="shrink-0">
                    {t('student1.dashboard.viewOtherClasses')} <ArrowRight className="ml-1.5 h-4 w-4" />
                  </Button>
                </Link>
              </CardContent>
            </Card>
          ) : (
            <Card className="border-emerald-500/20 bg-gradient-to-r from-emerald-500/10 to-teal-500/5">
              <CardContent className="flex flex-wrap items-center justify-between gap-4 p-4 sm:p-6">
                <div className="flex items-center gap-4">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-emerald-500/20">
                    <CheckCircle className="h-6 w-6 text-emerald-400" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-on-surface">{t('student1.dashboard.trialActiveTitle')}</p>
                    <p className="text-xs text-on-surface-variant">{t('student1.dashboard.trialActiveDesc')}</p>
                  </div>
                </div>
                <Link href="/student/kursus">
                  <Button size="sm" className="shrink-0">
                    {t('student1.dashboard.goToMyClass')} <ArrowRight className="ml-1.5 h-4 w-4" />
                  </Button>
                </Link>
              </CardContent>
            </Card>
          )}
        </motion.div>
      )}

      {/* Profile Completion */}
      {!authLoading && user && !user.phone_number && !user.birth_date && !user.country && (
        <motion.div variants={itemVariants}>
          <Card className="border-amber-500/20 bg-gradient-to-r from-amber-500/10 via-amber-500/5 to-transparent overflow-hidden">
            <CardContent className="flex items-center justify-between p-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-amber-500/20">
                  <Sparkles className="h-5 w-5 text-amber-400" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-on-surface">{t('student1.dashboard.completeProfileTitle')}</p>
                  <p className="text-xs text-on-surface-variant">{t('student1.dashboard.completeProfileDesc')}</p>
                </div>
              </div>
              <Link href="/student/profil">
                <Button size="sm" variant="warning" className="shrink-0">
                  {t('student1.dashboard.completeProfile')}
                </Button>
              </Link>
            </CardContent>
          </Card>
        </motion.div>
      )}

      {/* Placement Test Section */}
      {!placementLoading && (
        <motion.div variants={itemVariants}>
          {placementResult ? (
            <Card className="border-indigo-500/20 bg-gradient-to-r from-indigo-500/10 to-purple-500/5">
              <CardContent className="flex items-center justify-between p-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-indigo-500/20 text-lg">
                    {placementLanguage?.flag_emoji ? <Flag emoji={placementLanguage.flag_emoji} className="h-5 w-auto" /> : <GraduationCap className="h-5 w-5 text-indigo-400" />}
                  </div>
                  <div>
                    <p className="text-sm font-medium text-on-surface">{t('student1.dashboard.placementResultTitle')}</p>
                    <p className="text-xs text-on-surface-variant">
                      {t('student1.dashboard.placementLevel', { language: placementLanguage?.name || placementResult.language_code.toUpperCase() })}{' '}
                      <Badge variant="outline" className="ml-1 text-indigo-400 border-indigo-500/30 text-[11px]">{t(`common.tier.${normalizeTier(placementResult.level) || 'unknown'}`)}</Badge>
                    </p>
                  </div>
                </div>
                <Link href="/student/riwayat-placement">
                  <Button variant="ghost" size="sm" className="text-indigo-400">{t('student1.dashboard.placementDetails')} <ChevronRight className="ml-1 h-3 w-3" /></Button>
                </Link>
              </CardContent>
            </Card>
          ) : (
            <Card className="border-amber-500/20 bg-gradient-to-r from-amber-500/10 via-orange-500/5 to-transparent overflow-hidden">
              <CardContent className="flex items-center justify-between p-4 sm:p-6">
                <div className="flex items-center gap-4">
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-amber-500/20">
                    <Target className="h-6 w-6 text-amber-400" />
                  </div>
                  <div>
                    <p className="text-base font-semibold text-on-surface">{t('student1.dashboard.placementCtaTitle')}</p>
                    <p className="text-sm text-on-surface-variant mt-0.5">{t('student1.dashboard.placementCtaDesc')}</p>
                  </div>
                </div>
                <Link href="/student/placement-test">
                  <Button className="shrink-0 bg-amber-500 hover:bg-amber-600 text-white shadow-lg shadow-amber-500/20">
                    {t('student1.dashboard.placementCtaButton')} <ArrowRight className="ml-1.5 h-4 w-4" />
                  </Button>
                </Link>
              </CardContent>
            </Card>
          )}
        </motion.div>
      )}

      {/* Quick Actions */}
      <motion.div variants={itemVariants}>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: t('student1.dashboard.quickMyCourses'), icon: BookOpen, href: '/student/kursus', color: 'from-indigo-500/20 to-purple-500/10', textColor: 'text-indigo-400' },
            { label: t('student1.dashboard.placementTest'), icon: Target, href: '/student/placement-test', color: 'from-amber-500/20 to-orange-500/10', textColor: 'text-amber-400' },
            { label: t('student1.dashboard.statCertificates'), icon: Award, href: '/student/sertifikat', color: 'from-emerald-500/20 to-teal-500/10', textColor: 'text-emerald-400' },
            { label: t('student1.dashboard.quickDiscussion'), icon: MessageSquare, href: '/student/diskusi', color: 'from-sky-500/20 to-blue-500/10', textColor: 'text-sky-400' },
          ].map((action) => (
            <Link key={action.href} href={action.href}>
              <Card className={cn('group cursor-pointer border-border/50 hover:border-primary/30 transition-all duration-300 hover:shadow-md overflow-hidden', action.color)}>
                <CardContent className="flex flex-col items-center gap-2 py-5 text-center">
                  <div className={cn('rounded-xl p-3 bg-background/50 group-hover:scale-110 transition-transform duration-300', action.color)}>
                    <action.icon className={cn('h-6 w-6', action.textColor)} />
                  </div>
                  <span className="text-sm font-medium text-on-surface">{action.label}</span>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      </motion.div>

      {/* Main Content Grid */}
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-4">
          {/* Active Courses */}
          <motion.div variants={itemVariants}>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-lg font-semibold text-on-surface flex items-center gap-2">
                <BookOpen className="h-5 w-5 text-primary" /> {t('student1.dashboard.statActiveCourses')}
              </h2>
              <Link href="/student/kursus" className="text-sm text-primary hover:text-primary/80 flex items-center gap-1">
                {t('student1.dashboard.viewAll')} <ChevronRight className="h-3.5 w-3.5" />
              </Link>
            </div>

            {enrollments.length === 0 ? (
              <Card>
                <CardContent className="flex flex-col items-center justify-center py-12 text-center">
                  <div className="rounded-full bg-surface-container-low p-4 mb-4">
                    <Inbox className="h-8 w-8 text-muted" />
                  </div>
                  <p className="text-sm font-medium text-on-surface mb-1">{t('student1.dashboard.noActiveCourses')}</p>
                  <p className="text-xs text-on-surface-variant mb-4">{t('student1.dashboard.noActiveCoursesDesc')}</p>
                  <Link href="/student/kursus">
                    <Button size="sm"><BookOpen className="mr-1.5 h-4 w-4" /> {t('student1.dashboard.findCourses')}</Button>
                  </Link>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-3">
                {enrollments.slice(0, 3).map((enr, idx) => {
                  const course = enr.course
                  const title = course?.title?.id || course?.title?.en || 'Untitled Course'
                  const grade = grades.find(g => g.enrollment_id === enr.id)
                  const progress = grade?.weighted_total || 0
                  const nextMeeting = upcomingMeetings.find(m => m.course_id === course?.id)
                  const attendance = attendanceByCourse[course?.id || ''] || null
                  return (
                    <motion.div
                      key={enr.id}
                      initial={{ opacity: 0, y: 12 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: idx * 0.08, duration: 0.3 }}
                    >
                      <Link href={`/student/kursus/${course?.id}`}>
                        <Card className="group cursor-pointer transition-all hover:border-primary/30 hover:shadow-md border-border/60 overflow-hidden">
                          <CardContent className="p-4 sm:p-5">
                            <div className="flex items-start justify-between gap-4">
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 mb-1">
                                  <span className="text-base">{course?.language?.flag_emoji ? <Flag emoji={course.language.flag_emoji} className="h-4 w-auto" /> : '📚'}</span>
                                  <h3 className="font-semibold text-on-surface truncate">{title}</h3>
                                </div>
                                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-on-surface-variant mt-2">
                                  {course?.teacher && (
                                    <span className="flex items-center gap-1"><Users className="h-3 w-3" /> {course.teacher.display_name || t('student1.dashboard.instructor')}</span>
                                  )}
                                  {course?.program && (
                                    <span className="flex items-center gap-1"><BookMarked className="h-3 w-3" /> {course.program.name?.id || course.program.slug}</span>
                                  )}
                            {attendance && attendance.held > 0 && (
                              <div className="mt-2 flex items-center justify-between text-xs text-on-surface-variant">
                                <span>{t('student1.dashboard.attendanceLabel')}</span>
                                <span className="font-semibold text-on-surface">{attendance.present}/{attendance.held} • {Math.round((attendance.present / attendance.held) * 100)}%</span>
                              </div>
                            )}
                            {nextMeeting && (
                                    <span className="flex items-center gap-1 text-primary"><Calendar className="h-3 w-3" /> {t('student1.dashboard.nextMeetingLabel')}</span>
                                  )}
                                </div>
                              </div>
                              <Badge variant={progress >= 70 ? 'success' : progress >= 40 ? 'warning' : 'default'} className="shrink-0">
                                {Math.round(progress)}%
                              </Badge>
                            </div>
                            <div className="mt-4 space-y-1">
                              <div className="flex justify-between text-xs text-on-surface-variant">
                                <span>{t('student1.dashboard.progressLabel')}</span>
                                <span>{Math.round(progress)}%</span>
                              </div>
                              <div className="h-2 rounded-full bg-surface-container-highest overflow-hidden">
                                <div
                                  className="h-full rounded-full bg-gradient-to-r from-primary to-accent transition-all duration-700 ease-out"
                                  style={{ width: `${Math.min(progress, 100)}%` }}
                                />
                              </div>
                            </div>
                            {nextMeeting && (
                              <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-lg bg-primary/5 border border-primary/10 p-2.5">
                                <div className="flex items-center gap-2 text-xs min-w-0">
                                  <Video className="h-3.5 w-3.5 text-primary shrink-0" />
                                  <span className="text-on-surface-variant truncate max-w-[180px]">{nextMeeting.title}</span>
                                  <span className="text-muted shrink-0">• {new Date(nextMeeting.starts_at).toLocaleDateString(locale, { weekday: 'short', day: 'numeric', month: 'short' })}</span>
                                </div>
                                <Badge variant="info" className="text-[10px] px-1.5 py-0.5 shrink-0">{t('student1.dashboard.today')}</Badge>
                              </div>
                            )}
                          </CardContent>
                        </Card>
                      </Link>
                    </motion.div>
                  )
                })}
              </div>
            )}
          </motion.div>

          {/* Recent Quiz Results */}
          {quizAttempts.length > 0 && (
            <motion.div variants={itemVariants}>
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-sm">
                    <Trophy className="h-4 w-4 text-primary" /> {t('student1.dashboard.recentQuizTitle')}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {quizAttempts.slice(0, 4).map((qa, _idx) => {
                    const q = (qa as any).quiz
                    return (
                      <div key={qa.id} className="flex items-center justify-between rounded-lg border border-border bg-surface-container-low p-3 hover:bg-surface-container transition-colors">
                        <div className="flex items-center gap-3">
                          <div className={cn(
                            'flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold',
                            qa.score != null && qa.score >= 70 ? 'bg-emerald-500/20 text-emerald-400' :
                            qa.score != null ? 'bg-amber-500/20 text-amber-400' : 'bg-surface-container-highest text-muted'
                          )}>
                            {qa.score != null ? `${Math.round(qa.score)}` : '?'}
                          </div>
                          <div>
                            <p className="text-sm font-medium text-on-surface">{q?.title || t('student1.dashboard.quizFallback')}</p>
                            <p className="text-xs text-muted">{t('student1.dashboard.attemptNumber', { number: qa.attempt_number })}</p>
                          </div>
                        </div>
                        <Badge variant={qa.score != null && qa.score >= 70 ? 'success' : 'warning'} className="text-[11px]">
                          {qa.score != null ? `${Math.round(qa.score)}%` : t('student1.dashboard.quizPending')}
                        </Badge>
                      </div>
                    )
                  })}
                </CardContent>
              </Card>
            </motion.div>
          )}
        </div>

        {/* Right Sidebar */}
        <div className="space-y-4">
          {/* Upcoming Meetings */}
          <motion.div variants={itemVariants}>
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-sm">
                  <Video className="h-4 w-4 text-primary" /> {t('student1.dashboard.upcomingMeetingsTitle')}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {upcomingMeetings.length === 0 ? (
                  <div className="text-center py-6">
                    <div className="rounded-full bg-surface-container-low p-3 w-fit mx-auto mb-3">
                      <Calendar className="h-5 w-5 text-muted" />
                    </div>
                    <p className="text-xs text-muted">{t('student1.dashboard.noMeetings')}</p>
                  </div>
                ) : (
                  upcomingMeetings.slice(0, 3).map((m) => {
                    const course = enrollments.find(e => e.course_id === m.course_id)?.course
                    const courseName = course?.title?.id || course?.title?.en || t('student1.dashboard.courseFallback')
                    const ProviderIcon = m.provider?.toLowerCase() === 'google_meet' ? Monitor : Video
                    const startDate = new Date(m.starts_at)
                    const phase = getMeetingPhase(m)
                    const isToday = startDate.toDateString() === new Date().toDateString()
                    return (
                      <div key={m.id} className="rounded-lg border border-border bg-surface-container-low p-3 hover:bg-surface-container transition-colors">
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-on-surface truncate">{m.title}</p>
                            <p className="text-xs text-on-surface-variant mt-0.5">{courseName}</p>
                            <p className="text-xs text-muted mt-1 flex items-center gap-1">
                              <Calendar className="h-3 w-3" />
                              {startDate.toLocaleDateString(locale, { weekday: 'short', day: 'numeric', month: 'short' })}
                              {' • '}
                              {startDate.toLocaleTimeString(locale, { timeStyle: 'short' })}
                            </p>
                          </div>
                          <div className="flex flex-col items-end gap-1 shrink-0">
                            {phase === 'ongoing' ? (
                              <Badge variant="success" className="text-[10px] px-1.5 py-0.5">
                                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse mr-1" />{t('student1.dashboard.live')}
                              </Badge>
                            ) : (
                              <Badge variant={isToday ? 'success' : 'info'} className="text-[10px] px-1.5 py-0.5">
                                {isToday ? t('student1.dashboard.today') : t('student1.dashboard.upcomingBadge')}
                              </Badge>
                            )}
                            <ProviderIcon className="h-4 w-4 text-muted" />
                          </div>
                        </div>
                        {m.meeting_link ? (
                          (() => {
                            const joinable = isMeetingLinkOpen(m)
                            const minsUntil = minutesUntilJoinable(m)
                            if (joinable) {
                              return (
                                <a href={m.meeting_link} target="_blank" rel="noopener noreferrer">
                                  <Button size="sm" variant="default" className="mt-2 w-full text-xs h-8 bg-gradient-to-r from-emerald-500 to-teal-500 text-white hover:from-emerald-600 hover:to-teal-600">
                                    <Play className="mr-1 h-3 w-3" /> {phase === 'ongoing' ? '🔥 Join Sekarang' : 'Gabung'}
                                  </Button>
                                </a>
                              )
                            }
                            return (
                              <Button size="sm" variant="outline" className="mt-2 w-full text-xs h-8" disabled>
                                <Clock className="mr-1 h-3 w-3" /> {minsUntil > 0 ? `Tunggu ${minsUntil} menit` : 'Link belum tersedia'}
                              </Button>
                            )
                          })()
                        ) : (
                          <p className="mt-2 text-center text-xs text-muted">{m.provider}</p>
                        )}
                      </div>
                    )
                  })
                )}
                {upcomingMeetings.length > 3 && (
                  <Link href="/student/kalender" className="block text-center text-xs text-primary mt-2">
                    {t('student1.dashboard.viewAll')} <ChevronRight className="inline h-3 w-3" />
                  </Link>
                )}
              </CardContent>
            </Card>
          </motion.div>

          {/* Notifications */}
          <motion.div variants={itemVariants}>
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-sm">
                  <Bell className="h-4 w-4 text-primary" /> {t('student1.dashboard.notificationsTitle')}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {notifications.length === 0 ? (
                  <div className="text-center py-6">
                    <div className="rounded-full bg-surface-container-low p-3 w-fit mx-auto mb-3">
                      <Bell className="h-5 w-5 text-muted" />
                    </div>
                    <p className="text-xs text-muted">{t('student1.dashboard.noNotifications')}</p>
                  </div>
                ) : (
                  notifications.map((n) => (
                    <button key={n.id} onClick={async () => {
                      try { if (!n.is_read) await fetch('/api/notifications', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: n.id }) }) } catch {}
                      if (n.link) window.location.href = n.link
                    }} className="flex w-full items-start gap-3 group cursor-pointer hover:bg-surface-container-low rounded-lg p-2 -mx-2 transition-colors text-left">
                      <div className={cn(
                        'mt-1 h-2.5 w-2.5 rounded-full shrink-0 ring-2 ring-background',
                        n.type === 'assignment' ? 'bg-amber-400' : n.type === 'quiz' ? 'bg-emerald-400' : n.type === 'meeting' ? 'bg-sky-400' : 'bg-indigo-400'
                      )} />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-on-surface truncate">{renderNotification(n, t).title}</p>
                        <p className="text-xs text-muted">{timeAgo(n.created_at, lang)}</p>
                      </div>
                      {!n.is_read && <span className="h-2 w-2 rounded-full bg-primary shrink-0 mt-1.5" />}
                    </button>
                  ))
                )}
              </CardContent>
            </Card>
          </motion.div>

          {/* News Feed */}
          <motion.div variants={itemVariants}>
            <StudentNewsFeed />
          </motion.div>
        </div>
      </div>
    </motion.div>
  )
}

function StudentNewsFeed() {
  const { t, lang } = useI18n()
  const supabase = createClient()
  const [news, setNews] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const locale = LOCALE_MAP[lang] || 'en-US'

  useEffect(() => {
    supabase.from('news').select('title, content, image_url, published_at, created_at, slug, category').eq('status', 'published').order('published_at', { ascending: false }).limit(5).then(({ data }) => {
      setNews((data || []) as any[])
      setLoading(false)
    })
  }, [])

  if (loading) return null
  if (news.length === 0) return null

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-sm">
          <Megaphone className="h-4 w-4 text-primary" /> {t('student1.dashboard.newsTitle')}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {news.map((item) => (
          <Link key={item.slug} href={`/berita/${item.slug}`} className="flex items-start gap-3 rounded-lg border border-border bg-surface-container-low p-3 hover:bg-surface-container transition-colors group">
            {item.image_url && (
              <div className="size-10 shrink-0 rounded-lg overflow-hidden">
                <img src={item.image_url} alt="" className="w-full h-full object-cover" />
              </div>
            )}
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-on-surface truncate group-hover:text-primary transition-colors">{item.title}</p>
              <p className="text-xs text-muted mt-0.5">
                {item.published_at ? new Date(item.published_at).toLocaleDateString(locale, { dateStyle: 'medium' }) : ''}
              </p>
            </div>
          </Link>
        ))}
        <Link href="/event" className="block text-center text-xs text-primary mt-2">
          {t('student1.dashboard.newsViewAll')} <ChevronRight className="inline h-3 w-3" />
        </Link>
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
            <div className="h-7 w-56 bg-surface-container-highest rounded mb-2" />
            <div className="h-4 w-40 bg-surface-container-highest rounded" />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="rounded-xl bg-surface-container-highest/50 p-3">
              <div className="h-3 w-20 bg-surface-container-highest rounded mb-2" />
              <div className="h-7 w-12 bg-surface-container-highest rounded" />
            </div>
          ))}
        </div>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="rounded-xl border border-border bg-surface p-5">
            <div className="flex flex-col items-center gap-2">
              <div className="h-12 w-12 rounded-xl bg-surface-container-highest" />
              <div className="h-4 w-20 bg-surface-container-highest rounded" />
            </div>
          </div>
        ))}
      </div>
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-4">
          <div className="flex justify-between">
            <div className="h-5 w-32 bg-surface-container-highest rounded" />
            <div className="h-4 w-16 bg-surface-container-highest rounded" />
          </div>
          {Array.from({ length: 2 }).map((_, i) => (
            <div key={i} className="rounded-xl border border-border bg-surface p-5">
              <div className="h-5 w-48 bg-surface-container-highest rounded mb-2" />
              <div className="h-4 w-32 bg-surface-container-highest rounded mb-3" />
              <div className="h-2 w-full bg-surface-container-highest rounded mb-3" />
              <div className="h-8 w-full bg-surface-container-highest rounded" />
            </div>
          ))}
        </div>
        <div className="space-y-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="rounded-xl border border-border bg-surface p-4">
              <div className="h-5 w-36 bg-surface-container-highest rounded mb-4" />
              <div className="h-12 w-full bg-surface-container-highest rounded" />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
