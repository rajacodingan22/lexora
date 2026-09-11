'use client'

import { useEffect, useState, useMemo } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Search, Download, Loader2, ChevronLeft, GraduationCap } from 'lucide-react'
import { createClient } from '@/lib/supabase-client'
import { useAuth } from '@/lib/auth-context'
import { useI18n } from '@/lib/i18n/client'
import type { Course, Enrollment, User, GradeAggregate } from '@/types'

interface StudentGrade {
  user: User
  enrollment: Enrollment
  grade: GradeAggregate | null
  projectScore: number
  quizAvg: number
  examScore: number
  overall: number
}

export default function TeacherNilaiPage() {
  const { user, loading: authLoading } = useAuth()
  const { t } = useI18n()
  const supabase = useMemo(() => createClient(), [])

  const [courses, setCourses] = useState<Course[]>([])
  const [selectedCourseId, setSelectedCourseId] = useState('')
  const [batches, setBatches] = useState<{ id: string; name: string | null; status: string; current_students: number; capacity: number }[]>([])
  const [selectedBatchId, setSelectedBatchId] = useState('')
  const [teacherRowId, setTeacherRowId] = useState('')
  const [students, setStudents] = useState<StudentGrade[]>([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [loadingGrades, setLoadingGrades] = useState(false)
  const [selectedStudent, setSelectedStudent] = useState<StudentGrade | null>(null)

  useEffect(() => {
    if (authLoading || !user) return
    fetchCourses()
  }, [authLoading, user])

  useEffect(() => {
    if (!selectedCourseId || !teacherRowId) return
    fetchBatches(selectedCourseId)
  }, [selectedCourseId, teacherRowId])

  useEffect(() => {
    if (!selectedBatchId) return
    fetchGrades()
  }, [selectedBatchId])

  async function fetchBatches(courseId: string) {
    const { data } = await supabase
      .from('batches')
      .select('id, name, status, current_students, capacity')
      .eq('course_id', courseId)
      .eq('teacher_id', teacherRowId)
      .order('start_date', { ascending: true })

    const list = (data || []) as { id: string; name: string | null; status: string; current_students: number; capacity: number }[]
    setBatches(list)
    setSelectedBatchId(list[0]?.id || '')
  }

  async function fetchCourses() {
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

      setTeacherRowId(teacherRow.id)

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

      const { data } = await supabase
        .from('courses')
        .select('*')
        .in('id', courseIds)

      const cList = (data || []) as Course[]
      setCourses(cList)
      if (cList.length > 0) {
        setSelectedCourseId(cList[0].id)
      }
    } catch (err) {
      console.error('Failed to fetch courses', err)
    } finally {
      setLoading(false)
    }
  }

  async function fetchGrades() {
    setLoadingGrades(true)
    setSelectedStudent(null)
    try {
      const { data: enrollments } = await supabase
        .from('enrollments')
        .select('*, user:users(*)')
        .eq('course_id', selectedCourseId)
        .eq('batch_id', selectedBatchId)
        .in('status', ['active', 'completed'])

      if (!enrollments || enrollments.length === 0) {
        setStudents([])
        setLoadingGrades(false)
        return
      }

      const enrList = enrollments as (Enrollment & { user: User })[]

      // Fetch grade_aggregates for all enrollments (computed by DB calculate_grade())
      const enrollmentIds = enrList.map(e => e.id)
      const { data: gradeRows } = await supabase
        .from('grade_aggregates')
        .select('*')
        .in('enrollment_id', enrollmentIds)

      const gradeMap = new Map<string, GradeAggregate>()
      for (const row of (gradeRows || []) as GradeAggregate[]) {
        gradeMap.set(row.enrollment_id, row)
      }

      const result: StudentGrade[] = enrList.map(enr => {
        const g = gradeMap.get(enr.id) ?? null
        return {
          user: enr.user,
          enrollment: enr,
          grade: g,
          projectScore: g?.assignment_average ?? 0,
          quizAvg: g?.quiz_average ?? 0,
          examScore: g?.final_exam_score ?? 0,
          overall: g?.weighted_total ?? 0,
        }
      })

      setStudents(result)
    } catch (err) {
      console.error('Failed to fetch grades', err)
    } finally {
      setLoadingGrades(false)
    }
  }

  function gradeColor(val: number) {
    if (val >= 80) return 'text-emerald-400'
    if (val >= 60) return 'text-amber-400'
    return 'text-red-400'
  }

  const selectedBatch = batches.find(b => b.id === selectedBatchId) || null

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

  const filtered = students.filter(s =>
    !search || s.user.display_name?.toLowerCase().includes(search.toLowerCase()) || s.user.email?.toLowerCase().includes(search.toLowerCase())
  )

  if (loading || authLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="h-8 w-8 text-indigo-400 animate-spin" />
      </div>
    )
  }

  if (selectedStudent) {
    const s = selectedStudent
    return (
      <div className="space-y-6">
        <Button variant="ghost" size="sm" onClick={() => setSelectedStudent(null)}>
          <ChevronLeft className="mr-1 h-4 w-4" /> {t('teacher1.nilai.back')}
        </Button>
        <Card>
          <CardHeader>
            <div className="flex items-center gap-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 to-indigo-600 text-lg font-bold text-white">
                {s.user.display_name?.[0] || '?'}
              </div>
              <div>
                <CardTitle>{s.user.display_name || t('teacher1.nilai.studentFallback')}</CardTitle>
                <CardDescription>{s.user.email}</CardDescription>
              </div>
              <div className="ml-auto">
                <span className={`text-3xl font-bold ${gradeColor(s.overall)}`}>{Math.round(s.overall)}%</span>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {[
                { label: t('teacher1.nilai.project'), value: s.projectScore, weight: '30%' },
                { label: t('teacher1.nilai.quiz'), value: s.quizAvg, weight: '20%' },
                { label: t('teacher1.nilai.finalExam'), value: s.examScore, weight: '50%' },
              ].map(row => (
                <div key={row.label}>
                  <div className="flex items-center justify-between text-sm mb-1">
                    <span className="text-on-surface">{row.label} <span className="text-muted">({row.weight})</span></span>
                    <span className={`font-semibold ${gradeColor(row.value)}`}>{Math.round(row.value)}%</span>
                  </div>
                  <div className="h-2.5 rounded-full bg-surface-container-highest overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${row.value >= 80 ? 'bg-emerald-500' : row.value >= 60 ? 'bg-amber-500' : 'bg-red-500'}`}
                      style={{ width: `${Math.min(row.value, 100)}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>

            {s.grade?.grade_letter && (
              <div className="mt-4 rounded-xl bg-surface-container-low p-4 border border-border">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-on-surface-variant">{t('teacher1.nilai.gradeLetter')}</span>
                  <span className="text-2xl font-bold text-on-surface">{s.grade.grade_letter}</span>
                </div>
                <div className="flex items-center justify-between mt-1">
                  <span className="text-sm text-on-surface-variant">{t('teacher1.nilai.gradePoints')}</span>
                  <span className="font-semibold text-on-surface">{s.grade.grade_points}</span>
                </div>
                <div className="flex items-center justify-between mt-1">
                  <span className="text-sm text-on-surface-variant">{t('teacher1.nilai.passStatus')}</span>
                  <Badge variant={s.grade.is_passing ? 'success' : 'outline'}>
                    {s.grade.is_passing ? t('teacher1.nilai.passing') : t('teacher1.nilai.notPassing')}
                  </Badge>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-on-surface">{t('teacher1.nilai.title')}</h1>
          <p className="text-on-surface-variant">{t('teacher1.nilai.subtitle')}</p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-col items-stretch gap-4 sm:flex-row sm:items-center">
            <div className="relative flex-1 max-w-md w-full">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted" />
              <input
                className="w-full rounded-lg border border-border bg-background py-2 pl-10 pr-4 text-sm text-on-surface placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
                placeholder={t('teacher1.nilai.searchPlaceholder')}
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
            </div>
            <select
              className="rounded-lg border border-border bg-background px-3 py-2 text-sm text-on-surface focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
              value={selectedCourseId}
              onChange={e => setSelectedCourseId(e.target.value)}
            >
              {courses.map(c => (
                <option key={c.id} value={c.id}>{c.title?.en || c.title?.id || t('teacher1.nilai.untitled')}</option>
              ))}
            </select>
            <select
              className="rounded-lg border border-border bg-background px-3 py-2 text-sm text-on-surface focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
              value={selectedBatchId}
              onChange={e => setSelectedBatchId(e.target.value)}
            >
              {batches.map(b => (
                <option key={b.id} value={b.id}>
                  {b.name || t('teacher1.kelas.untitledBatch')} ({b.current_students}/{b.capacity})
                </option>
              ))}
            </select>
          </div>
          {selectedBatch && (
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <Badge variant={batchStatusVariant(selectedBatch.status)}>
                {batchStatusLabel(selectedBatch.status)}
              </Badge>
              <span className="text-xs text-on-surface-variant">
                {t('teacher1.nilai.batchStudents', { count: selectedBatch.current_students, capacity: selectedBatch.capacity })}
              </span>
            </div>
          )}
        </CardHeader>
        <CardContent>
          {batches.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <GraduationCap className="h-10 w-10 text-muted mb-3" />
              <p className="text-sm text-on-surface-variant max-w-sm">
                {t('teacher1.nilai.noBatchAssigned')}
              </p>
            </div>
          ) : loadingGrades ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 text-indigo-400 animate-spin" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <GraduationCap className="h-10 w-10 text-muted mb-3" />
              <p className="text-sm text-on-surface-variant">
                {students.length === 0 ? t('teacher1.nilai.noStudents') : t('teacher1.nilai.noMatch')}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs text-muted uppercase">
                    <th className="pb-3 pr-4 font-medium">{t('teacher1.nilai.colStudent')}</th>
                    <th className="pb-3 pr-4 font-medium">{t('teacher1.nilai.colProject')}</th>
                    <th className="pb-3 pr-4 font-medium">{t('teacher1.nilai.colQuiz')}</th>
                    <th className="pb-3 pr-4 font-medium">{t('teacher1.nilai.colExam')}</th>
                    <th className="pb-3 pr-2 font-medium">{t('teacher1.nilai.colTotal')}</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(s => (
                    <tr
                      key={s.user.id}
                      className="border-b border-border last:border-0 cursor-pointer hover:bg-surface-container-low transition-colors"
                      onClick={() => setSelectedStudent(s)}
                    >
                      <td className="py-3 pr-4">
                        <div className="flex items-center gap-2">
                          <div className="flex h-7 w-7 items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 to-indigo-600 text-[10px] font-bold text-white">
                            {s.user.display_name?.[0] || '?'}
                          </div>
                          <div>
                            <span className="text-on-surface">{s.user.display_name || t('teacher1.nilai.studentFallback')}</span>
                            <p className="text-xs text-muted">{s.user.email}</p>
                          </div>
                        </div>
                      </td>
                      <td className={`py-3 pr-4 font-medium ${gradeColor(s.projectScore)}`}>{Math.round(s.projectScore)}%</td>
                      <td className={`py-3 pr-4 font-medium ${gradeColor(s.quizAvg)}`}>{Math.round(s.quizAvg)}%</td>
                      <td className={`py-3 pr-4 font-medium ${gradeColor(s.examScore)}`}>{Math.round(s.examScore)}%</td>
                      <td className={`py-3 pr-2 font-bold ${gradeColor(s.overall)}`}>{Math.round(s.overall)}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
