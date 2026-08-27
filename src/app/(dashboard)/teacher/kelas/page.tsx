'use client'

import { useEffect, useState, useCallback } from 'react'
import { DashboardLayout } from '@/components/layout/dashboard-layout'
import { useAuth } from '@/lib/auth-context'
import { createClient } from '@/lib/supabase-client'
import { useI18n } from '@/lib/i18n/client'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'

import {
  BookOpen, Users, School,
  Video, GraduationCap, Layers,
  Play
} from 'lucide-react'
import Link from 'next/link'
import { motion } from 'framer-motion'
import { cn } from '@/lib/utils'
import { normalizeTier, trackLabelKey, type CourseCatalogDetails } from '@/lib/course-catalog'
import { BatchCountdown } from '@/components/shared/batch-countdown'

interface CourseWithStats {
  id: string
  title: { id: string; en: string }
  description: { id: string; en: string }
  level?: { name?: { id: string; en: string }; code?: string; tier?: string }
  tier?: string | null
  track_type?: string | null
  details?: CourseCatalogDetails | null
  program?: { tier?: string | null; track_type?: string | null; details?: CourseCatalogDetails | null }
  image_url?: string
  student_count: number
  meeting_count: number
  project_count: number
  batch_count: number
  slots_total: number
  slots_used: number
  status: string
  my_batches: { id: string; name: string | null; status: string; capacity: number; current_students: number; start_date: string | null; end_date: string | null; meetings_per_week: number }[]
  sessions_created: number
}

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

function ClassSkeleton() {
  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="rounded-xl border border-border bg-surface overflow-hidden">
          <div className="h-40 bg-surface-container-high animate-pulse" />
          <div className="p-4 space-y-3">
            <div className="h-5 w-3/4 rounded bg-surface-container-high animate-pulse" />
            <div className="h-4 w-full rounded bg-surface-container-high animate-pulse" />
            <div className="h-4 w-1/2 rounded bg-surface-container-high animate-pulse" />
            <div className="flex gap-2 pt-2">
              <div className="h-8 flex-1 rounded-lg bg-surface-container-high animate-pulse" />
              <div className="h-8 flex-1 rounded-lg bg-surface-container-high animate-pulse" />
              <div className="h-8 flex-1 rounded-lg bg-surface-container-high animate-pulse" />
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

export default function TeacherKelasPage() {
  const { user, loading: authLoading } = useAuth()
  const { t } = useI18n()
  const [courses, setCourses] = useState<CourseWithStats[]>([])
  const [loading, setLoading] = useState(true)

  const fetchCourses = useCallback(async () => {
    if (!user) return
    const supabaseLocal = createClient()
    setLoading(true)

    try {
      const { data: myTeacherIds } = await supabaseLocal
        .from('teachers')
        .select('id')
        .eq('user_id', user.id)

      const teacherId = myTeacherIds?.[0]?.id
      if (!teacherId) { setLoading(false); return }

      const { data: myCTs } = await supabaseLocal
        .from('course_teachers')
        .select('course_id')
        .eq('teacher_id', teacherId)

      const myCourseIds = new Set((myCTs || []).map(ct => ct.course_id))

      const { data: allCourses } = await supabaseLocal
        .from('courses')
        .select('*, level:language_levels(name, code, tier), program:programs(tier, track_type, details)')
        .eq('status', 'active')
        .order('created_at', { ascending: false })

      const myCoursesList = (allCourses || []).filter(c => myCourseIds.has(c.id))

      const allCourseIds = (allCourses || []).map((c: any) => c.id)
      const myCourseIdArr = myCoursesList.map((c: any) => c.id)

      const [enrollmentsData, batchesData, myBatchesData, sessionsData] = await Promise.all([
        supabaseLocal.from('enrollments').select('course_id').in('course_id', allCourseIds).eq('status', 'active'),
        supabaseLocal.from('batches').select('course_id, status, capacity, current_students, start_date').in('course_id', allCourseIds),
        supabaseLocal.from('batches').select('id, course_id, name, status, capacity, current_students, start_date, end_date, meetings_per_week').eq('teacher_id', teacherId).order('start_date', { ascending: true }).order('created_at', { ascending: true }),
        supabaseLocal.from('live_sessions').select('course_id').in('course_id', myCourseIdArr).in('status', ['scheduled','ongoing','completed']),
      ])

      const enrollmentCounts: Record<string, number> = {}
      if (enrollmentsData.data) {
        for (const e of enrollmentsData.data) {
          enrollmentCounts[e.course_id] = (enrollmentCounts[e.course_id] || 0) + 1
        }
      }

      const sessionCounts: Record<string, number> = {}
      if (sessionsData.data) {
        for (const s of sessionsData.data) {
          sessionCounts[s.course_id] = (sessionCounts[s.course_id] || 0) + 1
        }
      }

      const batchCounts: Record<string, number> = {}
      const slotTotals: Record<string, number> = {}
      const slotUsed: Record<string, number> = {}
      if (batchesData.data) {
        const now = Date.now()
        for (const b of batchesData.data) {
          if (b.status === 'active' || b.status === 'upcoming') {
            batchCounts[b.course_id] = (batchCounts[b.course_id] || 0) + 1
            const isUpcoming = !b.start_date || new Date(b.start_date).getTime() > now
            const cap = Number(b.capacity) || 0
            const used = Number(b.current_students) || 0
            if (isUpcoming && cap > 0) {
              slotTotals[b.course_id] = (slotTotals[b.course_id] || 0) + cap
              slotUsed[b.course_id] = (slotUsed[b.course_id] || 0) + Math.min(used, cap)
            }
          }
        }
      }

      const mapCourse = (c: any) => ({
        id: c.id,
        title: c.title,
        description: c.description,
        level: c.level,
        tier: c.tier,
        track_type: c.track_type,
        details: c.details,
        program: c.program,
        image_url: (c as any).image_url || undefined,
        student_count: enrollmentCounts[c.id] || 0,
        meeting_count: Number(c.meeting_count ?? 0),
        project_count: Number(c.project_count ?? 0),
        batch_count: batchCounts[c.id] || 0,
        slots_total: slotTotals[c.id] || 0,
        slots_used: slotUsed[c.id] || 0,
        status: c.status,
        sessions_created: sessionCounts[c.id] || 0,
        my_batches: (myBatchesData?.data || [])
          .filter((b: any) => b.course_id === c.id)
          .map((b: any) => ({
            id: b.id,
            name: b.name,
            status: b.status,
            capacity: Number(b.capacity) || 0,
            current_students: Number(b.current_students) || 0,
            start_date: b.start_date || null,
            end_date: b.end_date || null,
            meetings_per_week: Number(b.meetings_per_week) || 2,
          })),
      })

      setCourses(myCoursesList.map(mapCourse))
    } catch (err) {
      console.error('Failed to fetch courses:', err)
      setCourses([])
    }
    setLoading(false)
  }, [user])

  useEffect(() => {
    if (authLoading || !user) return
    fetchCourses()
  }, [user, authLoading, fetchCourses])

  useEffect(() => {
    if (!user) return
    const supabaseRealtime = createClient()
    const channel = supabaseRealtime
      .channel('kelas-batch-slots')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'batches' },
        () => {
          fetchCourses()
        }
      )
      .subscribe()
    return () => {
      supabaseRealtime.removeChannel(channel)
    }
  }, [user, fetchCourses])

  const totalStudents = courses.reduce((sum, c) => sum + c.student_count, 0)

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

  const getLevelBadgeVariant = (status?: string) => {
    switch (status) {
      case 'active': return 'success' as const
      case 'draft': return 'warning' as const
      case 'archived': return 'destructive' as const
      default: return 'default' as const
    }
  }

  return (
    <DashboardLayout role="teacher">
      <motion.div
        className="space-y-6"
        variants={containerVariants}
        initial="hidden"
        animate="visible"
      >
        <motion.div variants={itemVariants} className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-indigo-500/10 via-indigo-500/5 to-purple-500/10 border border-indigo-500/20 p-6">
          <div className="absolute top-0 right-0 w-64 h-64 bg-gradient-to-bl from-indigo-500/10 to-transparent rounded-full blur-3xl" />
          <div className="relative flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-indigo-600 shadow-lg shadow-indigo-500/20">
                <GraduationCap className="h-7 w-7 text-white" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-on-surface">{t('teacher1.kelas.title')}</h1>
                <p className="text-on-surface-variant mt-1">{t('teacher1.kelas.subtitle')}</p>
              </div>
            </div>
            <span className="text-sm text-on-surface-variant">{t('teacher1.kelas.chooseAvailable')}</span>
          </div>
        </motion.div>

        <motion.div
          className="grid grid-cols-1 gap-4 sm:grid-cols-3"
          variants={containerVariants}
          initial="hidden"
          animate="visible"
        >
          <motion.div variants={statVariants} custom={0}>
            <Card className="group hover:shadow-lg hover:shadow-indigo-500/5 transition-all duration-300">
              <CardContent className="p-4">
                <div className="flex items-center justify-between mb-2">
                  <School className="h-5 w-5 text-indigo-400" />
                  <span className="text-[10px] text-muted uppercase tracking-wider font-medium">{t('teacher1.kelas.totalClasses')}</span>
                </div>
                <p className="text-2xl font-bold text-on-surface">
                  {loading ? <span className="inline-block h-7 w-8 rounded bg-surface-container-high animate-pulse" /> : courses.length}
                </p>
                <p className="text-[10px] text-muted mt-0.5">{t('teacher1.kelas.activeCourses')}</p>
              </CardContent>
            </Card>
          </motion.div>
          <motion.div variants={statVariants} custom={1}>
            <Card className="group hover:shadow-lg hover:shadow-indigo-500/5 transition-all duration-300">
              <CardContent className="p-4">
                <div className="flex items-center justify-between mb-2">
                  <Users className="h-5 w-5 text-emerald-400" />
                  <span className="text-[10px] text-muted uppercase tracking-wider font-medium">{t('teacher1.kelas.activeStudents')}</span>
                </div>
                <p className="text-2xl font-bold text-on-surface">
                  {loading ? <span className="inline-block h-7 w-8 rounded bg-surface-container-high animate-pulse" /> : totalStudents}
                </p>
                <p className="text-[10px] text-muted mt-0.5">{t('teacher1.kelas.totalStudentsSub')}</p>
              </CardContent>
            </Card>
          </motion.div>

        </motion.div>

        {loading ? (
          <ClassSkeleton />
        ) : (
          <>
            {courses.length === 0 ? (
              <motion.div variants={itemVariants}>
                <Card>
                  <CardContent className="flex flex-col items-center justify-center py-16">
                    <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500/10 to-purple-500/10 mb-4 ring-1 ring-indigo-500/20">
                      <BookOpen className="h-10 w-10 text-indigo-400" />
                    </div>
                    <h3 className="text-lg font-semibold text-on-surface">{t('teacher1.kelas.emptyTitle')}</h3>
                    <p className="text-sm text-on-surface-variant mt-1 mb-2 text-center max-w-md">
                      {t('teacher1.kelas.emptyDesc')}
                    </p>
                  </CardContent>
                </Card>
              </motion.div>
            ) : (
              <>
                <h2 className="text-lg font-semibold text-on-surface">{t('teacher1.kelas.title')}</h2>
                <motion.div
                  className="grid gap-4 md:grid-cols-2 lg:grid-cols-3"
                  variants={containerVariants}
                  initial="hidden"
                  animate="visible"
                >
                  {courses.map((course, i) => {
                    const statItems = [
                      { icon: Users, label: t('teacher1.kelas.studentsCount', { count: course.student_count }), color: 'text-emerald-400' },

                      { icon: Video, label: t('teacher1.kelas.meetingsCount', { count: course.meeting_count }), color: 'text-sky-400' },
                      { icon: BookOpen, label: t('teacher1.kelas.projectsCount', { count: course.project_count }), color: 'text-amber-400' },
                    ]
                    return (
                    <motion.div key={course.id} variants={itemVariants} custom={i}>
                      <Card className="overflow-hidden p-0 transition-all duration-300 hover:border-indigo-500/30 hover:shadow-xl hover:shadow-indigo-500/5 group">
                        <div className="h-1.5 bg-gradient-to-r from-indigo-500 via-purple-500 to-indigo-500" />
                        <CardContent className="p-5 space-y-4">
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <h3 className="font-semibold text-on-surface leading-tight line-clamp-1 group-hover:text-indigo-400 transition-colors">
                                {course.title?.id || course.title?.en || t('teacher1.kelas.untitled')}
                              </h3>
                              {(course.tier || course.level?.tier || course.level?.code || course.program?.tier) && (
                                <p className="text-xs text-muted mt-0.5">
                                  {t(`common.tier.${normalizeTier(course.tier || course.level?.tier || course.level?.code || course.program?.tier) || 'unknown'}`)}
                                  {' Â· '}{t(trackLabelKey(course.track_type || course.program?.track_type))}
                                </p>
                              )}
                            </div>
                            <Badge variant={getLevelBadgeVariant(course.status)} className="capitalize shrink-0">
                              {course.status === 'active' ? t('teacher1.kelas.statusActive') : course.status === 'draft' ? t('teacher1.kelas.statusDraft') : course.status}
                            </Badge>
                          </div>

                          {course.description && (
                            <p className="text-sm text-on-surface-variant line-clamp-2 leading-relaxed">
                              {course.description?.id || course.description?.en || t('teacher1.kelas.noDescription')}
                            </p>
                          )}

                          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                            {statItems.map((s, si) => (
                              <div key={si} className="flex flex-col items-center gap-1 rounded-lg border border-border/60 bg-surface-container-lowest px-2 py-2">
                                <s.icon className={cn('h-4 w-4 shrink-0', s.color)} />
                                <span className="text-[11px] font-medium text-on-surface-variant leading-tight text-center">{s.label}</span>
                              </div>
                            ))}
                          </div>

                          {course.my_batches.length > 0 && (
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="flex items-center gap-1.5 text-xs text-on-surface-variant">
                                <Layers className="h-3.5 w-3.5 text-indigo-400" />
                                {t('teacher1.kelas.batchesCount', { count: course.batch_count })}
                              </span>
{course.my_batches.slice(0, 2).map((b) => (
                            <div key={b.id} className="flex items-center gap-2">
                              <Badge variant={batchStatusVariant(b.status)} size="sm">
                                {batchStatusLabel(b.status)}
                              </Badge>
                              {b.status === 'active' && (
                                <BatchCountdown endDate={b.end_date} status={b.status} compact />
                              )}
                            </div>
                          ))}
                              {course.my_batches.length > 2 && (
                                <span className="text-[10px] text-muted">+{course.my_batches.length - 2}</span>
                              )}
                            </div>
                          )}

                          <Link href={`/teacher/kelas/${course.id}`} className="block">
                            <Button className="w-full">
                              <Play className="h-3.5 w-3.5 mr-1.5" /> {t('teacher1.kelas.enterClass')}
                            </Button>
                          </Link>
                        </CardContent>
                      </Card>
                    </motion.div>
                    )
                  })}
                </motion.div>
              </>
            )}
          </>
        )}
      </motion.div>
    </DashboardLayout>
  )
}
