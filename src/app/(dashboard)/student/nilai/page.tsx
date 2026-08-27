'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { BookOpen, GraduationCap, Loader2, ChevronDown, ChevronUp, Activity, TrendingUp, Target, Award, ListChecks } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { createClient } from '@/lib/supabase-client'
import { useAuth } from '@/lib/auth-context'
import { useI18n } from '@/lib/i18n/client'
import { cn } from '@/lib/utils'
import type { Course, Enrollment, Assignment, Submission, Quiz, QuizAttempt, FinalExam, FinalExamAttempt } from '@/types'

const W_TASK = 0.5
const W_PROJECT = 0.2
const W_QUIZ = 0.05
const W_EXAM = 0.25

interface CourseGrade {
  course: Course
  enrollment: Enrollment
  taskScore: number
  projectScore: number
  quizAvg: number
  examScore: number
  overall: number
  expanded: boolean
}

const containerVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.1 } },
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

function getGradeLetter(val: number, t: (key: string) => string): { letter: string; color: string; label: string } {
  if (val >= 90) return { letter: 'A', color: 'text-emerald-400', label: t('student1.nilai.gradeExcellent') }
  if (val >= 80) return { letter: 'B', color: 'text-emerald-400', label: t('student1.nilai.gradeVeryGood') }
  if (val >= 70) return { letter: 'C', color: 'text-amber-400', label: t('student1.nilai.gradeGood') }
  if (val >= 60) return { letter: 'D', color: 'text-orange-400', label: t('student1.nilai.gradePoor') }
  return { letter: 'E', color: 'text-red-400', label: t('student1.nilai.gradeFail') }
}

function CircularProgress({ value, size = 80, strokeWidth = 6, t }: { value: number; size?: number; strokeWidth?: number; t: (key: string) => string }) {
  const radius = (size - strokeWidth) / 2
  const circumference = radius * 2 * Math.PI
  const offset = circumference - (Math.min(value, 100) / 100) * circumference
  const { letter: _letter, color } = getGradeLetter(value, t)

  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="oklch(0.26 0.01 290 / 0.3)"
          strokeWidth={strokeWidth}
        />
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={value >= 80 ? 'oklch(0.72 0.16 152)' : value >= 60 ? 'oklch(0.78 0.15 78)' : 'oklch(0.62 0.22 25)'}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          initial={{ strokeDashoffset: circumference }}
          animate={{ strokeDashoffset: offset }}
          transition={{ duration: 1.5, ease: 'easeOut' }}
        />
      </svg>
      <div className="absolute flex flex-col items-center">
        <span className={cn('text-lg font-bold leading-none', color)}>{Math.round(value)}</span>
        <span className="text-[10px] text-muted leading-none mt-0.5">%</span>
      </div>
    </div>
  )
}

export default function StudentNilaiPage() {
  const { user, loading: authLoading } = useAuth()
  const { t } = useI18n()
  const supabase = createClient()

  const [grades, setGrades] = useState<CourseGrade[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (authLoading || !user) return
    fetchGrades()
  }, [authLoading, user])

  async function fetchGrades() {
    setLoading(true)
    try {
      const { data: enrollments } = await supabase
        .from('enrollments')
        .select('*, course:courses(*)')
        .eq('user_id', user!.id)
        .in('status', ['active', 'completed'])

      if (!enrollments || enrollments.length === 0) {
        setGrades([])
        setLoading(false)
        return
      }

      const enrList = enrollments as (Enrollment & { course: Course })[]
      const courseIds = enrList.map(e => e.course_id)

      const [{ data: allQuizzes }, { data: allExams }, { data: allAssignments }, { data: allTasks }] = await Promise.all([
        supabase.from('quizzes').select('*').in('course_id', courseIds),
        supabase.from('final_exams').select('*').in('course_id', courseIds),
        supabase.from('assignments').select('*').in('course_id', courseIds),
        supabase.from('course_tasks').select('*, task_materials(id)').in('course_id', courseIds).eq('status', 'published'),
      ])

      const quizByCourse = new Map<string, Quiz[]>()
      for (const q of (allQuizzes || []) as Quiz[]) {
        const arr = quizByCourse.get(q.course_id) || []
        arr.push(q)
        quizByCourse.set(q.course_id, arr)
      }

      const examByCourse = new Map<string, FinalExam[]>()
      for (const e of (allExams || []) as FinalExam[]) {
        const arr = examByCourse.get(e.course_id) || []
        arr.push(e)
        examByCourse.set(e.course_id, arr)
      }

      const assignmentByCourse = new Map<string, Assignment[]>()
      for (const a of (allAssignments || []) as Assignment[]) {
        const arr = assignmentByCourse.get(a.course_id) || []
        arr.push(a)
        assignmentByCourse.set(a.course_id, arr)
      }

      const allQuizIds = (allQuizzes || []).map((q: Quiz) => q.id)
      const allExamIds = (allExams || []).map((e: FinalExam) => e.id)
      const allAssignmentIds = (allAssignments || []).map((a: Assignment) => a.id)
      const materialIds = (allTasks || []).flatMap((t: { task_materials?: { id: string }[] }) => (t.task_materials || []).map((m: { id: string }) => m.id))

      const [{ data: quizAttempts }, { data: examAttempts }, { data: submissions }, { data: materialProgress }, { data: allLmsTasks }, { data: lmsActivityProgress }] = await Promise.all([
        allQuizIds.length ? supabase.from('quiz_attempts').select('*, quiz:quizzes!inner(course_id)').eq('user_id', user!.id).in('quiz_id', allQuizIds) : { data: [] },
        allExamIds.length ? supabase.from('exam_results').select('*, exam:final_exams!inner(course_id)').eq('user_id', user!.id).in('exam_id', allExamIds) : { data: [] },
        allAssignmentIds.length ? supabase.from('submissions').select('*, assignment:assignments!inner(course_id)').eq('user_id', user!.id).in('assignment_id', allAssignmentIds) : { data: [] },
        materialIds.length ? supabase.from('student_material_progress').select('material_id, status').eq('user_id', user!.id).in('material_id', materialIds) : { data: [] },
        supabase.from('course_tasks').select('id, course_id').in('course_id', courseIds).eq('status', 'published'),
        supabase.from('student_activity_progress').select('task_id, score').eq('user_id', user!.id),
      ])

      const qAttempts = (quizAttempts || []) as (QuizAttempt & { quiz: { course_id: string } })[]
      const eAttempts = (examAttempts || []) as (FinalExamAttempt & { exam: { course_id: string } })[]
      const subList = (submissions || []) as (Submission & { assignment: { course_id: string } })[]
      const materialStatus = new Set((materialProgress || []).filter((p: { status: string }) => p.status === 'completed').map((p: { material_id: string }) => p.material_id))
      const lmsTasks = (allLmsTasks || []) as { id: string; course_id: string }[]
      const lmsProgress = (lmsActivityProgress || []) as { task_id: string; score: number }[]
      const lmsTaskByCourse = new Map<string, string[]>()
      for (const t of lmsTasks) {
        const arr = lmsTaskByCourse.get(t.course_id) || []
        arr.push(t.id)
        lmsTaskByCourse.set(t.course_id, arr)
      }

      const computed: CourseGrade[] = enrList.map(enr => {
        const course = enr.course
        const courseTasks = (allTasks || []).filter((t: { course_id: string }) => t.course_id === course.id) as { task_materials?: { id: string }[] }[]
        const taskTotal = courseTasks.reduce((sum, t) => sum + (t.task_materials || []).length, 0)
        const taskDone = courseTasks.reduce((sum, t) => sum + (t.task_materials || []).filter(m => materialStatus.has(m.id)).length, 0)
        const legacyTaskScore = taskTotal > 0 ? (taskDone / taskTotal) * 100 : 0

        const courseLmsTaskIds = lmsTaskByCourse.get(course.id) || []
        const courseLmsProgress = lmsProgress.filter(p => courseLmsTaskIds.includes(p.task_id) && p.score > 0)
        const lmsTaskScore = courseLmsProgress.length > 0
          ? courseLmsProgress.reduce((sum, p) => sum + p.score, 0) / courseLmsProgress.length
          : 0

        const taskScore = taskTotal > 0 || courseLmsTaskIds.length > 0
          ? ((legacyTaskScore * taskTotal) + (lmsTaskScore * courseLmsTaskIds.length)) / (taskTotal + courseLmsTaskIds.length || 1)
          : 100

        const courseAssignmentIds = (assignmentByCourse.get(course.id) || []).map(a => a.id)
        const courseSubs = subList.filter(s => courseAssignmentIds.includes(s.assignment_id) && s.grade != null)
        const projectScore = courseSubs.length > 0
          ? courseSubs.reduce((sum, s) => sum + (s.grade ?? 0), 0) / courseSubs.length
          : 0

        const courseQuizIds = (quizByCourse.get(course.id) || []).map(q => q.id)
        const courseQAttempts = qAttempts.filter(qa => courseQuizIds.includes(qa.quiz_id) && qa.score != null)
        const quizAvg = courseQAttempts.length > 0
          ? courseQAttempts.reduce((sum, qa) => sum + (qa.score ?? 0), 0) / courseQAttempts.length
          : 0

        const courseExamIds = (examByCourse.get(course.id) || []).map(e => e.id)
        const courseEAttempts = eAttempts.filter(ea => courseExamIds.includes(ea.exam_id) && ea.score != null)
        const examScore = courseEAttempts.length > 0
          ? courseEAttempts.reduce((sum, ea) => sum + (ea.score ?? 0), 0) / courseEAttempts.length
          : 0

        const overall = (taskScore * W_TASK) + (projectScore * W_PROJECT) + (quizAvg * W_QUIZ) + (examScore * W_EXAM)

        return {
          course,
          enrollment: enr,
          taskScore: Math.round(taskScore),
          projectScore: Math.round(projectScore),
          quizAvg: Math.round(quizAvg),
          examScore: Math.round(examScore),
          overall: Math.round(overall),
          expanded: false,
        }
      })

      setGrades(computed)
    } catch (err) {
      console.error('Failed to fetch grades', err)
    } finally {
      setLoading(false)
    }
  }

  function toggleExpand(index: number) {
    setGrades(prev => prev.map((g, i) => i === index ? { ...g, expanded: !g.expanded } : g))
  }

  function gradeColor(val: number) {
    if (val >= 80) return 'text-emerald-400'
    if (val >= 60) return 'text-amber-400'
    return 'text-red-400'
  }

  function gradeBarColor(val: number) {
    if (val >= 80) return 'bg-emerald-500'
    if (val >= 60) return 'bg-amber-500'
    return 'bg-red-500'
  }

  function overallBadge(val: number) {
    if (val >= 80) return 'success' as const
    if (val >= 60) return 'warning' as const
    return 'destructive' as const
  }

  const averageGrade = grades.length > 0 ? Math.round(grades.reduce((s, g) => s + g.overall, 0) / grades.length) : 0
  const passingCount = grades.filter(g => g.overall >= 60).length

  if (loading || authLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-10 w-10 text-indigo-400 animate-spin" />
          <p className="text-sm text-muted">{t('student1.nilai.loading')}</p>
        </div>
      </div>
    )
  }

  return (
    <motion.div
      className="space-y-6"
      variants={containerVariants}
      initial="hidden"
      animate="visible"
    >
      <motion.div variants={itemVariants} className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-indigo-500/10 via-indigo-500/5 to-emerald-500/10 border border-indigo-500/20 p-6">
        <div className="absolute top-0 right-0 w-64 h-64 bg-gradient-to-bl from-indigo-500/10 to-transparent rounded-full blur-3xl" />
        <div className="relative flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-on-surface">{t('student1.nilai.title')}</h1>
            <p className="text-on-surface-variant mt-1">{t('student1.nilai.subtitle')}</p>
          </div>
          <div className="hidden sm:flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-emerald-500 shadow-lg shadow-indigo-500/20">
            <Award className="h-6 w-6 text-white" />
          </div>
        </div>
      </motion.div>

      {grades.length > 0 ? (
        <>
          <motion.div
            className="grid gap-4 sm:grid-cols-3"
            variants={containerVariants}
            initial="hidden"
            animate="visible"
          >
            <motion.div variants={statVariants} custom={0}>
              <Card className="group hover:shadow-lg hover:shadow-indigo-500/5 transition-all duration-300">
                <CardContent className="flex items-center gap-4 p-4">
                  <div className="rounded-xl bg-gradient-to-br from-indigo-500 to-indigo-600 p-3 shadow-lg transition-all duration-300 group-hover:scale-110 group-hover:rotate-3">
                    <BookOpen className="h-5 w-5 text-white" />
                  </div>
                  <div>
                    <p className="text-xs text-on-surface-variant">{t('student1.nilai.statCourses')}</p>
                    <p className="text-2xl font-bold text-on-surface">{grades.length}</p>
                    <p className="text-[10px] text-muted mt-0.5">{t('student1.nilai.statCoursesDesc')}</p>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
            <motion.div variants={statVariants} custom={1}>
              <Card className="group hover:shadow-lg hover:shadow-indigo-500/5 transition-all duration-300">
                <CardContent className="flex items-center gap-4 p-4">
                  <div className="rounded-xl bg-gradient-to-br from-emerald-500 to-emerald-600 p-3 shadow-lg transition-all duration-300 group-hover:scale-110 group-hover:rotate-3">
                    <TrendingUp className="h-5 w-5 text-white" />
                  </div>
                  <div>
                    <p className="text-xs text-on-surface-variant">{t('student1.nilai.statAvg')}</p>
                    <p className={cn('text-2xl font-bold', gradeColor(averageGrade))}>{averageGrade}%</p>
                    <p className="text-[10px] text-muted mt-0.5">{getGradeLetter(averageGrade, t).letter} - {getGradeLetter(averageGrade, t).label}</p>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
            <motion.div variants={statVariants} custom={2}>
              <Card className="group hover:shadow-lg hover:shadow-indigo-500/5 transition-all duration-300">
                <CardContent className="flex items-center gap-4 p-4">
                  <div className="rounded-xl bg-gradient-to-br from-violet-500 to-violet-600 p-3 shadow-lg transition-all duration-300 group-hover:scale-110 group-hover:rotate-3">
                    <Target className="h-5 w-5 text-white" />
                  </div>
                  <div>
                    <p className="text-xs text-on-surface-variant">{t('student1.nilai.statPassing')}</p>
                    <p className="text-2xl font-bold text-on-surface">{passingCount}/{grades.length}</p>
                    <p className="text-[10px] text-muted mt-0.5">{t('student1.nilai.passRate', { count: grades.length > 0 ? Math.round((passingCount / grades.length) * 100) : 0 })}</p>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          </motion.div>

          <AnimatePresence>
            <motion.div className="space-y-4" variants={containerVariants} initial="hidden" animate="visible">
              {grades.map((g, i) => {
                const { letter, color: gradeColorClass, label } = getGradeLetter(g.overall, t)
                return (
                  <motion.div key={g.enrollment.id} variants={itemVariants} layout>
                    <Card className="overflow-hidden transition-all duration-300 hover:shadow-lg hover:shadow-indigo-500/5">
                      <div
                        className="p-4 sm:p-5 cursor-pointer hover:bg-surface-container-low transition-colors"
                        onClick={() => toggleExpand(i)}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-4 min-w-0">
                            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500/15 to-purple-500/15 ring-1 ring-indigo-500/20">
                              <BookOpen className="h-6 w-6 text-indigo-400" />
                            </div>
                            <div className="min-w-0">
                              <h3 className="font-semibold text-on-surface truncate">{g.course.title?.en || g.course.title?.id || 'Course'}</h3>
                              <div className="flex items-center gap-2 text-xs text-muted mt-0.5">
                                <span>{g.course.language_code?.toUpperCase()}</span>
                                <span className="w-1 h-1 rounded-full bg-muted" />
                                <Badge variant="outline" size="sm" className="text-[10px] capitalize">{g.enrollment.status}</Badge>
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center gap-4 shrink-0">
                            <div className="hidden sm:flex items-center gap-2">
                              <CircularProgress value={g.overall} size={56} strokeWidth={5} t={t} />
                            </div>
                            <div className="text-right">
                              <div className={cn('text-lg font-bold', gradeColorClass)}>{g.overall}%</div>
                              <div className="text-[10px] text-muted">{letter} - {label}</div>
                            </div>
                            <div className="flex flex-col items-center">
                              {g.expanded ? <ChevronUp className="h-4 w-4 text-muted" /> : <ChevronDown className="h-4 w-4 text-muted" />}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-3 mt-3 sm:hidden">
                          <CircularProgress value={g.overall} size={40} strokeWidth={4} t={t} />
                        </div>
                      </div>

                      <AnimatePresence>
                        {g.expanded && (
                          <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: 'auto', opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            transition={{ type: 'spring' as const, stiffness: 200, damping: 25 }}
                            className="overflow-hidden"
                          >
                            <div className="border-t border-border mx-4 sm:mx-5" />
                            <div className="p-4 sm:p-5 space-y-3">
                              {[
                                { label: t('student1.nilai.tasks'), weight: '50%', value: g.taskScore, icon: ListChecks },
                                { label: t('student1.nilai.project'), weight: '20%', value: g.projectScore, icon: Target },
                                { label: t('student1.nilai.quizzes'), weight: '5%', value: g.quizAvg, icon: Activity },
                                { label: t('student1.nilai.finalExam'), weight: '25%', value: g.examScore, icon: Award },
                              ].map(row => (
                                <div key={row.label} className="flex items-center gap-4">
                                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-surface-container-highest">
                                    <row.icon className="h-4 w-4 text-muted" />
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    <div className="flex items-center justify-between mb-1">
                                      <div className="flex items-center gap-2">
                                        <span className="text-sm font-medium text-on-surface">{row.label}</span>
                                        <span className="text-xs text-muted">({row.weight})</span>
                                      </div>
                                      <span className={cn('text-sm font-semibold', gradeColor(row.value))}>{row.value}%</span>
                                    </div>
                                    <div className="h-2 rounded-full bg-surface-container-highest overflow-hidden">
                                      <motion.div
                                        className={cn('h-full rounded-full transition-all', gradeBarColor(row.value))}
                                        initial={{ width: 0 }}
                                        animate={{ width: `${Math.min(row.value, 100)}%` }}
                                        transition={{ duration: 1, ease: 'easeOut', delay: 0.2 }}
                                      />
                                    </div>
                                  </div>
                                </div>
                              ))}

                              <div className="flex items-center justify-between pt-3 border-t border-border">
                                <div className="flex items-center gap-3">
                                  <span className="text-sm font-semibold text-on-surface">Total</span>
                                  <span className="text-xs text-muted">100%</span>
                                </div>
                                <div className="flex items-center gap-3">
                                  <span className={cn('text-lg font-bold', gradeColor(g.overall))}>{g.overall}%</span>
                                  <span className={cn('text-xs font-semibold', gradeColorClass)}>({letter})</span>
                                  <Badge variant={overallBadge(g.overall)}>
                                    {g.overall >= 80 ? t('student1.nilai.badgePass') : g.overall >= 60 ? t('student1.nilai.badgeGood') : t('student1.nilai.badgePoor')}
                                  </Badge>
                                </div>
                              </div>
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </Card>
                  </motion.div>
                )
              })}
            </motion.div>
          </AnimatePresence>
        </>
      ) : (
        <motion.div variants={itemVariants}>
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-16 text-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500/10 to-emerald-500/10 mb-4 ring-1 ring-indigo-500/20">
                <GraduationCap className="h-8 w-8 text-indigo-400" />
              </div>
              <h3 className="text-lg font-semibold text-on-surface mb-1">{t('student1.nilai.noGrades')}</h3>
              <p className="text-sm text-on-surface-variant max-w-sm">
                {t('student1.nilai.noGradesDesc')}
              </p>
            </CardContent>
          </Card>
        </motion.div>
      )}
    </motion.div>
  )
}
