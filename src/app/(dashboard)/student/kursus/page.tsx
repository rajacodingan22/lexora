'use client'

import { Suspense, useEffect, useState } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import {
  BookOpen, Play, Calendar, BookX, CheckCircle2,
  Search, GraduationCap, Loader2, Sparkles, Users,
  Globe, Clock, Activity, CalendarClock, ArrowRight, X, Video, FileText, ExternalLink, Link2
} from 'lucide-react'
import Link from 'next/link'
import { motion, AnimatePresence } from 'framer-motion'
import { createClient } from '@/lib/supabase-client'
import { useAuth } from '@/lib/auth-context'
import { useI18n } from '@/lib/i18n/client'
import { cn, buildTeacherIdByCourse, filterByTeacher, isMeetingLinkOpen, minutesUntilJoinable } from '@/lib/utils'
import { Flag } from '@/components/ui/flag'
import type { Course, Enrollment, GradeAggregate, LiveSession, User, Language } from '@/types'
import { normalizeTier, trackLabelKey } from '@/lib/course-catalog'

const containerVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.08 } },
}

const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: { type: 'spring' as const, stiffness: 100, damping: 15 } },
}

const statVariants = {
  hidden: { opacity: 0, scale: 0.9 },
  visible: (i: number) => ({
    opacity: 1, scale: 1,
    transition: { delay: i * 0.1, type: 'spring' as const, stiffness: 100, damping: 12 },
  }),
}

const LOCALE_MAP: Record<string, string> = { en: 'en-US', id: 'id-ID', zh: 'zh-CN' }

const LEVEL_BADGE: Record<string, string> = {
  basic: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
  advance: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
  expert: 'bg-purple-500/20 text-purple-400 border-purple-500/30',
}

export default function StudentCoursesPage() {
  return (
    <Suspense fallback={<CoursesSkeleton />}>
      <StudentCoursesContent />
    </Suspense>
  )
}

interface EnrichedEnrollment extends Enrollment {
  course: Course & { teacher?: User }
  grade?: GradeAggregate
  batch?: { id: string; name: string; code: string } | null
}

interface CourseWithNextSession {
  enrollment: EnrichedEnrollment
  nextSession: LiveSession | null
}

interface ExploreClass {
  id: string
  title: { id: string; en: string }
  description: { id: string; en: string } | null
  image_url: string | null
  price: number
  meeting_count: number
  project_count: number
  is_try_class: boolean
  starts_at: string | null
  min_students: number
  max_students: number
  mode: string
  language_code: string
  level_code: string
  level_name: string
  tier?: string | null
  track_type?: string | null
  teachers: User[]
  batches: { id: string; name: string; code: string; start_date: string; capacity: number; current_students: number; status: string }[]
}

function formatPrice(n: number, t: (key: string, params?: Record<string, string | number>) => string): string {
  if (n <= 0) return t('student1.kursus.gratis')
  return 'Rp ' + new Intl.NumberFormat('id-ID').format(n)
}

function nextBatchLabel(batches: ExploreClass['batches'], t: (key: string, params?: Record<string, string | number>) => string): { label: string; full: boolean } {
  const future = batches
    .filter((b) => new Date(b.start_date).getTime() > Date.now() && b.current_students < b.capacity)
    .sort((a, b) => new Date(a.start_date).getTime() - new Date(b.start_date).getTime())
  if (future.length === 0) {
    return { label: t('student1.kursus.waitingNextBatch'), full: true }
  }
  const b = future[0]
  const sisa = b.capacity - b.current_students
  const batchLabel = b.name ? (b.name.toLowerCase().includes('batch') ? b.name : t('student1.kursus.batchLabel', { name: b.name })) : t('student1.kursus.batchFallback')
  return { label: t('student1.kursus.slotsLeft', { batch: batchLabel, count: sisa }), full: false }
}

function StudentCoursesContent() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const { user, loading: authLoading } = useAuth()
  const { t, lang } = useI18n()
  const supabase = createClient()
  const locale = LOCALE_MAP[lang] || 'en-US'

  const initialTab = searchParams.get('tab') === 'jelajahi' || searchParams.get('tab') === 'cari' ? 'cari' : 'saya'
  const requestedTier = normalizeTier(searchParams.get('level_code'))
  const [activeTab, setActiveTab] = useState(initialTab)

  const [courses, setCourses] = useState<CourseWithNextSession[]>([])
  const [loading, setLoading] = useState(true)
  const [waitingList, setWaitingList] = useState<any[]>([])

  const [languages, setLanguages] = useState<Language[]>([])

  const [placementResult, setPlacementResult] = useState<{ provisional_level: string; test_id: string; language_code?: string } | null>(null)
  const [placementLoading, setPlacementLoading] = useState(true)

  const [exploreClasses, setExploreClasses] = useState<ExploreClass[]>([])
  const [exploreLoading, setExploreLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [languageFilter, setLanguageFilter] = useState('')
  const [enrolledCourseIds, setEnrolledCourseIds] = useState<Set<string>>(new Set())
  const [enrollingId, setEnrollingId] = useState<string | null>(null)
  const [successToast, setSuccessToast] = useState<{ courseTitle: string; programName: string; batchName: string } | null>(null)
  const [previewCourse, setPreviewCourse] = useState<ExploreClass | null>(null)
  const [previewSessions, setPreviewSessions] = useState<{ id: string; title: string; starts_at: string; meeting_link: string | null }[]>([])
  const [previewProjects, setPreviewProjects] = useState<{ id: string; title: string; due_date: string | null }[]>([])
  const [previewLoading, setPreviewLoading] = useState(false)

  async function fetchEnrolledCourses() {
    setLoading(true)
    try {
      const { data: enrollments, error } = await supabase
        .from('enrollments')
        .select(`
          *,
          course:courses(*),
          grade:grade_aggregates(*),
          batch:batches(id, name, code)
        `)
        .eq('user_id', user!.id)
        .order('enrolled_at', { ascending: false })

      if (error) throw error

      const enriched = (enrollments || []) as unknown as EnrichedEnrollment[]

      const courseIds = enriched.map(e => e.course_id).filter(Boolean)

      const { data: courseTeachers } = await supabase
        .from('course_teachers')
        .select('course_id, teacher:teachers(id, user:users!inner(*))')
        .in('course_id', courseIds)

      const teachersByCourse: Record<string, any[]> = {}
      for (const ct of (courseTeachers || []) as any[]) {
        if (!teachersByCourse[ct.course_id]) teachersByCourse[ct.course_id] = []
        teachersByCourse[ct.course_id].push(ct.teacher)
      }

      const teacherMap: Record<string, any> = {}
      for (const enr of enriched) {
        const list = teachersByCourse[enr.course_id] || []
        const enrolledT = list.find((t: any) => t?.id === enr.teacher_id)
        teacherMap[enr.course_id] = enrolledT?.user || list[0]?.user || null
      }

      const enrichedWithTeachers = enriched.map(enr => ({
        ...enr,
        course: { ...enr.course, teacher: teacherMap[enr.course_id] || null },
      }))

      const sessionMap: Record<string, LiveSession> = {}

      if (courseIds.length > 0) {
        const now = new Date().toISOString()
        const { data: sessions } = await supabase
          .from('live_sessions')
          .select('*')
          .in('course_id', courseIds)
          .gte('starts_at', now)
          .order('starts_at', { ascending: true })

        if (sessions) {
          for (const session of filterByTeacher(sessions as LiveSession[], buildTeacherIdByCourse(enriched))) {
            if (!sessionMap[session.course_id]) {
              sessionMap[session.course_id] = session
            }
          }
        }
      }

      setCourses(
        enrichedWithTeachers.map(enr => ({
          enrollment: enr,
          nextSession: sessionMap[enr.course_id] || null,
        }))
      )
    } catch (err) {
      console.error('Failed to fetch courses', err)
    } finally {
      setLoading(false)
    }
  }

  async function fetchPlacementResult() {
    try {
      const stored = localStorage.getItem('placement_result')
      if (stored) {
        try {
          const parsed = JSON.parse(stored)
          setPlacementResult(parsed)
        } catch { }
      }

      const { data } = await supabase
        .from('placement_results')
        .select('provisional_level, test_id, test:test_id(language_code)')
        .eq('user_id', user!.id)
        .order('completed_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (data) {
        const enriched = {
          provisional_level: (data as any).provisional_level,
          test_id: (data as any).test_id,
          language_code: (data as any).test?.language_code,
        }
        setPlacementResult(enriched)
        localStorage.setItem('placement_result', JSON.stringify(enriched))
      }
    } catch (err) {
      console.error('Failed to fetch placement result', err)
    } finally {
      setPlacementLoading(false)
    }
  }

  async function fetchExploreClasses() {
    setExploreLoading(true)
    try {
      const [langRes, courseRes] = await Promise.all([
        supabase.from('languages').select('*').eq('is_active', true).order('sort_order'),
        supabase
          .from('courses')
          .select(`
            id, title, description, image_url, price, meeting_count, project_count, is_try_class,
            starts_at, min_students, max_students, mode, language_code, tier, track_type,
            level:level_id(code, name, tier),
            program:program_id(tier, track_type, program_type),
            teacher_assignments:course_teachers(
              teacher:teachers(
                user:users(id, display_name, photo_url)
              )
            )
          `)
          .eq('status', 'active')
          .eq('is_visible_marketplace', true)
          .order('is_try_class', { ascending: false })
          .order('starts_at', { ascending: true }),
      ])

      if (langRes.data) setLanguages(langRes.data as Language[])

      const courseIds = (courseRes.data || []).map((c: any) => c.id)
      const batchRes = courseIds.length
        ? await supabase
            .from('batches')
            .select('id, course_id, name, code, start_date, capacity, current_students, status')
            .eq('status', 'active')
            .in('course_id', courseIds)
            .order('start_date', { ascending: true })
        : { data: [] }

      const cards: ExploreClass[] = (courseRes.data || []).map((c: any) => ({
        id: c.id,
        title: c.title || { id: 'Kelas', en: 'Class' },
        description: c.description,
        image_url: c.image_url,
        price: Number(c.price) || 0,
        meeting_count: c.meeting_count ?? 0,
        project_count: c.project_count ?? 0,
        is_try_class: !!c.is_try_class,
        starts_at: c.starts_at,
        min_students: c.min_students ?? 10,
        max_students: c.max_students ?? 30,
        mode: c.mode,
        language_code: c.language_code,
        level_code: c.level?.tier || c.level?.code || '',
        level_name: c.level?.name?.id || c.level?.name?.en || '',
        tier: c.tier || c.level?.tier || c.level?.code || null,
        track_type: c.track_type || c.program?.track_type || c.program?.program_type || 'regular',
        teachers: (c.teacher_assignments || [])
          .map((t: any) => t.teacher?.user)
          .filter(Boolean)
          .map((u: any) => ({ id: u.id, display_name: u.display_name || t('student1.kursus.teacherFallback'), photo_url: u.photo_url })),
        batches: (batchRes.data || []).filter((b: any) => b.course_id === c.id),
      }))
      setExploreClasses(cards)
      setEnrolledCourseIds(new Set(
        ((await supabase
          .from('enrollments')
          .select('course_id')
          .eq('user_id', user!.id)
          .in('status', ['active', 'pending'])) as any).data?.map((e: any) => e.course_id) || []
      ))
    } catch (err) {
      console.error('Failed to fetch explore classes', err)
    } finally {
      setExploreLoading(false)
    }
  }

  async function fetchWaitingList() {
    try {
      const { data } = await supabase
        .from('waiting_list')
        .select('*, course:courses(id, title, is_try_class)')
        .eq('user_id', user!.id)
        .eq('status', 'waiting')
        .order('created_at', { ascending: false })
      if (data) setWaitingList(data)
    } catch (err) {
      console.error('Failed to fetch waiting list', err)
    }
  }

  useEffect(() => {
    if (authLoading || !user) return
    fetchEnrolledCourses()
    fetchPlacementResult()
    fetchExploreClasses()
    fetchWaitingList()
  }, [authLoading, user])

  useEffect(() => {
    if (!user) return
    const channel = supabase
      .channel('kursus-batch-slots')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'batches' },
        () => {
          fetchExploreClasses()
        }
      )
      .subscribe()
    return () => {
      supabase.removeChannel(channel)
    }
  }, [user])

  const filteredClasses = exploreClasses.filter((c) => {
    if (languageFilter && c.language_code !== languageFilter) return false
    if (requestedTier && normalizeTier(c.tier || c.level_code) !== requestedTier) return false
    if (search.trim()) {
      const q = search.toLowerCase()
      const title = c.title?.id || c.title?.en || ''
      const teacherMatch = c.teachers.some(t => (t.display_name || '').toLowerCase().includes(q))
      const tierKey = normalizeTier(c.tier || c.level_code)
      const levelMatch = (tierKey ? t(`common.tier.${tierKey}`) : c.level_name || '').toLowerCase().includes(q)
      if (!title.toLowerCase().includes(q) && !teacherMatch && !levelMatch) return false
    }
    return true
  })

  async function openPreview(course: ExploreClass) {
    setPreviewCourse(course)
    setPreviewLoading(true)
    setPreviewSessions([])
    setPreviewProjects([])
    try {
      const [sessRes, projRes] = await Promise.all([
        supabase.from('live_sessions').select('id, title, starts_at, meeting_link').eq('course_id', course.id).order('starts_at', { ascending: true }).limit(20),
        supabase.from('assignments').select('id, title, due_date').eq('course_id', course.id).order('due_date', { ascending: true }).limit(20),
      ])
      setPreviewSessions((sessRes.data as any) || [])
      setPreviewProjects((projRes.data as any) || [])
    } catch (e) {
      console.error('preview fetch', e)
    } finally {
      setPreviewLoading(false)
    }
  }

  async function handleEnroll(courseId: string) {
    if (!user) return
    setEnrollingId(courseId)
    try {
      const res = await fetch('/api/enrollments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ courseId }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || t('student1.kursus.enrollError'))

      const status = json.data?.status
      if (status === 'pending_payment' || status === 'pending') {
        router.push('/student/pembayaran')
        return
      }
      if (status === 'waitlisted') {
        await fetchWaitingList()
        await fetchExploreClasses()
        return
      }

      // Tampilkan toast sukses dengan detail kelas & batch
      const courseTitle = json.data?.course_title || ''
      const programName = json.data?.program_name || ''
      const batchName = json.data?.batch_name || ''
      setSuccessToast({ courseTitle, programName, batchName })
      setTimeout(() => setSuccessToast(null), 6000)

      await Promise.all([fetchEnrolledCourses(), fetchExploreClasses()])
      setPreviewCourse(null)
    } catch (err: any) {
      console.error('Failed to enroll', err)
      alert(err.message || t('student1.kursus.enrollError'))
    } finally {
      setEnrollingId(null)
    }
  }

  const totalEnrolled = courses.length
  const activeEnrollments = courses.filter(c => c.enrollment.status === 'active').length
  const completedEnrollments = courses.filter(c => c.enrollment.status === 'completed').length
  const visibleCourses = courses.filter(c => c.enrollment.status === 'active' || c.enrollment.status === 'pending')

  if (loading || authLoading) {
    return <CoursesSkeleton />
  }

  return (
    <motion.div
      className="space-y-6"
      variants={containerVariants}
      initial="hidden"
      animate="visible"
    >
      <motion.div variants={itemVariants} className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-indigo-500/10 via-indigo-500/5 to-purple-500/10 border border-indigo-500/20 p-6">
        <div className="absolute top-0 right-0 w-64 h-64 bg-gradient-to-bl from-indigo-500/10 to-transparent rounded-full blur-3xl" />
        <div className="relative flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-on-surface">{t('student1.kursus.title')}</h1>
            <p className="text-on-surface-variant mt-1">{t('student1.kursus.subtitle')}</p>
          </div>
          <div className="hidden sm:flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-indigo-600 shadow-lg shadow-indigo-500/20">
            <BookOpen className="h-6 w-6 text-white" />
          </div>
        </div>
      </motion.div>

      {!placementLoading && placementResult && (
        <motion.div variants={itemVariants}>
          <Card className="border-indigo-500/20 bg-gradient-to-r from-indigo-500/5 to-transparent overflow-hidden">
            <CardContent className="flex items-center justify-between p-3 sm:p-4">
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-indigo-500/15">
                  <GraduationCap className="h-5 w-5 text-indigo-400" />
                </div>
                <p className="text-sm text-on-surface-variant">
                  {t('student1.kursus.placementLevel')} <span className="font-semibold text-indigo-400">{t(`common.tier.${normalizeTier(placementResult.provisional_level) || 'unknown'}`)}</span> —
                  <Link href={`/student/kursus?tab=jelajahi&level_code=${normalizeTier(placementResult.provisional_level) || ''}`} className="ml-1 text-indigo-400 hover:text-indigo-300 underline underline-offset-2">
                    {t('student1.kursus.matchingClasses')}
                  </Link>
                </p>
              </div>
              <GraduationCap className="h-5 w-5 text-indigo-400/30 hidden sm:block" />
            </CardContent>
          </Card>
        </motion.div>
      )}

      {/* ═══ Success Toast ═══ */}
      <AnimatePresence>
        {successToast && (
          <motion.div
            initial={{ opacity: 0, y: -30, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -20, scale: 0.95 }}
            transition={{ type: 'spring', stiffness: 200, damping: 20 }}
            className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-emerald-500/15 via-emerald-500/5 to-teal-500/10 border border-emerald-500/30 p-5"
          >
            <div className="absolute top-0 right-0 w-40 h-40 bg-gradient-to-bl from-emerald-500/15 to-transparent rounded-full blur-3xl" />
            <div className="relative flex items-start gap-4">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-500 to-emerald-600 shadow-lg shadow-emerald-500/30">
                <CheckCircle2 className="h-6 w-6 text-white" />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="text-lg font-bold text-emerald-400">
                  🎉 {t('student1.kursus.enrollSuccessTitle')}
                </h3>
                <p className="text-sm text-on-surface-variant mt-1 leading-relaxed">
                  {successToast.programName
                    ? t('student1.kursus.enrollSuccessBodyWithProgram', {
                        course: successToast.courseTitle,
                        program: successToast.programName,
                        batch: successToast.batchName,
                      })
                    : t('student1.kursus.enrollSuccessBody', {
                        course: successToast.courseTitle,
                        batch: successToast.batchName,
                      })
                  }
                </p>
                <p className="text-xs text-emerald-400/80 mt-2 font-medium">
                  {t('student1.kursus.enrollSuccessTip')}
                </p>
              </div>
              <button
                onClick={() => setSuccessToast(null)}
                className="text-muted hover:text-on-surface transition-colors p-1 rounded-lg hover:bg-surface-container-highest"
              >
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            {/* Auto-dismiss progress bar */}
            <div className="absolute bottom-0 left-0 h-0.5 bg-emerald-500/50 animate-shrink" style={{ animationDuration: '6s', width: '100%' }} />
          </motion.div>
        )}
      </AnimatePresence>

      <motion.div variants={itemVariants}>
        <Tabs value={activeTab} onValueChange={(v) => { setActiveTab(v); router.replace(`/student/kursus?tab=${v}`) }}>
          <TabsList>
            <TabsTrigger value="saya">{t('student1.kursus.myCoursesTab', { count: totalEnrolled })}</TabsTrigger>
            <TabsTrigger value="cari">{t('student1.kursus.exploreTab')}</TabsTrigger>
          </TabsList>

          <TabsContent value="saya" className="space-y-4">
            <motion.div
              className="grid gap-4 sm:grid-cols-3"
              variants={containerVariants}
              initial="hidden"
              animate="visible"
            >
              {[
                { label: t('student1.kursus.statTotal'), value: totalEnrolled, icon: BookOpen, color: 'from-indigo-500 to-indigo-600', desc: t('student1.kursus.statTotalDesc') },
                { label: t('student1.kursus.statActive'), value: activeEnrollments, icon: Activity, color: 'from-emerald-500 to-emerald-600', desc: t('student1.kursus.statActiveDesc') },
                { label: t('student1.kursus.statCompleted'), value: completedEnrollments, icon: CheckCircle2, color: 'from-violet-500 to-violet-600', desc: t('student1.kursus.statCompletedDesc') },
              ].map((stat, i) => (
                <motion.div key={stat.label} custom={i} variants={statVariants}>
                  <Card className="group hover:shadow-lg hover:shadow-indigo-500/5 transition-all duration-300">
                    <CardContent className="flex items-center gap-4 p-4">
                      <div className={'rounded-xl bg-gradient-to-br ' + stat.color + ' p-3 shadow-lg transition-all duration-300 group-hover:scale-110 group-hover:rotate-3'}>
                        <stat.icon className="h-5 w-5 text-white" />
                      </div>
                      <div>
                        <p className="text-xs text-on-surface-variant">{stat.label}</p>
                        <p className="text-2xl font-bold text-on-surface">{stat.value}</p>
                        <p className="text-[10px] text-muted mt-0.5">{stat.desc}</p>
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>
              ))}
            </motion.div>

            {waitingList.length > 0 && (
              <motion.div variants={itemVariants} className="space-y-3">
                {waitingList.map((w) => {
                  const courseTitle = (w.course?.title?.en || w.course?.title?.id || w.course?.title || 'Kelas') as string
                  return (
                    <Card key={w.id} className="border-amber-500/30 bg-amber-500/5 overflow-hidden">
                      <CardContent className="flex flex-col sm:flex-row sm:items-center gap-3 p-4">
                        <div className="flex items-start gap-3 flex-1">
                          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-500/15">
                            <Clock className="h-5 w-5 text-amber-400" />
                          </div>
                          <div>
                            <p className="text-sm font-semibold text-on-surface">{t('student1.kursus.waitingTitle')}</p>
                            <p className="text-sm text-on-surface-variant mt-0.5">
                              {t('student1.kursus.waitingCourse', { course: courseTitle })}
                            </p>
                            <p className="text-xs text-on-surface-variant mt-0.5">{t('student1.kursus.waitingAlert')}</p>
                          </div>
                        </div>
                        <Button variant="outline" size="sm" onClick={() => setActiveTab('cari')} className="shrink-0">
                          {t('student1.kursus.viewOtherClasses')} <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
                        </Button>
                      </CardContent>
                    </Card>
                  )
                })}
              </motion.div>
            )}

            <AnimatePresence mode="wait">
              {visibleCourses.length === 0 ? (
                <motion.div
                  key="empty"
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -20 }}
                >
                  <Card>
                    <CardContent className="flex flex-col items-center justify-center py-16 text-center">
                      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500/10 to-purple-500/10 mb-4 ring-1 ring-indigo-500/20">
                        <BookX className="h-8 w-8 text-indigo-400" />
                      </div>
                      <h3 className="text-lg font-semibold text-on-surface mb-1">{t('student1.kursus.noCourses')}</h3>
                      <p className="text-sm text-on-surface-variant mb-6 max-w-sm">{t('student1.kursus.noCoursesDesc')}</p>
                      <Button onClick={() => setActiveTab('cari')} className="shadow-lg shadow-indigo-500/20">
                        <BookOpen className="mr-2 h-4 w-4" /> {t('student1.kursus.exploreTab')}
                      </Button>
                    </CardContent>
                  </Card>
                </motion.div>
              ) : (
                <motion.div
                  key="list"
                  className="grid gap-4 md:grid-cols-2"
                  variants={containerVariants}
                  initial="hidden"
                  animate="visible"
                >
                  {visibleCourses.map(({ enrollment, nextSession }, i) => {
                    const course = enrollment.course
                    const title = course?.title?.en || course?.title?.id || 'Untitled Course'
                    const teacherName = course?.teacher?.display_name || t('student1.kursus.teacherFallback')
                    const progress = enrollment.grade?.weighted_total || 0
                    const levelKey = normalizeTier(course?.tier || course?.level?.tier || course?.level?.code)
                    const levelLabel = levelKey ? t(`common.tier.${levelKey}`) : t('student1.kursus.allLevels')
                    const levelBadgeClass = LEVEL_BADGE[levelKey || ''] || 'bg-surface-container-high text-on-surface-variant'
                    const nextClassDate = nextSession
                      ? new Date(nextSession.starts_at).toLocaleDateString(locale, {
                          weekday: 'short',
                          month: 'short',
                          day: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                        })
                      : null

                    return (
                      <motion.div key={enrollment.id} variants={itemVariants} custom={i}>
                        <Card className="group transition-all duration-300 hover:border-indigo-500/30 hover:shadow-xl hover:shadow-indigo-500/5 overflow-hidden">
                          <div className="h-1.5 bg-gradient-to-r from-indigo-500 via-indigo-400 to-indigo-500" style={{ width: `${Math.min(progress, 100)}%` }} />
                          <CardContent className="p-5">
                            <div className="flex items-start justify-between mb-2">
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 mb-1">
                                  {course?.language?.flag_emoji ? <Flag emoji={course.language.flag_emoji} className="h-4 w-auto" /> : null}
                                  <h3 className="font-semibold text-on-surface truncate group-hover:text-indigo-400 transition-colors">{title}</h3>
                                </div>
                                <p className="text-sm text-on-surface-variant flex items-center gap-1.5">
                                  <Users className="h-3 w-3" /> {teacherName}
                                </p>
                              </div>
                              <Badge variant={progress >= 80 ? 'success' : progress >= 50 ? 'warning' : 'default'}>
                                {Math.round(progress)}%
                              </Badge>
                            </div>

                            <div className="flex flex-wrap items-center gap-1.5 mt-2">
                              <span className={cn('inline-flex items-center rounded-full px-2.5 py-0.5 text-[10px] font-semibold border', levelBadgeClass)}>
                                {levelLabel}
                              </span>
                              {enrollment.batch?.name && (
                                <Badge variant="outline" size="sm" className="text-[10px] gap-1">
                                  <CalendarClock className="h-3 w-3" /> {t('student1.kursus.batchLabel', { name: enrollment.batch.name })}
                                </Badge>
                              )}
                              <Badge variant="outline" size="sm" className="text-[10px]">{t('student1.kursus.meetingCount', { count: course?.meeting_count ?? 0 })}</Badge>
                              <Badge variant="outline" size="sm" className="text-[10px]">{t('student1.kursus.projectCount', { count: course?.project_count ?? 0 })}</Badge>
                            </div>

                            <div className="h-2 rounded-full bg-surface-container-highest overflow-hidden mt-4 mb-4">
                              <div
                                className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-indigo-400 transition-all duration-1000"
                                style={{ width: Math.min(progress, 100) + '%' }}
                              />
                            </div>

                            <div className="flex items-center justify-between">
                              <span className="flex items-center gap-1.5 text-xs text-muted">
                                {nextClassDate ? (
                                  <><Calendar className="h-3.5 w-3.5 text-indigo-400" />{nextClassDate}</>
                                ) : (
                                  <><Clock className="h-3.5 w-3.5" />{t('student1.kursus.noSchedule')}</>
                                )}
                              </span>
                              <Link href={'/student/kursus/' + enrollment.course_id}>
                                <Button size="sm" className="shadow-md group-hover:shadow-indigo-500/20 transition-all">
                                  <Play className="mr-1 h-3.5 w-3.5" /> {t('student1.kursus.enterClass')}
                                </Button>
                              </Link>
                            </div>
                          </CardContent>
                        </Card>
                      </motion.div>
                    )
                  })}
                </motion.div>
              )}
            </AnimatePresence>
          </TabsContent>

          <TabsContent value="cari" className="space-y-4">
            <motion.div
              className="space-y-4"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
            >
              <div>
                <h2 className="text-lg font-semibold text-on-surface">{t('student1.kursus.exploreTab')}</h2>
                <p className="text-sm text-on-surface-variant">
                  {t('student1.kursus.exploreDesc')}
                </p>
              </div>

              <div className="flex flex-col sm:flex-row gap-3">
                <div className="flex-1">
                  <Input
                    placeholder={t('student1.kursus.searchPlaceholder')}
                    icon={<Search className="h-4 w-4" />}
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                </div>
                <div className="w-full sm:w-48">
                  <Select value={languageFilter} onChange={(e) => setLanguageFilter(e.target.value)}>
                    <option value="">{t('student1.kursus.allLanguages')}</option>
                    {languages.map((l) => (
                      <option key={l.code} value={l.code}>
                        {l.flag_emoji} {l.name?.id || l.name?.en || l.code}
                      </option>
                    ))}
                  </Select>
                </div>
              </div>

              {exploreLoading ? (
                <div className="flex items-center justify-center py-20">
                  <div className="flex flex-col items-center gap-3">
                    <Loader2 className="h-8 w-8 text-indigo-400 animate-spin" />
                    <p className="text-sm text-muted">{t('student1.kursus.loadingClasses')}</p>
                  </div>
                </div>
              ) : filteredClasses.length === 0 ? (
                <Card>
                  <CardContent className="flex flex-col items-center justify-center py-16 text-center">
                    <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500/10 to-purple-500/10 mb-4 ring-1 ring-indigo-500/20">
                      <BookX className="h-8 w-8 text-indigo-400" />
                    </div>
                    <h3 className="text-lg font-semibold text-on-surface mb-1">{t('student1.kursus.noClasses')}</h3>
                    <p className="text-sm text-on-surface-variant mb-2 max-w-sm">
                      {t('student1.kursus.noClassesDesc')}
                    </p>
                  </CardContent>
                </Card>
              ) : (
                <motion.div
                  className="grid gap-4 md:grid-cols-2"
                  variants={containerVariants}
                  initial="hidden"
                  animate="visible"
                >
                  {filteredClasses.map((course, i) => {
                    const title = course.title?.id || course.title?.en || 'Untitled Course'
                    const desc = course.description?.id || course.description?.en || ''
                    const levelKey = normalizeTier(course.tier || course.level_code)
                    const levelLabel = levelKey ? t(`common.tier.${levelKey}`) : course.level_name || t('student1.kursus.allLevels')
                    const levelBadgeClass = LEVEL_BADGE[levelKey || ''] || 'bg-surface-container-high text-on-surface-variant'
                    const lang = languages.find(l => l.code === course.language_code)
                    const nb = nextBatchLabel(course.batches, t)
                    const isEnrolled = enrolledCourseIds.has(course.id)
                    const teacherNames = course.teachers.map(t => t.display_name).filter(Boolean).join(', ') || t('student1.kursus.teacherFallback')
                    const trialBadge = course.is_try_class
                    const hasPlacementForCourseLang = !!placementResult && placementResult.language_code === course.language_code
                    const isPlacementMatch = hasPlacementForCourseLang &&
                      normalizeTier(course.tier || course.level_code) === normalizeTier(placementResult.provisional_level)
                    const levelBlocked = !course.is_try_class && hasPlacementForCourseLang && !isPlacementMatch

                    return (
                      <motion.div key={course.id} variants={itemVariants} custom={i}>
                        <Card onClick={() => openPreview(course)} className="group cursor-pointer transition-all duration-300 hover:border-indigo-500/30 hover:shadow-xl hover:shadow-indigo-500/5 flex flex-col overflow-hidden">
                          <div className="relative h-28 shrink-0 overflow-hidden">
                            {course.image_url ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img
                                src={course.image_url}
                                alt={title}
                                className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                              />
                            ) : (
                              <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-indigo-500/15 via-purple-500/10 to-emerald-500/10">
                                {lang?.flag_emoji ? (
                                  <Flag emoji={lang.flag_emoji} className="h-12 w-auto" />
                                ) : (
                                  <Globe className="h-8 w-8 text-indigo-400/50" />
                                )}
                              </div>
                            )}
                            <div className="absolute inset-0 bg-gradient-to-t from-surface via-surface/10 to-transparent" />
                            {trialBadge && (
                              <span className="absolute left-3 top-3 inline-flex items-center gap-1 rounded-full bg-emerald-500 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white shadow-md">
                                <Sparkles className="h-3 w-3" /> {t('student1.kursus.freeTrial')}
                              </span>
                            )}
                          </div>
                          <CardContent className="p-5 flex flex-col flex-1">
                            <div className="flex items-start justify-between gap-2 mb-2">
                              <div className="flex-1 min-w-0">
                                <h3 className="font-semibold text-on-surface truncate group-hover:text-indigo-400 transition-colors">{title}</h3>
                                <p className="text-xs text-on-surface-variant mt-0.5 flex items-center gap-1">
                                  <Users className="h-3 w-3" /> {teacherNames}
                                </p>
                              </div>
                            </div>

                            <div className="flex flex-wrap items-center gap-1.5 mt-1 mb-3">
                              <span className={cn('inline-flex items-center rounded-full px-2.5 py-0.5 text-[10px] font-semibold border', levelBadgeClass)}>
                                {levelLabel}
                              </span>
                              <Badge variant="outline" size="sm" className="text-[10px]">{t('student1.kursus.meetingCount', { count: course.meeting_count })}</Badge>
                              <Badge variant="outline" size="sm" className="text-[10px]">{t('student1.kursus.projectCount', { count: course.project_count })}</Badge>
                              <Badge variant="outline" size="sm" className="text-[10px]">{t(trackLabelKey(course.track_type))}</Badge>
                              <Badge variant="outline" size="sm" className="text-[10px] capitalize">{course.mode === 'online' ? t('student1.kursus.modeOnline') : course.mode === 'offline' ? t('student1.kursus.modeOffline') : course.mode}</Badge>
                            </div>

                            <div className="flex items-center gap-2 text-xs text-on-surface-variant mb-2">
                              <Users className={cn('h-3.5 w-3.5 shrink-0', nb.full ? 'text-orange-400' : 'text-indigo-400')} />
                              <span className={nb.full ? 'text-orange-400' : ''}>{nb.label}</span>
                            </div>

                            {desc && (
                              <p className="text-sm text-on-surface-variant line-clamp-2 mb-3 flex-1 leading-relaxed">{desc}</p>
                            )}

                            <div className="mt-auto pt-2 border-t border-border/60 flex items-center justify-between gap-3">
                              <div>
                                <p className={cn('text-sm font-bold', course.is_try_class ? 'text-emerald-400' : 'text-on-surface')}>
                                  {formatPrice(course.price, t)}
                                </p>
                                <p className="text-[10px] text-muted">{t('student1.kursus.minMaxStudents', { min: course.min_students, max: course.max_students })}</p>
                              </div>
                              {isEnrolled ? (
                                <Link href={`/student/kursus/${course.id}`} onClick={(e) => e.stopPropagation()}>
                                  <Button size="sm" variant="outline" className="shrink-0">
                                    <CheckCircle2 className="h-3.5 w-3.5 mr-1 text-emerald-500" /> {t('student1.kursus.alreadyEnrolled')}
                                  </Button>
                                </Link>
                              ) : (
                                <Button
                                  size="sm"
                                  className="shrink-0 shadow-md"
                                  onClick={(e) => { e.stopPropagation(); handleEnroll(course.id) }}
                                  disabled={enrollingId === course.id || levelBlocked}
                                  title={levelBlocked ? t('student1.courseDetail.enrollLevelBlocked') : undefined}
                                >
                                  {enrollingId === course.id ? (
                                    <Loader2 className="h-4 w-4 animate-spin mr-1.5" />
                                  ) : (
                                    <BookOpen className="mr-1.5 h-3.5 w-3.5" />
                                  )}
                                  {enrollingId === course.id ? t('student1.kursus.enrolling') : course.is_try_class ? t('student1.kursus.claimTrial') : t('student1.kursus.enrollPay')}
                                </Button>
                              )}
                            </div>
                          </CardContent>
                        </Card>
                      </motion.div>
                    )
                  })}
                </motion.div>
              )}
            </motion.div>
          </TabsContent>
        </Tabs>
      </motion.div>

      {/* Center preview modal — click block course → detail di tengah layar */}
      <AnimatePresence>
        {previewCourse && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
            onClick={() => setPreviewCourse(null)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              transition={{ duration: 0.18 }}
              className="w-full max-w-2xl max-h-[85vh] overflow-y-auto rounded-2xl border border-border bg-surface shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-border bg-surface/95 backdrop-blur p-4">
                <div className="min-w-0">
                  <h3 className="font-semibold text-on-surface truncate">{previewCourse.title?.id || previewCourse.title?.en || 'Course'}</h3>
                  <p className="text-xs text-muted truncate">{previewCourse.teachers.map(t=>t.display_name).join(', ') || t('student1.kursus.teacherFallback')} • {previewCourse.meeting_count} {t('student1.kursus.meetingCount', { count: previewCourse.meeting_count }).split(' ')[1] || 'meetings'} • {previewCourse.project_count} projects</p>
                </div>
                <Button variant="ghost" size="sm" onClick={() => setPreviewCourse(null)} className="shrink-0"><X className="h-4 w-4" /></Button>
              </div>
              <div className="p-5 space-y-4">
                {previewCourse.description?.id || previewCourse.description?.en ? (
                  <p className="text-sm text-on-surface-variant leading-relaxed line-clamp-3">{previewCourse.description?.id || previewCourse.description?.en}</p>
                ) : null}
                <div className="flex flex-wrap gap-1.5">
                  <Badge variant="outline" className="text-[11px]">{previewCourse.is_try_class ? t('student1.kursus.freeTrial') : formatPrice(previewCourse.price, t)}</Badge>
                  <Badge variant="outline" className="text-[11px]">{(previewCourse.tier || previewCourse.level_code) ? t(`common.tier.${normalizeTier(previewCourse.tier || previewCourse.level_code) || ''}`) : ''}</Badge>
                  <Badge variant="outline" className="text-[11px]">{t(trackLabelKey(previewCourse.track_type))}</Badge>
                </div>
                {previewLoading ? (
                  <div className="flex items-center gap-2 py-6 text-sm text-muted"><Loader2 className="h-4 w-4 animate-spin" /> Loading...</div>
                ) : (
                  <>
                    <div className="rounded-xl border border-border bg-surface-container-low p-3">
                      <p className="text-xs font-semibold text-on-surface flex items-center gap-1.5"><Video className="h-3.5 w-3.5 text-indigo-400" /> {t('student1.courseDetail.meetingScheduleTitle')} <span className="ml-auto text-[10px] px-1.5 py-0.5 rounded-full bg-surface-container-highest text-muted">{previewSessions.length || previewCourse.meeting_count}</span></p>
                      <p className="text-[11px] text-muted mt-0.5">{t('student1.courseDetail.dateFormatHint')}</p>
                      {previewSessions.length > 0 ? (
                        <div className="mt-2 divide-y divide-border">
                          {previewSessions.map(s => {
                            const d = s.starts_at ? new Date(s.starts_at).toLocaleDateString(locale, { day: 'numeric', month: 'long', year: 'numeric' }) : t('student1.courseDetail.scheduleEmpty')
                            const isPreviewEnrolled = enrolledCourseIds.has(previewCourse.id)
                            const joinable = isPreviewEnrolled && !!(s as any).starts_at && isMeetingLinkOpen({ starts_at: (s as any).starts_at, duration_minutes: 60, status: 'scheduled' } as any)
                            const mins = !joinable && (s as any).starts_at ? minutesUntilJoinable({ starts_at: (s as any).starts_at, duration_minutes: 60 } as any) : 0
                            return (
                              <div key={s.id} className="flex items-center justify-between gap-3 py-2">
                                <div className="min-w-0">
                                  <p className="text-sm font-medium text-on-surface truncate">{s.title}</p>
                                  <p className="text-xs text-muted flex items-center gap-1"><Calendar className="h-3 w-3" />{d}</p>
                                </div>
                                {s.meeting_link ? (
                                  joinable ? <a href={s.meeting_link} target="_blank" rel="noopener noreferrer" className="shrink-0 inline-flex items-center gap-1 text-xs font-medium text-emerald-400 hover:underline"><ExternalLink className="h-3 w-3" /> Zoom</a>
                                  : isPreviewEnrolled && mins > 0 ? <span className="shrink-0 inline-flex items-center gap-1 text-xs text-amber-400"><Clock className="h-3 w-3" />{mins}m lagi</span>
                                  : isPreviewEnrolled ? <span className="shrink-0 text-xs text-muted">Belum waktunya</span>
                                  : <span className="shrink-0 text-xs text-muted flex items-center gap-1"><Link2 className="h-3 w-3" /> Zoom</span>
                                ) : <span className="shrink-0 text-xs text-muted">—</span>}
                              </div>
                            )
                          })}
                        </div>
                      ) : (
                        <p className="text-sm text-muted mt-2">{t('student1.courseDetail.noMeetingSchedule')}</p>
                      )}
                    </div>
                    <div className="rounded-xl border border-border bg-surface-container-low p-3">
                      <p className="text-xs font-semibold text-on-surface flex items-center gap-1.5"><FileText className="h-3.5 w-3.5 text-amber-400" /> {t('student1.courseDetail.projectScheduleTitle')} <span className="ml-auto text-[10px] px-1.5 py-0.5 rounded-full bg-surface-container-highest text-muted">{previewProjects.length || previewCourse.project_count}</span></p>
                      {previewProjects.length > 0 ? (
                        <div className="mt-2 divide-y divide-border">
                          {previewProjects.map(p => {
                            const d = (p as any).due_date ? new Date((p as any).due_date).toLocaleDateString(locale, { day: 'numeric', month: 'long', year: 'numeric' }) : null
                            return (
                              <div key={p.id} className="flex items-center justify-between gap-3 py-2">
                                <p className="text-sm font-medium text-on-surface truncate">{p.title}</p>
                                <span className="shrink-0 text-xs text-muted flex items-center gap-1"><Calendar className="h-3 w-3" />{d || t('student1.courseDetail.scheduleEmpty')}</span>
                              </div>
                            )
                          })}
                        </div>
                      ) : (
                        <p className="text-sm text-muted mt-2">{t('student1.courseDetail.noProjectSchedule')}</p>
                      )}
                    </div>
                  </>
                )}
                <div className="flex gap-2 pt-2">
                  <Link href={`/student/kursus/${previewCourse.id}`} className="flex-1">
                    <Button variant="outline" className="w-full"><BookOpen className="mr-1.5 h-4 w-4" /> Lihat Detail Lengkap</Button>
                  </Link>
                  {!enrolledCourseIds.has(previewCourse.id) ? (
                    <Button className="flex-1" onClick={() => handleEnroll(previewCourse.id)} disabled={enrollingId === previewCourse.id}>
                      {enrollingId === previewCourse.id ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : <BookOpen className="mr-1.5 h-4 w-4" />}
                      {previewCourse.is_try_class ? t('student1.kursus.claimTrial') : t('student1.kursus.enrollPay')}
                    </Button>
                  ) : (
                    <Link href={`/student/kursus/${previewCourse.id}`} className="flex-1"><Button className="w-full" variant="outline"><CheckCircle2 className="mr-1.5 h-4 w-4 text-emerald-500" />{t('student1.kursus.alreadyEnrolled')}</Button></Link>
                  )}
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}

function CoursesSkeleton() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="h-32 rounded-2xl bg-surface-container-high" />
      <div className="h-10 w-64 bg-surface-container-high rounded-lg" />
      <div className="grid gap-4 sm:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="rounded-xl border border-border bg-surface p-4">
            <div className="flex items-center gap-4">
              <div className="h-12 w-12 rounded-xl bg-surface-container-highest" />
              <div className="flex-1">
                <div className="h-3 w-20 bg-surface-container-highest rounded mb-2" />
                <div className="h-6 w-12 bg-surface-container-highest rounded" />
              </div>
            </div>
          </div>
        ))}
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="rounded-xl border border-border bg-surface p-5 overflow-hidden">
            <div className="h-1.5 w-0 bg-surface-container-highest mb-3" />
            <div className="flex items-start justify-between mb-3">
              <div className="flex-1">
                <div className="h-5 w-48 bg-surface-container-highest rounded mb-2" />
                <div className="h-4 w-32 bg-surface-container-highest rounded" />
              </div>
              <div className="h-6 w-14 bg-surface-container-highest rounded" />
            </div>
            <div className="h-2 w-full bg-surface-container-highest rounded mb-4" />
            <div className="flex items-center justify-between">
              <div className="h-4 w-32 bg-surface-container-highest rounded" />
              <div className="h-8 w-24 bg-surface-container-highest rounded" />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
