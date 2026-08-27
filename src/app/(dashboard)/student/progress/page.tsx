'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  BookOpen, TrendingUp, Award, Calendar, Headphones, BookMarked,
  Mic, PenLine, Loader2, Target, Activity
} from 'lucide-react'
import { createClient } from '@/lib/supabase-client'
import { useAuth } from '@/lib/auth-context'
import { useI18n } from '@/lib/i18n/client'
import { cn, buildTeacherIdByCourse, filterByTeacher } from '@/lib/utils'
import type { Course, Enrollment, LiveSession, Attendance, Quiz, QuizAttempt, Material } from '@/types'

interface CourseProgress {
  course: Course
  progressPct: number
  materialsViewed: number
  totalMaterials: number
  quizzesDone: number
  totalQuizzes: number
}

interface SkillScore {
  label: string
  icon: typeof Headphones
  score: number
  color: string
}

interface MonthlyPoint {
  month: string
  value: number
}

export default function StudentProgressPage() {
  const { user, loading: authLoading } = useAuth()
  const { t } = useI18n()
  const supabase = createClient()

  const [courseProgress, setCourseProgress] = useState<CourseProgress[]>([])
  const [skills, setSkills] = useState<SkillScore[]>([])
  const [attendanceTrend, setAttendanceTrend] = useState<MonthlyPoint[]>([])
  const [gradeTrend, setGradeTrend] = useState<MonthlyPoint[]>([])
  const [loading, setLoading] = useState(true)
  const [overallPct, setOverallPct] = useState(0)

  useEffect(() => {
    if (authLoading || !user) return
    fetchProgress()
  }, [authLoading, user])

  async function fetchProgress() {
    setLoading(true)
    try {
      const { data: enrollments } = await supabase
        .from('enrollments')
        .select('*, course:courses(*)')
        .eq('user_id', user!.id)
        .in('status', ['active', 'completed'])

      if (!enrollments || enrollments.length === 0) {
        setCourseProgress([])
        setOverallPct(0)
        setLoading(false)
        return
      }

      const enrList = enrollments as (Enrollment & { course: Course })[]
      const courseIds = enrList.map(e => e.course_id)
      const teacherByCourse = buildTeacherIdByCourse(enrList)

      const [{ data: materials }, { data: quizzes }, { data: sessions }, { data: allQuizAttempts }, { data: allLmsTasks }, { data: lmsActivityProgress }, { data: materialProgress }] = await Promise.all([
        supabase.from('materials').select('*').in('course_id', courseIds),
        supabase.from('quizzes').select('*').in('course_id', courseIds),
        supabase.from('live_sessions').select('*').in('course_id', courseIds),
        supabase.from('quiz_attempts').select('*, quiz:quizzes!inner(course_id)').eq('user_id', user!.id),
        supabase.from('course_tasks').select('id, course_id').in('course_id', courseIds).eq('status', 'published'),
        supabase.from('student_activity_progress').select('task_id, activity_id, status, score').eq('user_id', user!.id),
        supabase.from('student_material_progress').select('material_id, status').eq('user_id', user!.id),
      ])

      // Fetch activity types for skill breakdown (reading vs listening)
      let activityTypeMap = new Map<string, string>()
      const lmsTaskIdsForTypes = (allLmsTasks || []).map((t: any) => t.id)
      if (lmsTaskIdsForTypes.length > 0) {
        const { data: taskLessons } = await supabase.from('task_lessons').select('id').in('task_id', lmsTaskIdsForTypes)
        const lessonIds = (taskLessons || []).map((l: any) => l.id)
        if (lessonIds.length > 0) {
          const { data: acts } = await supabase.from('lesson_activities').select('id, activity_type').in('lesson_id', lessonIds)
          for (const a of (acts || []) as { id: string; activity_type: string }[]) {
            activityTypeMap.set(a.id, a.activity_type)
          }
        }
      }

      const matList = (materials || []) as Material[]
      const quizList = (quizzes || []) as Quiz[]
      const sessList = filterByTeacher((sessions || []) as LiveSession[], teacherByCourse)
      const qAttempts = (allQuizAttempts || []) as (QuizAttempt & { quiz: { course_id: string } })[]
      const lmsTasks = (allLmsTasks || []) as { id: string; course_id: string }[]
      const lmsProgress = (lmsActivityProgress || []) as { task_id: string; activity_id: string; status: string; score: number }[]
      const matProgressRows = (materialProgress || []) as { material_id: string; status: string }[]
      const completedMaterialIds = new Set(matProgressRows.filter(r => r.status === 'completed').map(r => r.material_id))
      const lmsTaskByCourse = new Map<string, string[]>()
      for (const t of lmsTasks) {
        const arr = lmsTaskByCourse.get(t.course_id) || []
        arr.push(t.id)
        lmsTaskByCourse.set(t.course_id, arr)
      }

      // Build course-to-sessions map
      const courseSessionMap = new Map<string, LiveSession[]>()
      for (const s of sessList) {
        const arr = courseSessionMap.get(s.course_id) || []
        arr.push(s)
        courseSessionMap.set(s.course_id, arr)
      }


      const matByCourse = new Map<string, Material[]>()
      for (const m of matList) {
        const arr = matByCourse.get(m.course_id) || []
        arr.push(m)
        matByCourse.set(m.course_id, arr)
      }

      const quizByCourse = new Map<string, Quiz[]>()
      for (const q of quizList) {
        const arr = quizByCourse.get(q.course_id) || []
        arr.push(q)
        quizByCourse.set(q.course_id, arr)
      }

      const sessByCourse = new Map<string, LiveSession[]>()
      for (const s of sessList) {
        const arr = sessByCourse.get(s.course_id) || []
        arr.push(s)
        sessByCourse.set(s.course_id, arr)
      }

      const qAttemptsByCourse = new Map<string, QuizAttempt[]>()
      for (const qa of qAttempts) {
        const cid = (qa.quiz as any)?.course_id
        if (!cid) continue
        const arr = qAttemptsByCourse.get(cid) || []
        arr.push(qa)
        qAttemptsByCourse.set(cid, arr)
      }

      const allSessionIds = sessList.map(s => s.id)

      const { data: attendanceData } = allSessionIds.length
        ? await supabase.from('attendance').select('*').eq('user_id', user!.id).in('session_id', allSessionIds)
        : { data: [] }

      const attRecords = (attendanceData || []) as Attendance[]

      const cpList: CourseProgress[] = enrList.map(enr => {
        const cid = enr.course_id
        const courseMats = matByCourse.get(cid) || []
        const courseQuizzes = quizByCourse.get(cid) || []
        const courseAttempts = qAttemptsByCourse.get(cid) || []

        const totalMaterials = courseMats.length
        const materialsViewed = courseMats.filter(m => completedMaterialIds.has(m.id)).length
        const matProgress = totalMaterials > 0 ? (materialsViewed / totalMaterials) * 100 : 0
        const attemptedQuizIds = new Set(courseAttempts.filter(qa => qa.score != null).map(qa => qa.quiz_id))
        const quizzesDone = courseQuizzes.filter(q => attemptedQuizIds.has(q.id)).length
        const totalQuizzes = courseQuizzes.length
        const courseSessions = courseSessionMap.get(cid) || []
        const sessionProgress = courseSessions.length > 0 ? (courseSessions.filter(s => attRecords.some((a: Attendance) => a.session_id === s.id && a.status === 'present')).length / courseSessions.length) * 100 : 0
        const quizProgress = totalQuizzes > 0 ? (quizzesDone / totalQuizzes) * 100 : 0

        const courseLmsTaskIds = lmsTaskByCourse.get(cid) || []
        // For LMS, count distinct tasks that have at least one completed activity
        const completedTaskIds = new Set(lmsProgress.filter(p => courseLmsTaskIds.includes(p.task_id) && p.status === 'completed').map(p => p.task_id))
        const lmsCompleted = completedTaskIds.size
        const lmsTotal = courseLmsTaskIds.length
        const lmsProgressPct = lmsTotal > 0 ? (lmsCompleted / lmsTotal) * 100 : 0

        // Weighted average of available components (not max) - prevents inflated max
        const components: number[] = []
        if (totalMaterials > 0) components.push(matProgress)
        if (totalQuizzes > 0) components.push(quizProgress)
        if (courseSessions.length > 0) components.push(sessionProgress)
        if (lmsTotal > 0) components.push(lmsProgressPct)
        const progressPct = components.length > 0 ? Math.round(components.reduce((a,b)=>a+b,0)/components.length) : 0

        return {
          course: enr.course,
          progressPct: Math.min(progressPct, 100),
          materialsViewed: materialsViewed,
          totalMaterials: Math.max(totalMaterials, 1),
          quizzesDone,
          totalQuizzes,
        }
      })

      setCourseProgress(cpList)
      setOverallPct(cpList.length > 0 ? Math.round(cpList.reduce((s, c) => s + c.progressPct, 0) / cpList.length) : 0)

      const skillMap = [
        { label: t('student1.progress.skillListening'), matchLabel: 'mendengar', key: 'listen', icon: Headphones, color: 'text-blue-400', activityType: 'listening' as string | null },
        { label: t('student1.progress.skillReading'), matchLabel: 'membaca', key: 'read', icon: BookMarked, color: 'text-emerald-400', activityType: 'reading' as string | null },
        { label: t('student1.progress.skillSpeaking'), matchLabel: 'berbicara', key: 'speak', icon: Mic, color: 'text-amber-400', activityType: null },
        { label: t('student1.progress.skillWriting'), matchLabel: 'menulis', key: 'write', icon: PenLine, color: 'text-purple-400', activityType: null },
      ]

      const skillScores: SkillScore[] = skillMap.map(skill => {
        const matching = qAttempts.filter(qa => {
          const qTitle = ((qa as any).quiz?.title || '').toLowerCase()
          return qTitle.includes(skill.key) || qTitle.includes(skill.matchLabel.toLowerCase())
        }).filter(qa => qa.score != null)

        const quizAvg = matching.length > 0
          ? matching.reduce((s, qa) => s + (qa.score ?? 0), 0) / matching.length
          : 0

        // Filter LMS scores by activity type for reading/listening; speaking/writing have no LMS activity yet
        let lmsScores: number[] = []
        if (skill.activityType) {
          lmsScores = lmsProgress
            .filter(p => p.score > 0 && activityTypeMap.get(p.activity_id) === skill.activityType)
            .map(p => p.score)
        }
        const lmsAvg = lmsScores.length > 0
          ? lmsScores.reduce((s, score) => s + score, 0) / lmsScores.length
          : 0

        const avg = quizAvg > 0 && lmsAvg > 0
          ? (quizAvg + lmsAvg) / 2
          : quizAvg > 0 ? quizAvg : lmsAvg

        return { ...skill, score: Math.round(avg) }
      })
      setSkills(skillScores)

      const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

      const attByMonth = new Map<string, { present: number; total: number }>()
      for (const att of attRecords) {
        const d = new Date(att.marked_at)
        const key = `${months[d.getMonth()]} ${d.getFullYear()}`
        const entry = attByMonth.get(key) || { present: 0, total: 0 }
        entry.total++
        if (att.status === 'present') entry.present++
        attByMonth.set(key, entry)
      }
      setAttendanceTrend(Array.from(attByMonth.entries()).map(([month, v]) => ({
        month,
        value: Math.round((v.present / v.total) * 100),
      })))

      const gradeByMonth = new Map<string, number[]>()
      for (const qa of qAttempts) {
        if (qa.score == null || !qa.submitted_at) continue
        const d = new Date(qa.submitted_at)
        const key = `${months[d.getMonth()]} ${d.getFullYear()}`
        const arr = gradeByMonth.get(key) || []
        arr.push(qa.score)
        gradeByMonth.set(key, arr)
      }
      setGradeTrend(Array.from(gradeByMonth.entries()).map(([month, scores]) => ({
        month,
        value: Math.round(scores.reduce((s, v) => s + v, 0) / scores.length),
      })))

    } catch (err) {
      console.error('Failed to fetch progress', err)
    } finally {
      setLoading(false)
    }
  }

  if (loading || authLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="h-8 w-8 text-indigo-400 animate-spin" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-on-surface">{t('student1.progress.title')}</h1>
        <p className="text-on-surface-variant">{t('student1.progress.subtitle')}</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardContent className="p-4 text-center">
            <Target className="h-5 w-5 text-indigo-400 mx-auto mb-2" />
            <p className="text-xs text-muted">{t('student1.progress.overall')}</p>
            <p className="text-2xl font-bold text-indigo-400 mt-1">{overallPct}%</p>
            <div className="mt-2 h-2 rounded-full bg-surface-container-highest overflow-hidden">
              <div className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-indigo-400 transition-all" style={{ width: `${overallPct}%` }} />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <BookOpen className="h-5 w-5 text-emerald-400 mx-auto mb-2" />
            <p className="text-xs text-muted">{t('student1.progress.activeCourses')}</p>
            <p className="text-2xl font-bold text-emerald-400 mt-1">{courseProgress.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <Activity className="h-5 w-5 text-amber-400 mx-auto mb-2" />
            <p className="text-xs text-muted">{t('student1.progress.totalQuizzes')}</p>
            <p className="text-2xl font-bold text-amber-400 mt-1">
              {courseProgress.reduce((s, c) => s + c.quizzesDone, 0)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <Award className="h-5 w-5 text-purple-400 mx-auto mb-2" />
            <p className="text-xs text-muted">{t('student1.progress.avgGrade')}</p>
            <p className="text-2xl font-bold text-purple-400 mt-1">
              {skills.length > 0 ? Math.round(skills.reduce((s, sk) => s + sk.score, 0) / skills.length) : 0}%
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm">
              <BookOpen className="h-4 w-4 text-indigo-400" /> {t('student1.progress.perCourse')}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {courseProgress.length === 0 ? (
              <p className="text-sm text-muted text-center py-4">{t('student1.progress.noCourses')}</p>
            ) : (
              courseProgress.map(cp => (
                <div key={cp.course.id}>
                  <div className="flex items-center justify-between text-sm mb-1">
                    <span className="text-on-surface truncate mr-2">{cp.course.title?.en || cp.course.title?.id || 'Course'}</span>
                    <span className="text-muted shrink-0">{cp.progressPct}%</span>
                  </div>
                  <div className="h-2 rounded-full bg-surface-container-highest overflow-hidden">
                    <div
                      className={cn(
                        'h-full rounded-full transition-all',
                        cp.progressPct >= 80 ? 'bg-emerald-500' : cp.progressPct >= 40 ? 'bg-amber-500' : 'bg-indigo-500'
                      )}
                      style={{ width: `${cp.progressPct}%` }}
                    />
                  </div>
                  <p className="text-[11px] text-muted mt-0.5">
                    {t('student1.progress.materialsCount', { done: cp.materialsViewed, total: cp.totalMaterials })}
                  </p>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm">
              <Award className="h-4 w-4 text-indigo-400" /> {t('student1.progress.languageSkills')}
            </CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-4">
            {skills.map(sk => (
              <div key={sk.label} className="rounded-lg border border-border bg-surface-container-low p-4 text-center">
                <sk.icon className={`h-6 w-6 mx-auto mb-2 ${sk.color}`} />
                <p className="text-xs text-muted mb-1">{sk.label}</p>
                <p className={`text-xl font-bold ${sk.color}`}>{sk.score > 0 ? `${sk.score}%` : '-'}</p>
                {sk.score > 0 && (
                  <div className="mt-2 h-1.5 rounded-full bg-surface-container-highest overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${sk.score >= 80 ? 'bg-emerald-500' : sk.score >= 60 ? 'bg-amber-500' : 'bg-red-500'}`}
                      style={{ width: `${Math.min(sk.score, 100)}%` }}
                    />
                  </div>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm">
              <Calendar className="h-4 w-4 text-indigo-400" /> {t('student1.progress.attendanceTrend')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {attendanceTrend.length === 0 ? (
              <p className="text-sm text-muted text-center py-4">{t('student1.progress.noAttendance')}</p>
            ) : (
              <div className="space-y-3">
                {attendanceTrend.map(item => (
                  <div key={item.month}>
                    <div className="flex items-center justify-between text-sm mb-1">
                      <span className="text-on-surface">{item.month}</span>
                      <span className={cn(
                        'font-medium',
                        item.value >= 80 ? 'text-emerald-400' : item.value >= 60 ? 'text-amber-400' : 'text-red-400'
                      )}>{item.value}%</span>
                    </div>
                    <div className="h-2 rounded-full bg-surface-container-highest overflow-hidden">
                      <div
                        className={cn(
                          'h-full rounded-full transition-all',
                          item.value >= 80 ? 'bg-emerald-500' : item.value >= 60 ? 'bg-amber-500' : 'bg-red-500'
                        )}
                        style={{ width: `${item.value}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm">
              <TrendingUp className="h-4 w-4 text-indigo-400" /> {t('student1.progress.gradeTrend')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {gradeTrend.length === 0 ? (
              <p className="text-sm text-muted text-center py-4">{t('student1.progress.noGradeData')}</p>
            ) : (
              <div className="space-y-3">
                {gradeTrend.map(item => (
                  <div key={item.month}>
                    <div className="flex items-center justify-between text-sm mb-1">
                      <span className="text-on-surface">{item.month}</span>
                      <span className={cn(
                        'font-medium',
                        item.value >= 80 ? 'text-emerald-400' : item.value >= 60 ? 'text-amber-400' : 'text-red-400'
                      )}>{item.value}%</span>
                    </div>
                    <div className="h-2 rounded-full bg-surface-container-highest overflow-hidden">
                      <div
                        className={cn(
                          'h-full rounded-full transition-all',
                          item.value >= 80 ? 'bg-emerald-500' : item.value >= 60 ? 'bg-amber-500' : 'bg-red-500'
                        )}
                        style={{ width: `${item.value}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-sm">
            <Target className="h-4 w-4 text-indigo-400" /> {t('student1.progress.summary')}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-4 rounded-full bg-surface-container-highest overflow-hidden relative">
            <div
              className="h-full rounded-full bg-gradient-to-r from-indigo-500 via-indigo-400 to-emerald-400 transition-all duration-700"
              style={{ width: `${overallPct}%` }}
            />
          </div>
          <div className="mt-2 flex items-center justify-between text-xs text-muted">
            <span>0%</span>
            <span className="font-medium text-on-surface">{overallPct}% {t('student1.progress.complete')}</span>
            <span>100%</span>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
