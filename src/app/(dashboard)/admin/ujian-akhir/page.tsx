'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'
import {
  Plus, BookOpen, Loader2, FileText,
  CheckCircle, Edit3, Trash2, Eye, EyeOff,
  HelpCircle, AlignLeft, ListChecks, Clock, Send, Calendar
} from 'lucide-react'
import { createClient } from '@/lib/supabase-client'
import { useAuth } from '@/lib/auth-context'
import { useI18n } from '@/lib/i18n/client'
import { DashboardLayout } from '@/components/layout/dashboard-layout'
import type { FinalExam, Course, Language, LanguageLevel, User } from '@/types'

const LOCALE_MAP: Record<string, string> = {
  en: 'en-US',
  id: 'id-ID',
  zh: 'zh-CN',
}

interface EssayAnswer {
  question_id: string
  answer: string
  score: number | null
  feedback: string | null
}

interface ExamQuestion {
  id: string
  exam_id: string
  question_type: string
  question_text: string
  options: string[]
  correct_answer: string
  points: number
  sort_order: number
}

interface FinalExamFull extends FinalExam {
  starts_at?: string | null
  questions: ExamQuestion[]
  course?: Pick<Course, 'id' | 'title'>
}

interface ExamAttemptWithUser {
  id: string
  exam_id: string
  user_id: string
  score: number
  total_points: number
  answers: EssayAnswer[]
  essay_scores: Record<string, number>
  status: string
  passed?: boolean
  submitted_at: string
  user: User
}

function toDatetimeLocal(iso: string): string {
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function getCourseTitle(c: { title?: string | { id?: string; en?: string } } | undefined): string {
  if (!c || !c.title) return ''
  if (typeof c.title === 'string') return c.title
  const t = c.title as { id?: string; en?: string }
  return t.id || t.en || ''
}

export default function AdminFinalExamPage() {
  const { user, loading: authLoading } = useAuth()
  const supabase = createClient()
  const { t, lang } = useI18n()
  const locale = LOCALE_MAP[lang] || 'en-US'

  const [exams, setExams] = useState<FinalExamFull[]>([])
  const [courses, setCourses] = useState<Course[]>([])
  const [loadingExams, setLoadingExams] = useState(false)
  const [levelMap, setLevelMap] = useState<Record<string, LanguageLevel>>({})
  const [languageMap, setLanguageMap] = useState<Record<string, Language>>({})

  const [showExamEditor, setShowExamEditor] = useState(false)
  const [editingExam, setEditingExam] = useState<FinalExamFull | null>(null)
  const [examForm, setExamForm] = useState({
    title: '',
    description: '',
    course_id: '',
    time_limit_minutes: 60,
    passing_score: 65,
    starts_at: '',
  })
  const [examQuestions, setExamQuestions] = useState<ExamQuestion[]>([])
  const [savingExam, setSavingExam] = useState(false)

  const [examEssaySubmissions, setExamEssaySubmissions] = useState<Record<string, ExamAttemptWithUser[]>>({})
  const [loadingExamEssays, setLoadingExamEssays] = useState(false)
  const [examLocalScores, setExamLocalScores] = useState<Record<string, Record<string, { score: string; feedback: string }>>>({})
  const [savingExamScores, setSavingExamScores] = useState<Record<string, boolean>>({})

  useEffect(() => {
    if (authLoading || !user) return
    fetchCourses()
    fetchFinalExams()
    fetchExamEssayData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, user])

  async function fetchCourses() {
    const { data } = await supabase
      .from('courses')
      .select('id, title, language_code, level_id')
      .order('created_at', { ascending: false })
    if (data) setCourses(data as Course[])

    const [{ data: levels }, { data: langs }] = await Promise.all([
      supabase.from('language_levels').select('id, language_code, code, name'),
      supabase.from('languages').select('code, name, native_name, flag_emoji'),
    ])
    if (levels) setLevelMap(Object.fromEntries(levels.map(l => [l.id, l])))
    if (langs) setLanguageMap(Object.fromEntries(langs.map(l => [l.code, l])))
  }

  function getCourseLabel(c: Course): string {
    const title = c.title?.en || c.title?.id || t('admin2.ujianAkhir.untitled')
    const lang = languageMap[c.language_code]
    const level = levelMap[c.level_id]
    const langName = lang?.name?.en || c.language_code?.toUpperCase() || ''
    const levelName = level?.name?.en || ''
    return `${title} (${langName} - ${levelName})`
  }

  async function fetchFinalExams() {
    setLoadingExams(true)
    const { data } = await supabase
      .from('final_exams')
      .select('*, course:courses(id, title)')
      .order('created_at', { ascending: false })
    if (data) {
      const examIds = data.map((e) => (e as { id: string }).id)
      const { data: qData } = examIds.length
        ? await supabase.from('exam_questions_teacher').select('*').in('exam_id', examIds)
        : { data: null }
      const byExam = new Map<string, unknown[]>()
      for (const q of (qData as { exam_id: string }[]) || []) {
        const arr = byExam.get(q.exam_id) || []
        arr.push(q)
        byExam.set(q.exam_id, arr)
      }
      setExams(data.map((e: any) => ({
        ...e,
        time_limit_minutes: e.time_limit_minutes ?? 60,
        passing_score: e.passing_score ?? 65,
        questions: byExam.get((e as { id: string }).id) || [],
      })) as FinalExamFull[])
    }
    setLoadingExams(false)
  }

  async function fetchExamEssayData() {
    setLoadingExamEssays(true)
    const { data: examEssayQuestions } = await supabase
      .from('exam_questions_teacher')
      .select('exam_id')
      .eq('question_type', 'essay')

    if (examEssayQuestions && examEssayQuestions.length > 0) {
      const examIds = [...new Set(examEssayQuestions.map(q => q.exam_id))]

      const { data: examData } = await supabase
        .from('final_exams')
        .select('*')
        .in('id', examIds)

      if (examData) {
        const subMap: Record<string, ExamAttemptWithUser[]> = {}

        for (const ex of examData) {
          const examId = (ex as { id: string }).id
          const { data: resultData } = await supabase
            .from('exam_results')
            .select('*, user:users(*)')
            .eq('exam_id', examId)
            .in('status', ['submitted', 'graded'])
            .order('submitted_at', { ascending: true })

          if (resultData) {
            subMap[examId] = (resultData as unknown as ExamAttemptWithUser[]).map(r => ({
              ...r,
              answers: Array.isArray(r.answers) ? r.answers : (r.answers ? Object.entries(r.answers as Record<string, string>).map(([qId, ans]) => ({
                question_id: qId,
                answer: ans as string,
                score: r.essay_scores?.[qId] ?? null,
                feedback: null,
              })) : []),
              essay_scores: r.essay_scores || {},
              total_points: r.total_points || 0,
            }))
          }
        }

        setExamEssaySubmissions(subMap)
      }
    }
    setLoadingExamEssays(false)
  }

  function openCreateExam() {
    setEditingExam(null)
    setExamForm({ title: '', description: '', course_id: courses[0]?.id || '', time_limit_minutes: 60, passing_score: 65, starts_at: '' })
    setExamQuestions([])
    setShowExamEditor(true)
  }

  function openEditExam(exam: FinalExamFull) {
    setEditingExam(exam)
    setExamForm({
      title: exam.title,
      description: exam.description || '',
      course_id: exam.course_id,
      time_limit_minutes: exam.time_limit_minutes ?? 60,
      passing_score: exam.passing_score ?? 65,
      starts_at: exam.starts_at ? toDatetimeLocal(exam.starts_at) : '',
    })
    setExamQuestions(exam.questions || [])
    setShowExamEditor(true)
  }

  function addQuestion(type: 'multiple_choice' | 'essay') {
    const newQ: ExamQuestion = {
      id: `temp_${Date.now()}`,
      exam_id: editingExam?.id || '',
      question_type: type,
      question_text: '',
      options: type === 'multiple_choice' ? ['', '', '', ''] : [],
      correct_answer: '',
      points: 10,
      sort_order: examQuestions.length,
    }
    setExamQuestions(prev => [...prev, newQ])
  }

  function updateQuestion(index: number, field: keyof ExamQuestion, value: any) {
    setExamQuestions(prev => {
      const copy = [...prev]
      copy[index] = { ...copy[index], [field]: value }
      return copy
    })
  }

  function removeQuestion(index: number) {
    setExamQuestions(prev => prev.filter((_, i) => i !== index))
  }

  async function saveExam() {
    if (!examForm.title || !examForm.course_id) return
    setSavingExam(true)

    try {
      const startsAt = examForm.starts_at ? new Date(examForm.starts_at).toISOString() : null

      if (editingExam) {
        await supabase
          .from('final_exams')
          .update({
            title: examForm.title,
            description: examForm.description,
            course_id: examForm.course_id,
            time_limit_minutes: examForm.time_limit_minutes,
            passing_score: examForm.passing_score,
            starts_at: startsAt,
            updated_at: new Date().toISOString(),
          })
          .eq('id', editingExam.id)

        const existingIds = editingExam.questions?.map(q => q.id).filter(id => !id.startsWith('temp_')) || []
        const currentIds = examQuestions.map(q => q.id).filter(id => !id.startsWith('temp_'))
        const toDelete = existingIds.filter(id => !currentIds.includes(id))
        if (toDelete.length > 0) {
          await supabase.from('exam_questions').delete().in('id', toDelete)
        }

        for (let i = 0; i < examQuestions.length; i++) {
          const q = examQuestions[i]
          const payload = {
            exam_id: editingExam.id,
            question_type: q.question_type,
            question_text: q.question_text,
            options: q.options,
            correct_answer: q.correct_answer,
            points: q.points,
            sort_order: i,
          }

          if (q.id.startsWith('temp_')) {
            const { error } = await supabase.from('exam_questions').insert(payload)
            if (error) console.error('Insert question error:', error)
          } else {
            const { error } = await supabase.from('exam_questions').update(payload).eq('id', q.id)
            if (error) console.error('Update question error:', error)
          }
        }
      } else {
        const { data: newExam, error: examError } = await supabase
          .from('final_exams')
          .insert({
            course_id: examForm.course_id,
            teacher_id: null,
            title: examForm.title,
            description: examForm.description,
            time_limit_minutes: examForm.time_limit_minutes,
            passing_score: examForm.passing_score,
            starts_at: startsAt,
            status: 'draft',
            is_published: false,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .select('id')
          .single()

        if (examError) {
          console.error('Create exam error:', examError)
          setSavingExam(false)
          return
        }

        for (let i = 0; i < examQuestions.length; i++) {
          const q = examQuestions[i]
          const { error: qError } = await supabase
            .from('exam_questions')
            .insert({
              exam_id: newExam.id,
              question_type: q.question_type,
              question_text: q.question_text,
              options: q.options,
              correct_answer: q.correct_answer,
              points: q.points,
              sort_order: i,
            })
          if (qError) console.error('Insert question error:', qError)
        }
      }

      setShowExamEditor(false)
      fetchFinalExams()
      fetchExamEssayData()
    } catch (err) {
      console.error('Save exam error:', err)
    } finally {
      setSavingExam(false)
    }
  }

  async function togglePublish(exam: FinalExamFull, publish: boolean) {
    await supabase
      .from('final_exams')
      .update({ is_published: publish, status: publish ? 'active' : 'draft', updated_at: new Date().toISOString() })
      .eq('id', exam.id)
    fetchFinalExams()
  }

  async function deleteExam(examId: string) {
    if (!confirm(t('admin2.ujianAkhir.deleteExamConfirm'))) return
    await supabase.from('exam_questions').delete().eq('exam_id', examId)
    await supabase.from('exam_results').delete().eq('exam_id', examId)
    await supabase.from('final_exams').delete().eq('id', examId)
    fetchFinalExams()
    fetchExamEssayData()
  }

  function handleExamScoreChange(attemptId: string, questionId: string, field: 'score' | 'feedback', value: string) {
    setExamLocalScores(prev => ({
      ...prev,
      [attemptId]: {
        ...(prev[attemptId] || {}),
        [questionId]: {
          ...(prev[attemptId]?.[questionId] || { score: '', feedback: '' }),
          [field]: value,
        },
      },
    }))
  }

  async function saveExamEssayGrade(examId: string, attempt: ExamAttemptWithUser) {
    setSavingExamScores(prev => ({ ...prev, [attempt.id]: true }))
    try {
      const essayScores: Record<string, number> = { ...(attempt.essay_scores || {}) }
      for (const a of attempt.answers) {
        const local = examLocalScores[attempt.id]?.[a.question_id]
        if (local?.score !== undefined && local.score !== '') {
          essayScores[a.question_id] = Number(local.score)
        }
      }

      const totalEssayScore = Object.values(essayScores).reduce((sum, s) => sum + (s || 0), 0)

      const { data: examQuestions } = await supabase
        .from('exam_questions_teacher')
        .select('id, points, correct_answer, question_type')
        .eq('exam_id', examId)

      let mcScore = 0
      if (examQuestions) {
        for (const eq of examQuestions) {
          if (eq.question_type === 'essay') continue
          const answer = attempt.answers.find(a => a.question_id === eq.id)
          const correct = String(eq.correct_answer).trim()
          const given = String(answer?.answer || '').trim()
          if (given === correct) {
            mcScore += Number(eq.points)
          }
        }
      }

      const totalScore = mcScore + totalEssayScore

      const { data: examRow } = await supabase
        .from('final_exams')
        .select('passing_score')
        .eq('id', examId)
        .maybeSingle()
      const passingScore = Number(examRow?.passing_score) || 0
      const passed = passingScore > 0 ? totalScore >= passingScore : false

      const { data: gradedExam, error } = await supabase.rpc('grade_final_exam_essay', {
        p_attempt_id: attempt.id,
        p_essay_scores: essayScores,
      })

      if (!error) {
        setExamEssaySubmissions(prev => ({
          ...prev,
          [examId]: prev[examId].map(a => a.id === attempt.id ? {
            ...a,
            essay_scores: gradedExam?.essay_scores || essayScores,
            score: gradedExam?.score ?? totalScore,
            total_points: gradedExam?.total_points ?? attempt.total_points,
            status: gradedExam?.status || 'graded',
            passed: gradedExam?.passed ?? passed,
          } : a),
        }))
        setExamLocalScores(prev => { const copy = { ...prev }; delete copy[attempt.id]; return copy })
      }
    } catch (err) {
      console.error('Failed to save exam essay grade', err)
    } finally {
      setSavingExamScores(prev => ({ ...prev, [attempt.id]: false }))
    }
  }

  const examEssayQuestionsMap: Record<string, ExamQuestion[]> = {}
  for (const ex of exams) {
    const essayQs = ex.questions?.filter(q => q.question_type === 'essay') || []
    if (essayQs.length > 0) examEssayQuestionsMap[ex.id] = essayQs
  }

  if (authLoading) {
    return (
      <DashboardLayout role="admin">
        <div className="flex items-center justify-center min-h-[60vh]">
          <Loader2 className="h-8 w-8 text-indigo-400 animate-spin" />
        </div>
      </DashboardLayout>
    )
  }

  return (
    <DashboardLayout role="admin">
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-on-surface">{t('admin2.ujianAkhir.title')}</h1>
            <p className="text-on-surface-variant">{t('admin2.ujianAkhir.subtitle')}</p>
          </div>
          <Button size="sm" onClick={openCreateExam}><Plus className="mr-1 h-4 w-4" /> {t('admin2.ujianAkhir.createExam')}</Button>
        </div>

        {loadingExams ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-6 w-6 text-indigo-400 animate-spin" />
          </div>
        ) : exams.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-16">
              <BookOpen className="h-10 w-10 text-muted mb-3" />
              <p className="text-sm text-on-surface-variant">{t('admin2.ujianAkhir.emptyExam')}</p>
              <Button size="sm" className="mt-4" onClick={openCreateExam}><Plus className="mr-1 h-4 w-4" /> {t('admin2.ujianAkhir.createExam')}</Button>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {exams.map((ex) => {
              const mcCount = ex.questions?.filter(q => q.question_type === 'multiple_choice').length || 0
              const essayCount = ex.questions?.filter(q => q.question_type === 'essay').length || 0
              return (
                <Card key={ex.id}>
                  <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                    <div className="flex items-start gap-3 flex-1">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-indigo-500/10">
                        <BookOpen className="h-5 w-5 text-indigo-400" />
                      </div>
                      <div>
                        <h3 className="font-medium text-on-surface">{ex.title}</h3>
                        <div className="flex flex-wrap items-center gap-2 text-xs text-muted mt-1">
                          <span className="flex items-center gap-1"><BookOpen className="h-3 w-3" /> {getCourseTitle(ex.course)}</span>
                          <span className="flex items-center gap-1"><HelpCircle className="h-3 w-3" /> {t('admin2.ujianAkhir.questionCount', { count: ex.questions?.length || 0 })}</span>
                          {mcCount > 0 && <span className="text-indigo-400/70">{t('admin2.ujianAkhir.mcCount', { count: mcCount })}</span>}
                          {essayCount > 0 && <span className="text-amber-400/70">{t('admin2.ujianAkhir.essayCount', { count: essayCount })}</span>}
                          <span className="flex items-center gap-1"><Clock className="h-3 w-3" /> {t('admin2.ujianAkhir.timeLimit', { minutes: ex.time_limit_minutes })}</span>
                          {ex.starts_at && (
                            <span className="flex items-center gap-1">
                              <Calendar className="h-3 w-3" /> {t('admin1.batch.startDateLabel')}: {new Date(ex.starts_at).toLocaleString(locale)}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-wrap">
                      {ex.is_published ? (
                        <Badge variant="success">
                          <CheckCircle className="h-3 w-3 mr-0.5" /> {t('admin2.ujianAkhir.published')}
                        </Badge>
                      ) : (
                        <Badge variant="warning">
                          <EyeOff className="h-3 w-3 mr-0.5" /> {t('admin2.ujianAkhir.draft')}
                        </Badge>
                      )}
                      <Button size="sm" variant="ghost" onClick={() => openEditExam(ex)}>
                        <Edit3 className="h-3.5 w-3.5" />
                      </Button>
                      {ex.is_published ? (
                        <Button size="sm" variant="ghost" onClick={() => togglePublish(ex, false)}>
                          <EyeOff className="h-3.5 w-3.5 text-amber-400" />
                        </Button>
                      ) : (
                        <Button size="sm" variant="ghost" onClick={() => togglePublish(ex, true)}>
                          <Eye className="h-3.5 w-3.5 text-emerald-400" />
                        </Button>
                      )}
                      <Button size="sm" variant="ghost" onClick={() => deleteExam(ex.id)}>
                        <Trash2 className="h-3.5 w-3.5 text-red-400" />
                      </Button>
                    </div>
                  </div>
                </Card>
              )
            })}
          </div>
        )}

        {Object.keys(examEssaySubmissions).length > 0 && (
          <div className="space-y-6">
            <h2 className="text-lg font-bold text-on-surface">{t('admin2.ujianAkhir.examEssaysTab')}</h2>
            {renderExamEssayGrading()}
          </div>
        )}

        {showExamEditor && (
          <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/60 backdrop-blur-sm p-4">
            <div className="w-full max-w-3xl mt-8 mb-8 rounded-2xl border border-border bg-surface shadow-2xl">
              <div className="flex items-center justify-between border-b border-border px-6 py-4">
                <h2 className="text-lg font-bold text-on-surface">
                  {editingExam ? t('admin2.ujianAkhir.modalEditExam') : t('admin2.ujianAkhir.modalCreateExam')}
                </h2>
                <Button variant="ghost" size="sm" onClick={() => setShowExamEditor(false)}>✕</Button>
              </div>

              <div className="p-6 space-y-6 max-h-[75vh] overflow-y-auto">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="sm:col-span-2">
                    <Label required>{t('admin2.ujianAkhir.examTitleLabel')}</Label>
                    <Input
                      placeholder={t('admin2.ujianAkhir.examTitlePlaceholder')}
                      value={examForm.title}
                      onChange={e => setExamForm(prev => ({ ...prev, title: e.target.value }))}
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <Label>{t('admin2.ujianAkhir.descriptionLabel')}</Label>
                    <Textarea
                      placeholder={t('admin2.ujianAkhir.examDescPlaceholder')}
                      value={examForm.description}
                      onChange={e => setExamForm(prev => ({ ...prev, description: e.target.value }))}
                    />
                  </div>
                  <div>
                    <Label required>{t('admin2.ujianAkhir.courseLabel')}</Label>
                    <Select
                      value={examForm.course_id}
                      onChange={e => setExamForm(prev => ({ ...prev, course_id: e.target.value }))}
                    >
                      <option value="">{t('admin2.ujianAkhir.coursePlaceholder')}</option>
                      {courses.map(c => (
                        <option key={c.id} value={c.id}>{getCourseLabel(c)}</option>
                      ))}
                    </Select>
                  </div>
                  <div>
                    <Label>{t('admin1.batch.startDateLabel')}</Label>
                    <Input
                      type="datetime-local"
                      value={examForm.starts_at}
                      onChange={e => setExamForm(prev => ({ ...prev, starts_at: e.target.value }))}
                    />
                  </div>
                  <div>
                    <Label required>{t('admin2.ujianAkhir.timeLimitLabel')}</Label>
                    <Input
                      type="number"
                      min={1}
                      value={examForm.time_limit_minutes}
                      onChange={e => setExamForm(prev => ({ ...prev, time_limit_minutes: Number(e.target.value) }))}
                    />
                  </div>
                  <div>
                    <Label required>{t('admin2.ujianAkhir.passingScoreLabel')}</Label>
                    <Input
                      type="number"
                      min={0}
                      max={100}
                      value={examForm.passing_score}
                      onChange={e => setExamForm(prev => ({ ...prev, passing_score: Number(e.target.value) }))}
                    />
                  </div>
                </div>

                <div className="border-t border-border pt-6">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="font-semibold text-on-surface">{t('admin2.ujianAkhir.questionsTitle', { count: examQuestions.length })}</h3>
                    <div className="flex gap-2">
                      <Button size="sm" variant="outline" onClick={() => addQuestion('multiple_choice')}>
                        <ListChecks className="h-3.5 w-3.5 mr-1" /> {t('admin2.ujianAkhir.addMultipleChoice')}
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => addQuestion('essay')}>
                        <AlignLeft className="h-3.5 w-3.5 mr-1" /> {t('admin2.ujianAkhir.addEssay')}
                      </Button>
                    </div>
                  </div>

                  {examQuestions.length === 0 && (
                    <div className="rounded-lg border border-dashed border-border bg-surface-container-lowest p-8 text-center">
                      <HelpCircle className="h-8 w-8 text-muted mx-auto mb-2" />
                      <p className="text-sm text-on-surface-variant">{t('admin2.ujianAkhir.noQuestions')}</p>
                    </div>
                  )}

                  <div className="space-y-4">
                    {examQuestions.map((q, idx) => (
                      <div key={q.id} className="rounded-xl border border-border bg-surface-container-low p-4 space-y-3">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <Badge variant={q.question_type === 'essay' ? 'warning' : 'info'} size="sm">
                              {q.question_type === 'essay' ? t('admin2.ujianAkhir.questionBadgeEssay') : t('admin2.ujianAkhir.questionBadgeMc')}
                            </Badge>
                            <span className="text-xs text-muted">{t('admin2.ujianAkhir.questionNumber', { number: idx + 1 })}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <div className="flex items-center gap-1">
                              <Label className="text-xs">{t('admin2.ujianAkhir.pointsLabel')}</Label>
                              <Input
                                type="number"
                                min={1}
                                className="w-16 h-7 text-xs"
                                value={q.points}
                                onChange={e => updateQuestion(idx, 'points', Number(e.target.value))}
                              />
                            </div>
                            <Button size="sm" variant="ghost" onClick={() => removeQuestion(idx)}>
                              <Trash2 className="h-3.5 w-3.5 text-red-400" />
                            </Button>
                          </div>
                        </div>

                        <div>
                          <Label className="text-xs">{t('admin2.ujianAkhir.questionTextLabel')}</Label>
                          <Textarea
                            placeholder={t('admin2.ujianAkhir.questionTextPlaceholder')}
                            className="min-h-[60px]"
                            value={q.question_text}
                            onChange={e => updateQuestion(idx, 'question_text', e.target.value)}
                          />
                        </div>

                        {q.question_type === 'multiple_choice' && (
                          <>
                            <div className="space-y-2">
                              <Label className="text-xs">{t('admin2.ujianAkhir.optionsLabel')}</Label>
                              {(q.options || ['', '', '', '']).map((opt, oi) => (
                                <div key={oi} className="flex items-center gap-2">
                                  <span className="text-xs font-mono text-muted w-6">{String.fromCharCode(65 + oi)}.</span>
                                  <Input
                                    placeholder={t('admin2.ujianAkhir.optionPlaceholder', { letter: String.fromCharCode(65 + oi) })}
                                    value={opt}
                                    onChange={e => {
                                      const newOpts = [...(q.options || ['', '', '', ''])]
                                      newOpts[oi] = e.target.value
                                      updateQuestion(idx, 'options', newOpts)
                                    }}
                                  />
                                </div>
                              ))}
                            </div>
                            <div>
                              <Label className="text-xs">{t('admin2.ujianAkhir.correctAnswerLabel')}</Label>
                              <Select
                                value={q.correct_answer}
                                onChange={e => updateQuestion(idx, 'correct_answer', e.target.value)}
                              >
                                <option value="">{t('admin2.ujianAkhir.selectAnswerPlaceholder')}</option>
                                {(q.options || []).map((opt, oi) => (
                                  <option key={oi} value={opt}>{String.fromCharCode(65 + oi)}. {opt}</option>
                                ))}
                              </Select>
                            </div>
                          </>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-between border-t border-border px-6 py-4">
                <Button variant="ghost" onClick={() => setShowExamEditor(false)}>{t('admin2.ujianAkhir.cancel')}</Button>
                <Button onClick={saveExam} loading={savingExam}>
                  {editingExam ? t('admin2.ujianAkhir.saveChanges') : t('admin2.ujianAkhir.createExam')}
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  )

  function renderExamEssayGrading() {
    if (loadingExamEssays) {
      return (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-6 w-6 text-indigo-400 animate-spin" />
        </div>
      )
    }

    if (Object.keys(examEssaySubmissions).length === 0) {
      return (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16">
            <FileText className="h-10 w-10 text-muted mb-3" />
            <p className="text-sm text-on-surface-variant">{t('admin2.ujianAkhir.emptyExamEssays')}</p>
          </CardContent>
        </Card>
      )
    }

    return (
      <div className="space-y-6">
        {Object.entries(examEssaySubmissions).map(([examId, submissions]) => {
          const exam = exams.find(e => e.id === examId)
          const essayQs = examEssayQuestionsMap[examId] || []
          if (essayQs.length === 0) return null
          return (
            <Card key={examId}>
              <CardHeader>
                <CardTitle>{exam?.title || t('admin2.ujianAkhir.examTitleFallback')}</CardTitle>
                <p className="text-xs text-on-surface-variant">{getCourseTitle(exam?.course)}</p>
              </CardHeader>
              <CardContent className="space-y-6">
                {submissions.length === 0 ? (
                  <p className="text-sm text-muted py-4 text-center">{t('admin2.ujianAkhir.noSubmissions')}</p>
                ) : (
                  submissions.map((sub) => {
                    const subLocal = examLocalScores[sub.id] || {}
                    return (
                      <div key={sub.id} className="rounded-lg border border-border bg-background p-4 space-y-4">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 to-indigo-600 text-xs font-bold text-white">
                              {sub.user?.display_name?.[0] || '?'}
                            </div>
                            <div>
                              <span className="text-sm font-medium text-on-surface">{sub.user?.display_name || t('admin2.ujianAkhir.unknown')}</span>
                              <p className="text-xs text-muted">
                                {sub.submitted_at ? new Date(sub.submitted_at).toLocaleDateString(locale) : '-'}
                                {sub.status === 'graded' && t('admin2.ujianAkhir.graded')}
                              </p>
                            </div>
                          </div>
                          <Badge variant={sub.status === 'graded' ? 'success' : 'warning'}>
                            {sub.status === 'graded' ? t('admin2.ujianAkhir.scoreBadge', { score: sub.score }) : t('admin2.ujianAkhir.submitted')}
                          </Badge>
                        </div>

                        {essayQs.map((eq) => {
                          const answer = sub.answers?.find(a => a.question_id === eq.id)
                          const local = subLocal[eq.id] || {}
                          const currentScore = local.score !== undefined && local.score !== ''
                            ? local.score
                            : (sub.essay_scores?.[eq.id] ?? '')
                          return (
                            <div key={eq.id} className="ml-10 space-y-2 border-l-2 border-amber-500/20 pl-4">
                              <p className="text-sm font-medium text-on-surface">{eq.question_text}</p>
                              <div className="rounded-md bg-surface-container-highest p-3">
                                <p className="text-sm text-on-surface whitespace-pre-wrap">
                                  {answer?.answer || t('admin2.ujianAkhir.noAnswer')}
                                </p>
                              </div>
                              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                                <div>
                                  <Label className="text-xs">{t('admin2.ujianAkhir.scoreMax', { max: eq.points })}</Label>
                                  <Input
                                    type="number"
                                    max={eq.points}
                                    placeholder="0"
                                    value={currentScore}
                                    onChange={e => handleExamScoreChange(sub.id, eq.id, 'score', e.target.value)}
                                  />
                                </div>
                                <div className="sm:col-span-2">
                                  <Label className="text-xs">{t('admin2.ujianAkhir.feedbackLabel')}</Label>
                                  <Input
                                    placeholder={t('admin2.ujianAkhir.feedbackPlaceholder')}
                                    value={local.feedback !== undefined ? local.feedback : (answer?.feedback ?? '')}
                                    onChange={e => handleExamScoreChange(sub.id, eq.id, 'feedback', e.target.value)}
                                  />
                                </div>
                              </div>
                            </div>
                          )
                        })}

                        <div className="flex justify-end pt-2">
                          <Button
                            size="sm"
                            onClick={() => saveExamEssayGrade(examId, sub)}
                            loading={savingExamScores[sub.id]}
                          >
                            <Send className="h-3.5 w-3.5 mr-1" /> {t('admin2.ujianAkhir.saveGrade')}
                          </Button>
                        </div>
                      </div>
                    )
                  })
                )}
              </CardContent>
            </Card>
          )
        })}
      </div>
    )
  }
}