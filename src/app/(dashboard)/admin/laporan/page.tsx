'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { createClient } from '@/lib/supabase-client'
import { useI18n } from '@/lib/i18n/client'
import {
  BarChart3, Users, BookOpen, Award, Activity, Calendar, Download,
  Loader2, GraduationCap, UserCheck
} from 'lucide-react'
import { formatDate } from '@/lib/utils'

// ──────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────

interface OverviewMetric {
  label: string
  value: number
  icon: React.ElementType
  color: string
  bg: string
}

interface MonthlyEnrollment {
  month: string
  label: string
  count: number
}

interface GradeDist {
  grade: string
  count: number
  barColor: string
  badgeVariant: 'success' | 'info' | 'warning' | 'destructive' | 'outline'
}

interface LangStat {
  code: string
  count: number
}

interface TopTeacher {
  user_id: string
  display_name: string
  course_count: number
  total_students: number
}

interface RecentEnrollment {
  id: string
  student_name: string
  course_title: string
  enrolled_at: string
  status: string
}

// ──────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────

function getCourseTitle(title: unknown, fallback: string): string {
  if (!title) return fallback
  if (typeof title === 'string') return title
  const t = title as { id?: string; en?: string }
  return t.id || t.en || fallback
}

function getUserDisplayName(u: { display_name?: string | null; email?: string | null } | null | undefined, fallback: string): string {
  if (!u) return fallback
  return u.display_name || u.email || fallback
}

const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

// ──────────────────────────────────────────────
// Page Component
// ──────────────────────────────────────────────

export default function AdminLaporanPage() {
  const { t, lang } = useI18n()
  const locale = lang === 'en' ? 'en-US' : lang === 'zh' ? 'zh-CN' : 'id-ID'
  const supabase = createClient()
  const [loading, setLoading] = useState(true)

  // Overview
  const [overview, setOverview] = useState<OverviewMetric[]>([])

  // Charts
  const [monthlyEnrollments, setMonthlyEnrollments] = useState<MonthlyEnrollment[]>([])
  const [gradeDistribution, setGradeDistribution] = useState<GradeDist[]>([])
  const [popularLanguages, setPopularLanguages] = useState<LangStat[]>([])
  const [attendanceRate, setAttendanceRate] = useState(0)
  const [attendanceTotal, setAttendanceTotal] = useState(0)
  const [attendancePresent, setAttendancePresent] = useState(0)

  // Tables
  const [topTeachers, setTopTeachers] = useState<TopTeacher[]>([])
  const [recentEnrollments, setRecentEnrollments] = useState<RecentEnrollment[]>([])

  useEffect(() => {
    fetchAllData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function fetchAllData() {
    setLoading(true)
    try {
      await Promise.all([
        fetchOverview(),
        fetchMonthlyEnrollments(),
        fetchGradeDistribution(),
        fetchPopularLanguages(),
        fetchAttendanceRate(),
        fetchTopTeachers(),
        fetchRecentEnrollments(),
      ])
    } catch (err) {
      console.error('Failed to fetch analytics data', err)
    } finally {
      setLoading(false)
    }
  }

  // ── Overview ──

  async function fetchOverview() {
    const [
      { count: studentCount },
      { count: teacherCount },
      { count: courseCount },
      { count: enrollmentCount },
      { count: certCount },
    ] = await Promise.all([
      supabase.from('users').select('*', { count: 'exact', head: true }).eq('role', 'student'),
      supabase.from('users').select('*', { count: 'exact', head: true }).eq('role', 'teacher').eq('status', 'active'),
      supabase.from('courses').select('*', { count: 'exact', head: true }),
      supabase.from('enrollments').select('*', { count: 'exact', head: true }),
      supabase.from('certificates').select('*', { count: 'exact', head: true }),
    ])

    setOverview([
      { label: t('admin1.laporan.ovStudents'), value: studentCount ?? 0, icon: Users, color: 'text-indigo-400', bg: 'bg-indigo-500/10' },
      { label: t('admin1.laporan.ovTeachers'), value: teacherCount ?? 0, icon: UserCheck, color: 'text-emerald-400', bg: 'bg-emerald-500/10' },
      { label: t('admin1.laporan.ovCourses'), value: courseCount ?? 0, icon: BookOpen, color: 'text-amber-400', bg: 'bg-amber-500/10' },
      { label: t('admin1.laporan.ovEnrollments'), value: enrollmentCount ?? 0, icon: BarChart3, color: 'text-violet-400', bg: 'bg-violet-500/10' },
      { label: t('admin1.laporan.ovCertificates'), value: certCount ?? 0, icon: Award, color: 'text-rose-400', bg: 'bg-rose-500/10' },
    ])
  }

  // ── Monthly Enrollments ──

  async function fetchMonthlyEnrollments() {
    const startDate = new Date()
    startDate.setFullYear(startDate.getFullYear() - 1)

    const { data } = await supabase
      .from('enrollments')
      .select('enrolled_at')
      .gte('enrolled_at', startDate.toISOString())
      .order('enrolled_at', { ascending: true })

    if (!data) {
      setMonthlyEnrollments([])
      return
    }

    const monthMap = new Map<string, number>()
    for (const e of data) {
      if (!e.enrolled_at) continue
      const d = new Date(e.enrolled_at)
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
      monthMap.set(key, (monthMap.get(key) || 0) + 1)
    }

    const now = new Date()
    const result: MonthlyEnrollment[] = []
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
      result.push({
        month: key,
        label: `${MONTHS_SHORT[d.getMonth()]} '${String(d.getFullYear()).slice(2)}`,
        count: monthMap.get(key) || 0,
      })
    }

    setMonthlyEnrollments(result)
  }

  // ── Grade Distribution ──

  async function fetchGradeDistribution() {
    const { data } = await supabase.from('grade_aggregates').select('grade_letter')
    if (!data || data.length === 0) {
      setGradeDistribution([])
      return
    }

    const countMap = new Map<string, number>()
    for (const g of data) {
      const letter = g.grade_letter || 'N/A'
      countMap.set(letter, (countMap.get(letter) || 0) + 1)
    }

    const gradeConfig: Record<string, { barColor: string; badgeVariant: 'success' | 'info' | 'warning' | 'destructive' | 'outline' }> = {
      A: { barColor: 'bg-emerald-500', badgeVariant: 'success' },
      B: { barColor: 'bg-blue-500', badgeVariant: 'info' },
      C: { barColor: 'bg-amber-500', badgeVariant: 'warning' },
      D: { barColor: 'bg-orange-500', badgeVariant: 'warning' },
      E: { barColor: 'bg-red-500', badgeVariant: 'destructive' },
    }

    const order = ['A', 'B', 'C', 'D', 'E']
    const result: GradeDist[] = []
    for (const g of order) {
      if (countMap.has(g)) {
        const cfg = gradeConfig[g] || { barColor: 'bg-gray-500', badgeVariant: 'outline' as const }
        result.push({ grade: g, count: countMap.get(g)!, ...cfg })
      }
    }
    // Any extra grades not in standard order
    for (const [g, c] of countMap) {
      if (!order.includes(g)) {
        result.push({ grade: g, count: c, barColor: 'bg-gray-500', badgeVariant: 'outline' })
      }
    }

    setGradeDistribution(result)
  }

  // ── Popular Languages ──

  async function fetchPopularLanguages() {
    const { data } = await supabase.from('courses').select('language_code')
    if (!data || data.length === 0) {
      setPopularLanguages([])
      return
    }

    const countMap = new Map<string, number>()
    for (const c of data) {
      countMap.set(c.language_code, (countMap.get(c.language_code) || 0) + 1)
    }

    const sorted = Array.from(countMap.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([code, count]) => ({ code, count }))

    setPopularLanguages(sorted)
  }

  // ── Attendance Rate ──

  async function fetchAttendanceRate() {
    const { data } = await supabase.from('attendance').select('status')
    if (!data || data.length === 0) {
      setAttendanceRate(0)
      setAttendanceTotal(0)
      setAttendancePresent(0)
      return
    }

    const present = data.filter(a => a.status === 'present').length
    setAttendancePresent(present)
    setAttendanceTotal(data.length)
    setAttendanceRate(Math.round((present / data.length) * 100))
  }

  // ── Top Teachers ──

  async function fetchTopTeachers() {
    const { data: courseTeachers } = await supabase
      .from('course_teachers')
      .select('course_id, teacher_id')

    if (!courseTeachers || courseTeachers.length === 0) {
      setTopTeachers([])
      return
    }

    const teacherIds = [...new Set(courseTeachers.map(ct => ct.teacher_id))]

    const { data: teacherUsers } = await supabase
      .from('users')
      .select('id, display_name, email')
      .in('id', teacherIds)

    const userMap = new Map((teacherUsers || []).map(u => [u.id, u]))

    // Group courses by teacher
    const courseCountMap = new Map<string, number>()
    const teacherCoursesMap = new Map<string, string[]>()
    for (const ct of courseTeachers) {
      courseCountMap.set(ct.teacher_id, (courseCountMap.get(ct.teacher_id) || 0) + 1)
      const arr = teacherCoursesMap.get(ct.teacher_id) || []
      arr.push(ct.course_id)
      teacherCoursesMap.set(ct.teacher_id, arr)
    }

    // Get enrollments per course
    const allCourseIds = courseTeachers.map(ct => ct.course_id)
    const { data: enrollments } = await supabase
      .from('enrollments')
      .select('course_id')
      .in('course_id', allCourseIds)

    const enrollCountMap = new Map<string, number>()
    for (const e of enrollments || []) {
      enrollCountMap.set(e.course_id, (enrollCountMap.get(e.course_id) || 0) + 1)
    }

    // Aggregate students per teacher
    const teacherStudentCount = new Map<string, number>()
    for (const [teacherId, courseIds] of teacherCoursesMap) {
      let total = 0
      for (const cId of courseIds) {
        total += enrollCountMap.get(cId) || 0
      }
      teacherStudentCount.set(teacherId, total)
    }

    const result: TopTeacher[] = teacherIds
      .map(id => ({
        user_id: id,
        display_name: getUserDisplayName(userMap.get(id), t('admin1.laporan.unknown')),
        course_count: courseCountMap.get(id) || 0,
        total_students: teacherStudentCount.get(id) || 0,
      }))
      .sort((a, b) => b.total_students - a.total_students || b.course_count - a.course_count)
      .slice(0, 5)

    setTopTeachers(result)
  }

  // ── Recent Enrollments ──

  async function fetchRecentEnrollments() {
    const { data } = await supabase
      .from('enrollments')
      .select('id, enrolled_at, status, user:users(display_name, email), course:courses(title)')
      .order('enrolled_at', { ascending: false })
      .limit(8)

    if (!data) {
      setRecentEnrollments([])
      return
    }

    const result: RecentEnrollment[] = data.map((e: unknown) => {
      const row = e as {
        id: string
        enrolled_at: string
        status: string
        user: { display_name?: string | null; email?: string | null } | null
        course: { title: unknown } | null
      }
      return {
        id: row.id,
        student_name: getUserDisplayName(row.user, t('admin1.laporan.unknown')),
        course_title: getCourseTitle(row.course?.title, t('admin1.laporan.untitled')),
        enrolled_at: row.enrolled_at,
        status: row.status,
      }
    })

    setRecentEnrollments(result)
  }

  // ── Loading State ──

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }

  // ── Render ──

  const maxEnrollment = Math.max(...monthlyEnrollments.map(m => m.count), 1)
  const maxGrade = Math.max(...gradeDistribution.map(g => g.count), 1)
  const maxLang = Math.max(...popularLanguages.map(l => l.count), 1)

  return (
    <div className="space-y-6">
      {/* ── Header ── */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-on-surface">{t('admin1.laporan.title')}</h1>
          <p className="text-on-surface-variant">{t('admin1.laporan.subtitle')}</p>
        </div>
        <button
          className="flex items-center gap-2 rounded-lg border border-border px-4 py-2 text-sm text-on-surface hover:bg-surface-container-high transition-colors"
          disabled
          title={t('admin1.laporan.exportComingSoon')}
        >
          <Download className="h-4 w-4" /> {t('admin1.laporan.export')}
        </button>
      </div>

      {/* ── Overview Cards ── */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
        {overview.map((metric) => {
          const Icon = metric.icon
          return (
            <Card key={metric.label}>
              <CardContent className="p-5">
                <div className={`inline-flex rounded-lg p-2.5 ${metric.bg} mb-3`}>
                  <Icon className={`h-5 w-5 ${metric.color}`} />
                </div>
                <p className="text-2xl font-bold text-on-surface">{metric.value.toLocaleString()}</p>
                <p className="text-xs text-muted mt-1">{metric.label}</p>
              </CardContent>
            </Card>
          )
        })}
      </div>

      {/* ── Charts Section (2×2 grid) ── */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Monthly Enrollments ── vertical bar chart */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-sm">
              <Calendar className="h-4 w-4 text-primary" />
              {t('admin1.laporan.monthlyEnrollments')}
              <span className="text-xs text-muted font-normal">{t('admin1.laporan.months12')}</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {monthlyEnrollments.length === 0 ? (
              <p className="text-sm text-muted text-center py-10">{t('admin1.laporan.noEnrollmentData')}</p>
            ) : (
              <div
                className="flex items-end gap-1.5 h-48"
                role="img"
                aria-label={t('admin1.laporan.monthlyChartAria')}
              >
                {monthlyEnrollments.map((m) => {
                  const pct = (m.count / maxEnrollment) * 100
                  return (
                    <div key={m.month} className="flex-1 flex flex-col items-center gap-1.5 h-full justify-end">
                      <span className="text-[10px] text-muted font-medium leading-none">{m.count}</span>
                      <div
                        className="w-full bg-primary/20 rounded-t-[3px] relative overflow-hidden"
                        style={{ height: `${Math.max(pct, 2)}%` }}
                      >
                        <div
                          className="absolute bottom-0 w-full bg-primary rounded-t-[3px] transition-all duration-500"
                          style={{ height: '100%' }}
                        />
                      </div>
                      <span className="text-[10px] text-muted text-center leading-tight">{m.label}</span>
                    </div>
                  )
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Grade Distribution ── horizontal bars */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-sm">
              <Award className="h-4 w-4 text-primary" />
              {t('admin1.laporan.gradeDistribution')}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {gradeDistribution.length === 0 ? (
              <p className="text-sm text-muted text-center py-10">{t('admin1.laporan.noGradeData')}</p>
            ) : (
              gradeDistribution.map((g) => {
                const width = (g.count / maxGrade) * 100
                return (
                  <div key={g.grade}>
                    <div className="flex items-center justify-between text-sm mb-1.5">
                      <Badge variant={g.badgeVariant} size="sm" className="font-mono tracking-wider">
                        {g.grade}
                      </Badge>
                      <span className="text-on-surface font-medium tabular-nums">{g.count.toLocaleString()}</span>
                    </div>
                    <div className="h-2.5 rounded-full bg-surface-container-highest overflow-hidden">
                      <div
                        className={`h-full rounded-full ${g.barColor} transition-all duration-500`}
                        style={{ width: `${width}%` }}
                      />
                    </div>
                  </div>
                )
              })
            )}
          </CardContent>
        </Card>

        {/* Popular Languages ── horizontal bars */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-sm">
              <BarChart3 className="h-4 w-4 text-primary" />
              {t('admin1.laporan.popularLanguages')}
              <span className="text-xs text-muted font-normal">{t('admin1.laporan.top5')}</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {popularLanguages.length === 0 ? (
              <p className="text-sm text-muted text-center py-10">{t('admin1.laporan.noCourseData')}</p>
            ) : (
              popularLanguages.map((lang) => {
                const width = (lang.count / maxLang) * 100
                return (
                  <div key={lang.code}>
                    <div className="flex items-center justify-between text-sm mb-1.5">
                      <span className="text-on-surface font-medium">{lang.code.toUpperCase()}</span>
                      <span className="text-muted tabular-nums">{t('admin1.laporan.courseCount', { count: lang.count })}</span>
                    </div>
                    <div className="h-2.5 rounded-full bg-surface-container-highest overflow-hidden">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-violet-500 to-purple-500 transition-all duration-500"
                        style={{ width: `${width}%` }}
                      />
                    </div>
                  </div>
                )
              })
            )}
          </CardContent>
        </Card>

        {/* Attendance Rate ── donut chart */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-sm">
              <Activity className="h-4 w-4 text-primary" />
              {t('admin1.laporan.attendanceRate')}
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col items-center justify-center py-4">
            {attendanceTotal === 0 ? (
              <p className="text-sm text-muted text-center py-10">{t('admin1.laporan.noAttendanceData')}</p>
            ) : (
              <>
                <div className="relative w-36 h-36 mb-4">
                  <svg className="w-36 h-36 -rotate-90" viewBox="0 0 36 36" aria-label={t('admin1.laporan.attendanceAria', { percent: attendanceRate })}>
                    {/* Background circle */}
                    <circle
                      cx="18" cy="18" r="15.5"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="3"
                      className="text-surface-container-highest"
                    />
                    {/* Progress arc */}
                    <circle
                      cx="18" cy="18" r="15.5"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="3"
                      strokeDasharray={`${attendanceRate} ${100 - attendanceRate}`}
                      strokeLinecap="round"
                      className="text-emerald-500 transition-all duration-1000 ease-out"
                    />
                  </svg>
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="text-center">
                      <p className="text-3xl font-bold text-on-surface tabular-nums">{attendanceRate}%</p>
                      <p className="text-[10px] text-muted mt-0.5">{attendancePresent}/{attendanceTotal}</p>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-5 text-xs text-muted">
                  <div className="flex items-center gap-1.5">
                    <div className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
                    <span>{t('admin1.laporan.present')}</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <div className="w-2.5 h-2.5 rounded-full bg-surface-container-highest" />
                    <span>{t('admin1.laporan.total')}</span>
                  </div>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ── Tables Section ── */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Top Teachers */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center justify-between text-sm">
              <span className="flex items-center gap-2">
                <GraduationCap className="h-4 w-4 text-primary" />
                {t('admin1.laporan.topTeachers')}
              </span>
              <Badge variant="outline" size="sm">{t('admin1.laporan.teacherCount', { count: topTeachers.length })}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {topTeachers.length === 0 ? (
              <p className="text-sm text-muted text-center py-6">{t('admin1.laporan.noTeacherData')}</p>
            ) : (
              <div className="divide-y divide-border" role="table" aria-label={t('admin1.laporan.topTeachersAria')}>
                {topTeachers.map((teacher, i) => (
                  <div key={teacher.user_id} className="flex items-center justify-between py-3 first:pt-0 last:pb-0" role="row">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="flex items-center justify-center w-7 h-7 rounded-full bg-surface-container-high text-xs font-bold text-on-surface shrink-0">
                        {i + 1}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-on-surface truncate">{teacher.display_name}</p>
                        <p className="text-xs text-muted">{t('admin1.laporan.courseCount', { count: teacher.course_count })}</p>
                      </div>
                    </div>
                    <div className="text-right shrink-0 ml-3">
                      <p className="text-sm font-semibold text-on-surface tabular-nums">{teacher.total_students}</p>
                      <p className="text-[10px] text-muted">{t('admin1.laporan.studentShort', { count: teacher.total_students })}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Recent Activity */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center justify-between text-sm">
              <span className="flex items-center gap-2">
                <Activity className="h-4 w-4 text-primary" />
                {t('admin1.laporan.recentEnrollments')}
              </span>
              <Badge variant="outline" size="sm">{t('admin1.laporan.latest', { count: recentEnrollments.length })}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {recentEnrollments.length === 0 ? (
              <p className="text-sm text-muted text-center py-6">{t('admin1.laporan.noEnrollmentData')}</p>
            ) : (
              <div className="divide-y divide-border" role="table" aria-label={t('admin1.laporan.recentAria')}>
                {recentEnrollments.map((e) => (
                  <div key={e.id} className="flex items-center justify-between py-2.5 first:pt-0 last:pb-0 gap-3" role="row">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-on-surface truncate">{e.student_name}</p>
                      <p className="text-xs text-muted truncate flex items-center gap-1">
                        <BookOpen className="h-3 w-3 shrink-0" />
                        {e.course_title}
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-xs text-muted whitespace-nowrap tabular-nums">{formatDate(e.enrolled_at, locale)}</p>
                      <Badge
                        variant={
                          e.status === 'active' ? 'success'
                          : e.status === 'completed' ? 'info'
                          : e.status === 'cancelled' ? 'destructive'
                          : 'outline'
                        }
                        size="sm"
                        className="mt-0.5 capitalize"
                      >
                        {e.status}
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
