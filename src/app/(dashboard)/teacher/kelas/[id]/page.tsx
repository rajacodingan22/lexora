'use client'

import { useEffect, useState, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { DashboardLayout } from '@/components/layout/dashboard-layout'
import { useAuth } from '@/lib/auth-context'
import { createClient } from '@/lib/supabase-client'
import { useI18n } from '@/lib/i18n/client'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Flag } from '@/components/ui/flag'

import {
  ArrowLeft, BookOpen, Users, Plus,
  FileText, PenLine, Settings, X, Layers, Calendar, Clock,
  Video, GraduationCap, Loader2, Globe, BarChart3, Play, ExternalLink
} from 'lucide-react'
import { motion } from 'framer-motion'
import { cn } from '@/lib/utils'
import { normalizeTier, trackLabelKey, type CourseCatalogDetails } from '@/lib/course-catalog'
import { formatDate } from '@/lib/utils'
import { BatchCountdown } from '@/components/shared/batch-countdown'

interface BatchRow {
  id: string
  name: string | null
  status: string
  capacity: number
  current_students: number
  start_date: string | null
  end_date: string | null
  meetings_per_week: number
}

interface CourseDetail {
  id: string
  title: { id: string; en: string }
  description: { id: string; en: string } | null
  tier?: string | null
  track_type?: string | null
  language_code: string
  status: string
  meeting_count: number
  project_count: number
  level?: { name?: { id: string; en: string }; code?: string; tier?: string } | null
  program?: { tier?: string | null; track_type?: string | null } | null
  language?: { name?: { id: string; en: string }; flag_emoji?: string | null } | null
  student_count: number
  batches: BatchRow[]
  sessions: { id: string; title: string | null; starts_at: string | null; duration_minutes: number | null; provider: string | null; meeting_link: string | null; status: string }[]
  schedules: { id: string; day_of_week: number; start_time: string; duration_minutes: number | null }[]
}

interface ScheduleFormState {
  day_of_week: number
  start_time: string
  duration_minutes: number
}

interface SessionFormState {
  title: string
  meeting_link: string
  starts_at: string
  duration_minutes: number
  provider: string
}

const DAY_KEYS = [
  'teacher1.kelas.daySunday',
  'teacher1.kelas.dayMonday',
  'teacher1.kelas.dayTuesday',
  'teacher1.kelas.dayWednesday',
  'teacher1.kelas.dayThursday',
  'teacher1.kelas.dayFriday',
  'teacher1.kelas.daySaturday',
]

const containerVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.06 } },
}

const itemVariants = {
  hidden: { opacity: 0, y: 16 },
  visible: { opacity: 1, y: 0, transition: { type: 'spring' as const, stiffness: 120, damping: 16 } },
}

function ModalOverlay({
  children, open, onClose,
}: {
  children: React.ReactNode; open: boolean; onClose: () => void
}) {
  return (
    <div
      className={cn('fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 overflow-y-auto', !open && 'hidden')}
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded-xl border border-border bg-background shadow-2xl my-8"
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  )
}

export default function TeacherClassDetailPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const { user, loading: authLoading } = useAuth()
  const { t, lang } = useI18n()
  const locale = lang === 'en' ? 'en-US' : lang === 'zh' ? 'zh-CN' : 'id-ID'

  const [course, setCourse] = useState<CourseDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [activeTab, setActiveTab] = useState('overview')

  const [showScheduleModal, setShowScheduleModal] = useState(false)
  const [scheduleForm, setScheduleForm] = useState<ScheduleFormState>({ day_of_week: 1, start_time: '19:00', duration_minutes: 60 })
  const [savingSchedule, setSavingSchedule] = useState(false)

  const [showSessionModal, setShowSessionModal] = useState(false)
  const [sessionForm, setSessionForm] = useState<SessionFormState>({ title: '', meeting_link: '', starts_at: '', duration_minutes: 60, provider: 'Zoom' })
  const [savingSession, setSavingSession] = useState(false)
  const [sessionError, setSessionError] = useState('')

  const [schedulingId, setSchedulingId] = useState<string | null>(null)
  const [activatingId, setActivatingId] = useState<string | null>(null)
  const [scheduleDate, setScheduleDate] = useState('')
  const [meetingsPerWeek, setMeetingsPerWeek] = useState(2)

  const fetchCourse = useCallback(async () => {
    if (!user || !id) return
    const supabase = createClient()
    setLoading(true)

    try {
      const { data: myTeacherIds } = await supabase
        .from('teachers')
        .select('id')
        .eq('user_id', user.id)
      const teacherId = myTeacherIds?.[0]?.id
      if (!teacherId) { setNotFound(true); setLoading(false); return }

      const { data: myCTs } = await supabase
        .from('course_teachers')
        .select('course_id')
        .eq('teacher_id', teacherId)
      const myCourseIds = new Set((myCTs || []).map(ct => ct.course_id))
      if (!myCourseIds.has(id)) { setNotFound(true); setLoading(false); return }

      const { data: courseData, error } = await supabase
        .from('courses')
        .select('id, title, description, language_code, tier, track_type, status, meeting_count, project_count, level:language_levels(name, code, tier), program:programs(tier, track_type), language:languages(name, flag_emoji)')
        .eq('id', id)
        .single()
      if (error || !courseData) { setNotFound(true); setLoading(false); return }

      const { count: enrollmentCount } = await supabase
        .from('enrollments')
        .select('id', { count: 'exact', head: true })
        .eq('course_id', id)
        .eq('status', 'active')

      const { data: batchesData } = await supabase
        .from('batches')
        .select('id, name, status, capacity, current_students, start_date, end_date, meetings_per_week')
        .eq('course_id', id)
        .order('start_date', { ascending: true })
        .order('created_at', { ascending: true })

      const { data: sessionsData } = await supabase
        .from('live_sessions')
        .select('id, title, starts_at, duration_minutes, provider, meeting_link, status')
        .eq('course_id', id)
        .order('starts_at', { ascending: true })

      const { data: schedulesData } = await supabase
        .from('course_schedules')
        .select('id, day_of_week, start_time, duration_minutes')
        .eq('course_id', id)
        .order('day_of_week', { ascending: true })

      setCourse({
        id: courseData.id,
        title: courseData.title,
        description: courseData.description,
        tier: courseData.tier,
        track_type: courseData.track_type,
        language_code: courseData.language_code,
        status: courseData.status,
        meeting_count: Number(courseData.meeting_count) || 0,
        project_count: Number(courseData.project_count) || 0,
        level: (courseData.level as any[] | null)?.[0] ?? null,
        program: (courseData.program as any[] | null)?.[0] ?? null,
        language: (courseData.language as any[] | null)?.[0] ?? null,
        student_count: enrollmentCount || 0,
        batches: (batchesData || []).map((b: any) => ({
          ...b,
          capacity: Number(b.capacity) || 0,
          current_students: Number(b.current_students) || 0,
          meetings_per_week: Number(b.meetings_per_week) || 2,
        })),
        sessions: sessionsData || [],
        schedules: schedulesData || [],
      })
    } catch (err) {
      console.error('Failed to fetch class detail:', err)
      setNotFound(true)
    }
    setLoading(false)
  }, [user, id])

  useEffect(() => {
    if (authLoading || !user) return
    fetchCourse()
  }, [user, authLoading, fetchCourse])

  useEffect(() => {
    if (!user || !id) return
    const supabaseRealtime = createClient()
    const channel = supabaseRealtime
      .channel('kelas-detail-batches')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'batches', filter: `course_id=eq.${id}` },
        () => { fetchCourse() }
      )
      .subscribe()
    return () => { supabaseRealtime.removeChannel(channel) }
  }, [user, id, fetchCourse])

  async function handleCreateSchedule() {
    if (!course) return
    if (!scheduleForm.start_time) return
    setSavingSchedule(true)
    const supabase = createClient()
    try {
      const { error } = await supabase
        .from('course_schedules')
        .insert({
          course_id: course.id,
          day_of_week: scheduleForm.day_of_week,
          start_time: scheduleForm.start_time,
          duration_minutes: scheduleForm.duration_minutes,
        })
      if (error) throw error
      setShowScheduleModal(false)
      await fetchCourse()
    } catch (err) {
      console.error('Failed to create schedule:', err)
    }
    setSavingSchedule(false)
  }

  async function handleCreateSession() {
    if (!course) return
    if (!sessionForm.meeting_link.trim() || !sessionForm.starts_at) return
    setSavingSession(true)
    setSessionError('')
    const supabase = createClient()
    try {
      const { data: teacherRow } = await supabase
        .from('teachers')
        .select('id')
        .eq('user_id', user!.id)
        .single()

      const startsAtISO = new Date(sessionForm.starts_at).toISOString()

      const { error } = await supabase
        .from('live_sessions')
        .insert({
          course_id: course.id,
          teacher_id: teacherRow?.id ?? null,
          title: sessionForm.title || `${sessionForm.provider}: ${course.title?.id || course.title?.en || ''}`,
          meeting_link: sessionForm.meeting_link.trim(),
          starts_at: startsAtISO,
          duration_minutes: sessionForm.duration_minutes,
          provider: sessionForm.provider,
          status: 'scheduled',
        })
      if (error) throw error
      setShowSessionModal(false)
      await fetchCourse()
    } catch (err: any) {
      console.error('Failed to create session:', err)
      setSessionError(err?.message || 'Gagal membuat sesi')
    }
    setSavingSession(false)
  }

  async function handleScheduleBatch(batchId: string) {
    if (!scheduleDate || meetingsPerWeek < 1) return
    setActivatingId(batchId)
    const supabase = createClient()
    try {
      const { error } = await supabase
        .from('batches')
        .update({ start_date: scheduleDate, meetings_per_week: meetingsPerWeek })
        .eq('id', batchId)
      if (error) throw error
      setSchedulingId(null)
      setScheduleDate('')
      setMeetingsPerWeek(2)
      await fetchCourse()
    } catch (err) {
      console.error('Failed to schedule batch:', err)
    } finally {
      setActivatingId(null)
    }
  }

  function openCreateSession() {
    const now = new Date()
    const localStr = new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 16)
    setSessionForm({
      title: '',
      meeting_link: '',
      starts_at: localStr,
      duration_minutes: 60,
      provider: 'Zoom',
    })
    setSessionError('')
    setShowSessionModal(true)
  }

  function openCreateSchedule() {
    setScheduleForm({ day_of_week: 1, start_time: '19:00', duration_minutes: 60 })
    setShowScheduleModal(true)
  }

  const batchStatusLabel = (status: string) => {
    switch (status) {
      case 'upcoming': return t('teacher1.kelas.batchUpcoming')
      case 'active': return t('teacher1.kelas.batchActive')
      case 'completed': return t('teacher1.kelas.batchCompleted')
      default: return status
    }
  }

  const batchStatusVariant = (status: string): 'default' | 'success' | 'outline' | 'warning' => {
    if (status === 'active') return 'success'
    if (status === 'completed') return 'outline'
    return 'default'
  }

  const statusVariant = (status?: string) => {
    switch (status) {
      case 'active': return 'success' as const
      case 'draft': return 'warning' as const
      case 'archived': return 'destructive' as const
      default: return 'default' as const
    }
  }

  if (loading) {
    return (
      <DashboardLayout role="teacher">
        <div className="space-y-4">
          <div className="h-8 w-48 rounded bg-surface-container-high animate-pulse" />
          <div className="h-40 rounded-xl bg-surface-container-high animate-pulse" />
          <div className="grid gap-4 md:grid-cols-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-24 rounded-xl bg-surface-container-high animate-pulse" />
            ))}
          </div>
        </div>
      </DashboardLayout>
    )
  }

  if (notFound || !course) {
    return (
      <DashboardLayout role="teacher">
        <div className="flex flex-col items-center justify-center py-20">
          <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-gradient-to-br from-red-500/10 to-orange-500/10 mb-4 ring-1 ring-red-500/20">
            <BookOpen className="h-10 w-10 text-red-400" />
          </div>
          <h3 className="text-lg font-semibold text-on-surface">{t('teacher1.kelas.classNotFound')}</h3>
          <Button variant="outline" className="mt-4" onClick={() => router.push('/teacher/kelas')}>
            <ArrowLeft className="mr-1.5 h-4 w-4" /> {t('teacher1.kelas.backToClasses')}
          </Button>
        </div>
      </DashboardLayout>
    )
  }

  const title = course.title?.id || course.title?.en
  const description = course.description?.id || course.description?.en
  const tier = course.tier || course.level?.tier || course.level?.code || course.program?.tier
  const track = course.track_type || course.program?.track_type
  const languageFlag = course.language?.flag_emoji || null
  const languageName = course.language?.name?.id || course.language?.name?.en

  const statItems = [
    { icon: Users, value: course.student_count, label: t('teacher1.kelas.studentsCount', { count: course.student_count }), color: 'text-emerald-400' },
    { icon: Video, value: course.meeting_count, label: t('teacher1.kelas.meetingsCount', { count: course.meeting_count }), color: 'text-sky-400' },
    { icon: BookOpen, value: course.project_count, label: t('teacher1.kelas.projectsCount', { count: course.project_count }), color: 'text-amber-400' },
  ]

  return (
    <DashboardLayout role="teacher">
      <motion.div variants={containerVariants} initial="hidden" animate="visible" className="space-y-6">
        {/* ═══ Header ═══ */}
        <motion.div variants={itemVariants}>
          <Button variant="ghost" size="sm" className="mb-3 -ml-2 text-on-surface-variant hover:text-on-surface" onClick={() => router.push('/teacher/kelas')}>
            <ArrowLeft className="mr-1.5 h-4 w-4" /> {t('teacher1.kelas.backToClasses')}
          </Button>
          <Card className="overflow-hidden p-0">
            <div className="h-1.5 bg-gradient-to-r from-indigo-500 via-purple-500 to-indigo-500" />
            <CardContent className="p-6">
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h1 className="text-2xl font-bold text-on-surface">{title}</h1>
                    <Badge variant={statusVariant(course.status)} className="capitalize">
                      {course.status === 'active' ? t('teacher1.kelas.statusActive') : course.status === 'draft' ? t('teacher1.kelas.statusDraft') : course.status}
                    </Badge>
                  </div>
                  <div className="flex flex-wrap items-center gap-3 mt-1.5">
                    {languageFlag && <Flag emoji={languageFlag} className="h-4 w-auto" />}
                    {languageName && (
                      <Badge variant="outline"><Globe className="h-3 w-3 mr-1" />{languageName}</Badge>
                    )}
                    {tier && (
                      <Badge variant="outline"><BarChart3 className="h-3 w-3 mr-1" />{t(`common.tier.${normalizeTier(tier) || 'unknown'}`)}</Badge>
                    )}
                    {track && (
                      <Badge variant="outline"><Layers className="h-3 w-3 mr-1" />{t(trackLabelKey(track))}</Badge>
                    )}
                  </div>
                  {description && (
                    <p className="text-sm text-on-surface-variant mt-3 max-w-2xl leading-relaxed">{description}</p>
                  )}
                </div>
                <div className="flex flex-wrap gap-2 shrink-0">
                  <Link href={`/teacher/materi?course_id=${course.id}`}>
                    <Button variant="outline" size="sm"><FileText className="mr-1.5 h-3.5 w-3.5" />{t('teacher1.kelas.manageMaterials')}</Button>
                  </Link>

                  <Link href={`/teacher/nilai?course_id=${course.id}`}>
                    <Button variant="outline" size="sm"><Settings className="mr-1.5 h-3.5 w-3.5" />{t('teacher1.kelas.manageGrades')}</Button>
                  </Link>
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        {/* ═══ Stat Cards ═══ */}
        <motion.div variants={itemVariants} className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {statItems.map((s, i) => (
            <Card key={i} className="hover:shadow-lg hover:shadow-indigo-500/5 transition-all duration-300">
              <CardContent className="p-4">
                <div className="flex items-center justify-between mb-2">
                  <s.icon className={cn('h-5 w-5', s.color)} />
                </div>
                <p className="text-2xl font-bold text-on-surface">{s.value}</p>
                <p className="text-xs text-muted mt-0.5">{s.label}</p>
              </CardContent>
            </Card>
          ))}
        </motion.div>

        {/* ═══ Tabs ═══ */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <TabsList>
            <TabsTrigger value="overview">{t('teacher1.kelas.tabOverview')}</TabsTrigger>
            <TabsTrigger value="batches" count={course.batches.length}>{t('teacher1.kelas.tabBatches')}</TabsTrigger>
            <TabsTrigger value="sessions" count={course.sessions.length}>{t('teacher1.kelas.tabSessions')}</TabsTrigger>
            <TabsTrigger value="schedule" count={course.schedules.length}>{t('teacher1.kelas.tabSchedule')}</TabsTrigger>
          </TabsList>

          {/* ── Overview ── */}
          <TabsContent value="overview" className="space-y-4">
            <div className="grid gap-4 lg:grid-cols-2">
              <Card>
                <CardContent className="p-5 space-y-3">
                  <h3 className="text-sm font-semibold text-on-surface flex items-center gap-2">
                    <Layers className="h-4 w-4 text-indigo-400" /> {t('teacher1.kelas.quickActions')}
                  </h3>
                  <div className="grid grid-cols-2 gap-2">
                    <Link href={`/teacher/materi?course_id=${course.id}`}>
                      <Button variant="outline" className="w-full justify-start"><FileText className="mr-2 h-4 w-4 text-red-400" />{t('teacher1.kelas.btnMaterial')}</Button>
                    </Link>

                    <Link href={`/teacher/nilai?course_id=${course.id}`}>
                      <Button variant="outline" className="w-full justify-start"><Settings className="mr-2 h-4 w-4 text-emerald-400" />{t('teacher1.kelas.btnGrade')}</Button>
                    </Link>
                    <div className="w-full rounded-lg border border-border bg-blue-500/5 px-3 py-2 text-xs text-blue-400 flex items-center gap-1">
                      <Calendar className="h-3 w-3" /> {t('teacher2.pertemuan.adminManaged') || 'Dikelola Admin'}
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="p-5 space-y-3">
                  <h3 className="text-sm font-semibold text-on-surface flex items-center gap-2">
                    <Clock className="h-4 w-4 text-amber-400" /> {t('teacher1.kelas.tabSchedule')}
                  </h3>
                  {course.schedules.length === 0 ? (
                    <p className="text-sm text-on-surface-variant">{t('teacher1.kelas.noSchedules')}</p>
                  ) : (
                    <div className="space-y-2">
                      {course.schedules.map((s) => (
                        <div key={s.id} className="flex items-center justify-between rounded-lg border border-border/60 bg-surface-container-lowest px-3 py-2">
                          <span className="flex items-center gap-2 text-sm text-on-surface">
                            <Calendar className="h-4 w-4 text-indigo-400 shrink-0" />
                            {t(DAY_KEYS[s.day_of_week] || DAY_KEYS[0])}
                          </span>
                          <span className="text-sm text-on-surface-variant">
                            {s.start_time}{s.duration_minutes ? ` · ${s.duration_minutes} min` : ''}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                  <div className="w-full rounded-lg border border-border bg-blue-500/5 px-3 py-1.5 text-xs text-blue-400 text-center">
                    {t('teacher2.pertemuan.adminManagedHint') || 'Dikelola Admin'}
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* ── Batches ── */}
          <TabsContent value="batches" className="space-y-3">
            {course.batches.length === 0 ? (
              <Card><CardContent className="flex flex-col items-center justify-center py-12">
                <GraduationCap className="h-8 w-8 text-indigo-400 mb-2" />
                <p className="text-sm text-on-surface-variant">{t('teacher1.kelas.noBatches')}</p>
              </CardContent></Card>
            ) : (
              course.batches.map((b) => {
                const daysUntilStart = b.start_date
                  ? Math.ceil((new Date(b.start_date).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
                  : null
                const totalMeetings = course.meeting_count || 0
                const sessionsCreated = course.sessions.length
                const sessionsRemaining = Math.max(0, totalMeetings - sessionsCreated)
                const endDateStr = b.end_date
                  ? new Date(b.end_date).toLocaleDateString(locale, { day: 'numeric', month: 'short', year: 'numeric' })
                  : ''
                const daysRemaining = b.end_date
                  ? Math.ceil((new Date(b.end_date).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
                  : null
                const isBehind = b.status === 'active' && sessionsRemaining > 0 && daysRemaining !== null && daysRemaining < 7 && sessionsRemaining > (daysRemaining * (b.meetings_per_week || 2))
                return (
                  <Card key={b.id}>
                    <CardContent className="p-4 space-y-3">
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <div className="flex items-center gap-2 min-w-0">
                          <GraduationCap className="h-4 w-4 text-indigo-400 shrink-0" />
                          <span className="font-semibold text-on-surface truncate">{b.name || t('teacher1.kelas.untitledBatch')}</span>
                          <span className="text-xs text-muted shrink-0">
                            {t('teacher1.kelas.batchStudents', { count: b.current_students, capacity: b.capacity })}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          {b.status === 'upcoming' && daysUntilStart !== null && daysUntilStart > 0 && (
                            <span className="text-xs text-amber-400">{t('teacher1.kelas.startsIn', { days: daysUntilStart })}</span>
                          )}
                          <Badge variant={batchStatusVariant(b.status)}>{batchStatusLabel(b.status)}</Badge>
                        </div>
                      </div>

                      {b.status === 'active' && (
                        <BatchCountdown endDate={b.end_date} status={b.status} />
                      )}

                      {totalMeetings > 0 && (b.status === 'active' || b.status === 'upcoming') && (
                        <div className="space-y-1">
                          <div className="flex items-center justify-between text-xs">
                            <span className="text-on-surface-variant">
                              {t('teacher1.kelas.sessionProgress', { created: sessionsCreated, total: totalMeetings })}
                            </span>
                            {endDateStr && <span className="text-muted">{t('teacher1.kelas.endsOn', { date: endDateStr })}</span>}
                          </div>
                          <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-container-high">
                            <div
                              className={cn('h-full rounded-full transition-all duration-500', isBehind ? 'bg-red-400' : 'bg-indigo-400')}
                              style={{ width: `${Math.min(100, totalMeetings > 0 ? Math.round((sessionsCreated / totalMeetings) * 100) : 0)}%` }}
                            />
                          </div>
                          {isBehind && (
                            <p className="text-xs text-red-400 font-medium">
                              {t('teacher1.kelas.behindWarning', { need: sessionsRemaining })}
                            </p>
                          )}
                        </div>
                      )}

                      {b.status === 'upcoming' && (
                        schedulingId === b.id ? (
                          <div className="flex flex-col gap-2 rounded-lg border border-border/60 bg-surface-container-lowest p-3">
                            <div className="flex items-center gap-2">
                              <Input
                                type="date"
                                className="h-8 w-36 text-xs px-2"
                                value={scheduleDate}
                                onChange={(e) => setScheduleDate(e.target.value)}
                              />
                              <Button
                                size="sm"
                                className="h-8 text-xs"
                                onClick={() => handleScheduleBatch(b.id)}
                                disabled={activatingId === b.id || !scheduleDate || meetingsPerWeek < 1}
                              >
                                {activatingId === b.id ? <Loader2 className="h-3 w-3 animate-spin" /> : t('teacher1.kelas.save')}
                              </Button>
                              <button
                                className="text-muted hover:text-on-surface"
                                onClick={() => { setSchedulingId(null); setScheduleDate(''); setMeetingsPerWeek(2) }}
                              >
                                <X className="h-4 w-4" />
                              </button>
                            </div>
                            <div className="flex items-center gap-2 text-xs text-on-surface-variant">
                              <Label className="text-xs shrink-0">{t('teacher1.kelas.meetingsPerWeek')}</Label>
                              <Input
                                type="number"
                                min={1}
                                max={7}
                                className="h-7 w-16 text-xs px-1"
                                value={meetingsPerWeek}
                                onChange={(e) => setMeetingsPerWeek(parseInt(e.target.value) || 1)}
                              />
                              <span className="text-muted">{t('teacher1.kelas.perWeek')}</span>
                            </div>
                          </div>
                        ) : (
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-8 text-xs"
                            onClick={() => { setSchedulingId(b.id); setScheduleDate(b.start_date ? b.start_date.slice(0, 10) : ''); setMeetingsPerWeek(b.meetings_per_week || 2) }}
                          >
                            <Calendar className="h-3 w-3 mr-1" /> {t('teacher1.kelas.scheduleBatch')}
                          </Button>
                        )
                      )}
                    </CardContent>
                  </Card>
                )
              })
            )}
          </TabsContent>

          {/* ── Sessions ── */}
          <TabsContent value="sessions" className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-sm text-on-surface-variant">{t('teacher1.kelas.sessionCount', { count: course.sessions.length })}</p>
              <Badge variant="outline" className="text-xs bg-blue-500/10 text-blue-400 border-blue-500/20">{t('teacher2.pertemuan.adminManaged')}</Badge>
            </div>
            {course.sessions.length === 0 ? (
              <Card><CardContent className="flex flex-col items-center justify-center py-12">
                <Video className="h-8 w-8 text-sky-400 mb-2" />
                <p className="text-sm text-on-surface-variant">{t('teacher1.kelas.noSessions')}</p>
                <p className="text-xs text-blue-400 mt-2">{t('teacher2.pertemuan.adminManagedHint')}</p>
              </CardContent></Card>
            ) : (
              course.sessions.map((s) => {
                const isUpcoming = s.starts_at && new Date(s.starts_at).getTime() > Date.now()
                return (
                  <Card key={s.id}>
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-500/15 to-teal-500/15">
                            <Video className="h-5 w-5 text-emerald-400" />
                          </div>
                          <div className="min-w-0">
                            <p className="font-semibold text-on-surface text-sm truncate">{s.title || `${s.provider || ''} Session`}</p>
                            <p className="text-xs text-on-surface-variant">
                              {s.starts_at ? formatDate(s.starts_at) : '—'}
                              {s.duration_minutes ? ` · ${s.duration_minutes} min` : ''}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <Badge variant={isUpcoming ? 'default' : 'outline'}>
                            {isUpcoming ? t('teacher1.kelas.batchUpcoming') : t('teacher1.kelas.batchCompleted')}
                          </Badge>
                          {s.meeting_link && (
                            <Button size="sm" variant="outline" className="h-8" onClick={() => window.open(s.meeting_link!, '_blank')}>
                              <ExternalLink className="h-3.5 w-3.5" />
                            </Button>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                )
              })
            )}
          </TabsContent>

          {/* ── Schedule ── */}
          <TabsContent value="schedule" className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-sm text-on-surface-variant">{t('teacher1.kelas.scheduleCount', { count: course.schedules.length })}</p>
              <Badge variant="outline" className="text-xs bg-blue-500/10 text-blue-400 border-blue-500/20">{t('teacher2.pertemuan.adminManaged')}</Badge>
            </div>
            {course.schedules.length === 0 ? (
              <Card><CardContent className="flex flex-col items-center justify-center py-12">
                <Calendar className="h-8 w-8 text-amber-400 mb-2" />
                <p className="text-sm text-on-surface-variant">{t('teacher1.kelas.noSchedules')}</p>
                <p className="text-xs text-blue-400 mt-2">{t('teacher2.pertemuan.adminManagedHint')}</p>
              </CardContent></Card>
            ) : (
              course.schedules.map((s) => (
                <Card key={s.id}>
                  <CardContent className="p-4 flex items-center justify-between">
                    <span className="flex items-center gap-2 text-sm text-on-surface">
                      <Calendar className="h-4 w-4 text-indigo-400 shrink-0" />
                      {t(DAY_KEYS[s.day_of_week] || DAY_KEYS[0])}
                    </span>
                    <span className="text-sm text-on-surface-variant">
                      {s.start_time}{s.duration_minutes ? ` · ${s.duration_minutes} min` : ''}
                    </span>
                  </CardContent>
                </Card>
              ))
            )}
          </TabsContent>
        </Tabs>
      </motion.div>

      {/* ═══ Schedule Modal ═══ */}
      <ModalOverlay open={showScheduleModal} onClose={() => setShowScheduleModal(false)}>
        <div className="p-6">
          <div className="flex items-center justify-between mb-5">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-sky-500/15 to-blue-500/15">
                <Calendar className="h-5 w-5 text-sky-400" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-on-surface">{t('teacher1.kelas.scheduleModalTitle')}</h2>
                <p className="text-xs text-on-surface-variant">{t('teacher1.kelas.scheduleModalSub')}</p>
              </div>
            </div>
            <button onClick={() => setShowScheduleModal(false)} className="text-muted hover:text-on-surface transition-colors p-1 rounded-lg hover:bg-surface-container-highest">
              <X className="h-5 w-5" />
            </button>
          </div>

          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>{t('teacher1.kelas.scheduleCourse')}</Label>
              <Input value={title} disabled className="opacity-70" />
            </div>
            <div className="space-y-1.5">
              <Label>{t('teacher1.kelas.scheduleDay')}</Label>
              <select
                className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-on-surface focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
                value={String(scheduleForm.day_of_week)}
                onChange={(e) => setScheduleForm({ ...scheduleForm, day_of_week: parseInt(e.target.value) || 1 })}
              >
                {DAY_KEYS.map((k, i) => (
                  <option key={i} value={i}>{t(k)}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label required>{t('teacher1.kelas.scheduleTime')}</Label>
              <Input type="time" value={scheduleForm.start_time} onChange={(e) => setScheduleForm({ ...scheduleForm, start_time: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>{t('teacher1.kelas.scheduleDuration')}</Label>
              <Input
                type="number"
                min={15}
                step={15}
                value={scheduleForm.duration_minutes}
                onChange={(e) => setScheduleForm({ ...scheduleForm, duration_minutes: parseInt(e.target.value) || 60 })}
              />
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-4 mt-4 border-t border-border">
            <Button variant="outline" onClick={() => setShowScheduleModal(false)}>{t('teacher1.kelas.cancel')}</Button>
            <Button onClick={handleCreateSchedule} loading={savingSchedule} disabled={!scheduleForm.start_time}>
              <Plus className="mr-1.5 h-4 w-4" /> {t('teacher1.kelas.createSchedule')}
            </Button>
          </div>
        </div>
      </ModalOverlay>

      {/* ═══ Session Modal ═══ */}
      <ModalOverlay open={showSessionModal} onClose={() => setShowSessionModal(false)}>
        <div className="p-6">
          <div className="flex items-center justify-between mb-5">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-500/15 to-teal-500/15">
                <Video className="h-5 w-5 text-emerald-400" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-on-surface">{t('teacher1.kelas.sessionModalTitle')}</h2>
                <p className="text-xs text-on-surface-variant">{t('teacher1.kelas.sessionModalSub')}</p>
              </div>
            </div>
            <button onClick={() => setShowSessionModal(false)} className="text-muted hover:text-on-surface transition-colors p-1 rounded-lg hover:bg-surface-container-highest">
              <X className="h-5 w-5" />
            </button>
          </div>

          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>{t('teacher1.kelas.sessionCourse')}</Label>
              <Input value={title} disabled className="opacity-70" />
            </div>
            <div className="space-y-1.5">
              <Label>{t('teacher1.kelas.sessionTitle')}</Label>
              <Input
                value={sessionForm.title}
                onChange={(e) => setSessionForm({ ...sessionForm, title: e.target.value })}
                placeholder={t('teacher1.kelas.sessionTitlePlaceholder')}
              />
            </div>
            <div className="space-y-1.5">
              <Label>{t('teacher1.kelas.sessionPlatform')}</Label>
              <select
                className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-on-surface focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
                value={sessionForm.provider}
                onChange={(e) => setSessionForm({ ...sessionForm, provider: e.target.value })}
              >
                <option value="Zoom">Zoom</option>
                <option value="Google Meet">Google Meet</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <Label required>{t('teacher1.kelas.sessionLink')}</Label>
              <Input value={sessionForm.meeting_link} onChange={(e) => setSessionForm({ ...sessionForm, meeting_link: e.target.value })} placeholder="https://zoom.us/j/..." />
            </div>
            <div className="space-y-1.5">
              <Label required>{t('teacher1.kelas.sessionDateTime')}</Label>
              <Input type="datetime-local" value={sessionForm.starts_at} onChange={(e) => setSessionForm({ ...sessionForm, starts_at: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>{t('teacher1.kelas.sessionDuration')}</Label>
              <Input
                type="number"
                min={15}
                step={5}
                value={sessionForm.duration_minutes}
                onChange={(e) => setSessionForm({ ...sessionForm, duration_minutes: parseInt(e.target.value) || 60 })}
              />
            </div>
          </div>

          {sessionError && (
            <p className="mt-3 text-sm font-medium text-red-400">{sessionError}</p>
          )}

          <div className="flex justify-end gap-2 pt-4 mt-4 border-t border-border">
            <Button variant="outline" onClick={() => setShowSessionModal(false)}>{t('teacher1.kelas.cancel')}</Button>
            <Button onClick={handleCreateSession} loading={savingSession} disabled={!sessionForm.meeting_link.trim() || !sessionForm.starts_at}>
              <Plus className="mr-1.5 h-4 w-4" /> {t('teacher1.kelas.createSession')}
            </Button>
          </div>
        </div>
      </ModalOverlay>
    </DashboardLayout>
  )
}
