'use client'

import { useEffect, useState, useRef, useMemo } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/lib/auth-context'
import { createClient } from '@/lib/supabase-client'
import { useI18n } from '@/lib/i18n/client'
import { formatDateOnly } from '@/lib/utils'
import {
  Clock, AlertTriangle, CheckCircle, XCircle, Flag,
  ChevronLeft, ChevronRight, Play, FileText, BarChart3,
  Award, Loader2, HelpCircle
} from 'lucide-react'
import type { FinalExam, Course } from '@/types'

interface ExamQuestion {
  id: string
  exam_id: string
  question_type: string
  question_text: { id: string; en: string }
  options: string[] | { id?: string; en?: string; label?: string }[]
  correct_answer: string | string[]
  points: number
  sort_order: number
}

interface ExamResult {
  id: string
  exam_id: string
  user_id: string
  course_id: string
  score: number
  total_points: number
  answers: Record<string, string | string[]>
  essay_scores: Record<string, number>
  submitted_at: string
  status: string
  passed?: boolean
}

interface ReviewItem {
  id: string
  question_type: string
  question_text: string
  options: unknown
  correct_answer: string | string[]
  points: number
}

type PageState = 'loading' | 'info' | 'taking' | 'submitting' | 'result' | 'taken'

function shuffleArray<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

function getQuestionText(q: ExamQuestion): string {
  if (typeof q.question_text === 'string') return q.question_text
  return q.question_text?.id || q.question_text?.en || ''
}

function getOptionLabel(opt: string | { id?: string; en?: string; label?: string }): string {
  if (typeof opt === 'string') return opt
  return opt.label || opt.en || opt.id || ''
}

function getOptionValue(opt: string | { id?: string; en?: string; label?: string }): string {
  if (typeof opt === 'string') return opt
  return opt.id || opt.en || opt.label || ''
}

export default function ExamPage() {
  const params = useParams()
  const router = useRouter()
  const { user } = useAuth()
  const { t, lang } = useI18n()
  const locale = lang === 'en' ? 'en-US' : lang === 'zh' ? 'zh-CN' : 'id-ID'
  const supabase = createClient()
  const courseId = params.id as string

  const [pageState, setPageState] = useState<PageState>('loading')
  const [exam, setExam] = useState<FinalExam | null>(null)
  const [course, setCourse] = useState<Pick<Course, 'title' | 'language_code'> | null>(null)
  const [questions, setQuestions] = useState<ExamQuestion[]>([])
  const [shuffledQuestions, setShuffledQuestions] = useState<ExamQuestion[]>([])
  const [existingResult, setExistingResult] = useState<ExamResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  const [currentIndex, setCurrentIndex] = useState(0)
  const [answers, setAnswers] = useState<Record<string, string | string[]>>({})
  const [flagged, setFlagged] = useState<Set<string>>(new Set())
  const [timeLeft, setTimeLeft] = useState(0)
  const [examResult, setExamResult] = useState<{
    score: number
    total_points: number
    percentage: number
    passed: boolean
    breakdown: { question: ExamQuestion; selected: string | string[]; correct: boolean }[]
  } | null>(null)
  const [generatingCert, setGeneratingCert] = useState(false)
  const [certError, setCertError] = useState<string | null>(null)

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const totalPoints = useMemo(
    () => shuffledQuestions.reduce((acc, q) => acc + q.points, 0),
    [shuffledQuestions]
  )

  useEffect(() => {
    if (!user || !courseId) return
    loadExam()
    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
    }
  }, [user, courseId])

  async function loadExam() {
    setPageState('loading')

    const { data: courseData } = await supabase
      .from('courses')
      .select('title, language_code')
      .eq('id', courseId)
      .single()
    setCourse(courseData as Pick<Course, 'title' | 'language_code'> | null)

    const { data: examData } = await supabase
      .from('final_exams')
      .select('*')
      .eq('course_id', courseId)
      .single()

    if (!examData) {
      setError(t('student2.exam.notFound'))
      setPageState('result')
      return
    }

    setExam(examData as FinalExam)

    const { data: examQuestions } = await supabase
      .from('exam_questions_student')
      .select('*')
      .eq('exam_id', examData.id)
      .order('sort_order', { ascending: true })

    const qs = (examQuestions as ExamQuestion[]) || []
    setQuestions(qs)
    if (qs.length > 0) {
      setShuffledQuestions(shuffleArray(qs))
    }

    const { data: resultData } = await supabase
      .from('exam_results')
      .select('*')
      .eq('exam_id', examData.id)
      .eq('user_id', user!.id)
      .maybeSingle()

    if (resultData) {
      setExistingResult(resultData as ExamResult)
      const res = resultData as ExamResult
      // Kunci jawaban hanya via RPC review (khusus pemilik attempt)
      const { data: reviewData } = await supabase.rpc('get_exam_review', {
        p_attempt_id: res.id,
      })
      const reviewItems = ((reviewData as { items?: ReviewItem[] } | null)?.items) || []
      const correctMap = new Map(reviewItems.map((i) => [i.id, i.correct_answer]))
      const breakdown = qs.map((q) => {
        const selected = res.answers[q.id]
        const isEssay = q.question_type === 'essay'
        const isCorrect = isEssay ? false : checkAnswer(q, selected, correctMap.get(q.id))
        return { question: q, selected: selected ?? '', correct: isCorrect }
      })
      const mcEarned = breakdown.reduce((acc, b) => acc + (b.correct ? b.question.points : 0), 0)
      const essayEarned = qs
        .filter(q => q.question_type === 'essay')
        .reduce((acc, q) => acc + (Number(res.essay_scores?.[q.id]) || 0), 0)
      const totalEarned = mcEarned + essayEarned
      setExamResult({
        score: totalEarned,
        total_points: totalPoints,
        percentage: totalPoints > 0 ? Math.round((totalEarned / totalPoints) * 100) : 0,
        passed: res.status === 'passed' || res.passed === true,
        breakdown,
      })
      setPageState('taken')
      return
    }

    setPageState('info')
  }

  function checkAnswer(question: ExamQuestion, selected: string | string[] | null | undefined, correctOverride?: string | string[]): boolean {
    if (!selected) return false
    const correct = correctOverride ?? question.correct_answer
    if (correct === undefined) return false
    if (Array.isArray(correct)) {
      const sel = Array.isArray(selected) ? selected : [selected]
      if (correct.length !== sel.length) return false
      return correct.every((c) => sel.includes(c))
    }
    const sel = Array.isArray(selected) ? selected[0] : selected
    return String(sel) === String(correct)
  }

  function startExam() {
    const duration = (exam?.time_limit_minutes || 60) * 60
    setTimeLeft(duration)
    setPageState('taking')
    timerRef.current = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          if (timerRef.current) clearInterval(timerRef.current)
          handleSubmit()
          return 0
        }
        return prev - 1
      })
    }, 1000)
  }

  function formatTime(seconds: number): string {
    const m = Math.floor(seconds / 60)
    const s = seconds % 60
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
  }

  function handleAnswer(questionId: string, answer: string | string[]) {
    setAnswers((prev) => ({ ...prev, [questionId]: answer }))
  }

  function handleMultipleChoice(questionId: string, option: string) {
    setAnswers((prev) => ({ ...prev, [questionId]: option }))
  }

  function handleMultiSelect(questionId: string, optionValue: string) {
    setAnswers((prev) => {
      const current = (prev[questionId] as string[]) || []
      const idx = current.indexOf(optionValue)
      let next: string[]
      if (idx >= 0) {
        next = current.filter((v) => v !== optionValue)
      } else {
        next = [...current, optionValue]
      }
      return { ...prev, [questionId]: next }
    })
  }

  function toggleFlag(questionId: string) {
    setFlagged((prev) => {
      const next = new Set(prev)
      if (next.has(questionId)) next.delete(questionId)
      else next.add(questionId)
      return next
    })
  }

  async function handleSubmit() {
    if (timerRef.current) clearInterval(timerRef.current)
    setPageState('submitting')

    // Submit via RPC: skor dihitung server-side, klien tidak bisa memalsukan
    const { data: rowData, error: submitError } = await supabase.rpc('submit_final_exam', {
      p_exam_id: exam!.id,
      p_answers: answers,
    })

    if (submitError) {
      console.error('Failed to save exam result:', submitError)
      setError(t('student2.exam.submitFailed'))
      setPageState('taking')
      return
    }

    const res = (rowData as unknown as ExamResult) || null
    const hasEssay = shuffledQuestions.some(q => q.question_type === 'essay')
    const passed = !!res?.passed

    let breakdown: { question: ExamQuestion; selected: string | string[]; correct: boolean }[]
    if (res?.id) {
      const { data: reviewData } = await supabase.rpc('get_exam_review', {
        p_attempt_id: res.id,
      })
      const reviewItems = ((reviewData as { items?: ReviewItem[] } | null)?.items) || []
      const correctMap = new Map(reviewItems.map((i) => [i.id, i.correct_answer]))
      breakdown = shuffledQuestions.map((q) => {
        const selected = answers[q.id] ?? ''
        const isEssay = q.question_type === 'essay'
        return { question: q, selected, correct: isEssay ? false : checkAnswer(q, selected, correctMap.get(q.id)) }
      })
    } else {
      breakdown = shuffledQuestions.map((q) => {
        const selected = answers[q.id] ?? ''
        return { question: q, selected, correct: false }
      })
    }

    const resScore = res?.score ?? 0
    const resTotal = res?.total_points ?? totalPoints
    setExamResult({
      score: resScore,
      total_points: resTotal,
      percentage: resTotal > 0 ? Math.round((resScore / resTotal) * 100) : 0,
      passed,
      breakdown,
    })
    setPageState('result')
  }

  async function generateCertificate() {
    setGeneratingCert(true)
    setCertError(null)
    try {
      const res = await fetch('/api/certificates/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          course_id: courseId,
          language_code: course?.language_code || 'en',
        }),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok) {
        setCertError(data?.error || t('student2.exam.certGenerateFailed'))
        setGeneratingCert(false)
        return
      }
      router.push('/student/sertifikat')
    } catch {
      setGeneratingCert(false)
    }
  }

  function getOptionInputType(question: ExamQuestion): 'radio' | 'checkbox' | 'text' {
    if (question.question_type === 'multiple_choice' || question.question_type === 'true_false') return 'radio'
    if (question.question_type === 'multi_select') return 'checkbox'
    if (question.question_type === 'essay') return 'text'
    const correct = question.correct_answer
    if (Array.isArray(correct)) return 'checkbox'
    return 'radio'
  }

  if (pageState === 'loading') {
    return (
      <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 text-indigo-400 animate-spin" />
        </div>
    )
  }

  if (pageState === 'info' && exam) {
    return (
      <div className="max-w-2xl mx-auto space-y-6">
          <div>
            <h1 className="text-2xl font-bold text-on-surface">{exam.title}</h1>
            <p className="text-on-surface-variant">
              {course ? (typeof course.title === 'string' ? course.title : course.title?.id || course.title?.en || '') : ''}
            </p>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5 text-indigo-400" />
                {t('student2.exam.title')}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {exam.description && (
                <p className="text-sm text-on-surface-variant">{exam.description}</p>
              )}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <div className="rounded-lg bg-surface-container-low p-4 text-center">
                  <HelpCircle className="h-5 w-5 text-indigo-400 mx-auto mb-1" />
                  <p className="text-2xl font-bold text-on-surface">{shuffledQuestions.length}</p>
                  <p className="text-xs text-muted">{t('student2.exam.questions')}</p>
                </div>
                <div className="rounded-lg bg-surface-container-low p-4 text-center">
                  <Clock className="h-5 w-5 text-amber-400 mx-auto mb-1" />
                  <p className="text-2xl font-bold text-on-surface">{exam.time_limit_minutes || 60}</p>
                  <p className="text-xs text-muted">{t('student2.exam.minutes')}</p>
                </div>
                <div className="rounded-lg bg-surface-container-low p-4 text-center">
                  <BarChart3 className="h-5 w-5 text-emerald-400 mx-auto mb-1" />
                  <p className="text-2xl font-bold text-on-surface">{exam.passing_score}%</p>
                  <p className="text-xs text-muted">{t('student2.exam.passingScore')}</p>
                </div>
                <div className="rounded-lg bg-surface-container-low p-4 text-center">
                  <Award className="h-5 w-5 text-purple-400 mx-auto mb-1" />
                  <p className="text-2xl font-bold text-on-surface">{totalPoints}</p>
                  <p className="text-xs text-muted">{t('student2.exam.totalPoints')}</p>
                </div>
              </div>

              <div className="rounded-lg bg-amber-500/10 border border-amber-500/20 p-4 flex items-start gap-3">
                <AlertTriangle className="h-5 w-5 text-amber-400 shrink-0 mt-0.5" />
                <div className="text-sm text-amber-200">
                  <p className="font-medium">{t('student2.exam.importantInstructions')}</p>
                  <ul className="mt-1 list-disc list-inside text-amber-200/70 space-y-0.5">
                    <li>{t('student2.exam.instruction1')}</li>
                    <li>{t('student2.exam.instruction2')}</li>
                    <li>{t('student2.exam.instruction3')}</li>
                    <li>{t('student2.exam.instruction4')}</li>
                  </ul>
                </div>
              </div>
            </CardContent>
          </Card>

          <div className="flex justify-between">
            <Button variant="ghost" onClick={() => router.back()}>
              <ChevronLeft className="mr-1 h-4 w-4" /> {t('student2.exam.back')}
            </Button>
            <Button size="lg" onClick={startExam}>
              <Play className="mr-2 h-4 w-4" /> {t('student2.exam.startExam')}
            </Button>
          </div>
        </div>
    )
  }

  if (pageState === 'taken' && existingResult) {
    const hasEssay = questions.some(q => q.question_type === 'essay')
    const isGraded = existingResult.status === 'passed' || existingResult.status === 'failed' || existingResult.status === 'graded'
    return (
      <div className="max-w-2xl mx-auto space-y-6">
          <div>
            <h1 className="text-2xl font-bold text-on-surface">{exam?.title || t('student2.exam.title')}</h1>
            <p className="text-on-surface-variant">{t('student2.exam.alreadyCompleted')}</p>
          </div>

          <Card>
            <CardContent className="py-8">
              <div className="text-center">
                <div className={`inline-flex items-center justify-center w-20 h-20 rounded-full mb-4 ${
                  isGraded ? (existingResult.status === 'passed' ? 'bg-emerald-500/20' : 'bg-red-500/20') : 'bg-amber-500/20'
                }`}>
                  {isGraded ? (
                    existingResult.status === 'passed' ? (
                      <CheckCircle className="h-10 w-10 text-emerald-400" />
                    ) : (
                      <XCircle className="h-10 w-10 text-red-400" />
                    )
                  ) : (
                    <Clock className="h-10 w-10 text-amber-400" />
                  )}
                </div>
                <h2 className="text-2xl font-bold text-on-surface">
                  {hasEssay && !isGraded
                    ? t('student2.exam.waitingGrading')
                    : existingResult.status === 'passed' ? t('student2.exam.passed') : t('student2.exam.failed')
                  }
                </h2>
                <p className="text-sm text-on-surface-variant mt-1">
                  {hasEssay && !isGraded
                    ? t('student2.exam.awaitingGradingDesc')
                    : ''
                  }
                </p>
                <div className="mt-4 flex flex-wrap items-center justify-center gap-x-6 gap-y-3 text-sm text-on-surface-variant">
                  {isGraded && (
                    <>
                      <div className="text-center">
                        <p className="text-3xl font-bold text-indigo-400">{examResult?.percentage || 0}%</p>
                        <p className="text-xs mt-1">{t('student2.exam.score')}</p>
                      </div>
                      <div className="w-px h-12 bg-border" />
                    </>
                  )}
                  <div className="text-center">
                    <p className="text-3xl font-bold text-on-surface">{examResult?.score || 0}/{examResult?.total_points || 0}</p>
                    <p className="text-xs mt-1">{t('student2.exam.points')}</p>
                  </div>
                  <div className="w-px h-12 bg-border" />
                  <div className="text-center">
                    <p className="text-3xl font-bold text-on-surface">{formatDateOnly(existingResult.submitted_at, locale)}</p>
                    <p className="text-xs mt-1">{t('student2.exam.submitted')}</p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {examResult && (
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">{t('student2.exam.answerBreakdown')}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {examResult.breakdown.map((b, i) => (
                  <div
                    key={b.question.id}
                    className={`flex items-start gap-3 rounded-lg border p-4 ${
                      b.correct
                        ? 'border-emerald-500/20 bg-emerald-500/5'
                        : 'border-red-500/20 bg-red-500/5'
                    }`}
                  >
                    <div className="mt-0.5 shrink-0">
                      {b.correct ? (
                        <CheckCircle className="h-5 w-5 text-emerald-400" />
                      ) : (
                        <XCircle className="h-5 w-5 text-red-400" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-on-surface">
                        {i + 1}. {getQuestionText(b.question)}
                      </p>
                      <p className="text-xs text-muted mt-1">
                        {t('student2.exam.yourAnswer', {
                          answer: Array.isArray(b.selected) ? b.selected.join(', ') : b.selected || t('student2.exam.notAnswered'),
                        })}
                      </p>
                      {!b.correct && (
                        <p className="text-xs text-emerald-400 mt-0.5">
                          {t('student2.exam.correct', {
                            answer: Array.isArray(b.question.correct_answer) ? b.question.correct_answer.join(', ') : String(b.question.correct_answer),
                          })}
                        </p>
                      )}
                      <p className="text-[10px] text-muted mt-0.5">{t('student2.exam.pts', { points: b.question.points })}</p>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          <div className="flex justify-between">
            <Button variant="ghost" onClick={() => router.back()}>
              <ChevronLeft className="mr-1 h-4 w-4" /> {t('student2.exam.backToCourse')}
            </Button>
            {(existingResult.status === 'passed' || existingResult.status === 'graded') && examResult?.passed && (
              <Button onClick={generateCertificate} loading={generatingCert}>
                <Award className="mr-1 h-4 w-4" /> {t('student2.exam.generateCertificate')}
              </Button>
            )}
          </div>

          {certError && (
            <div className="rounded-lg border border-destructive/30 bg-destructive-soft px-4 py-3 text-sm text-destructive animate-fade-in">
              {certError}
            </div>
          )}
        </div>
    )
  }

  if (pageState === 'taking' && shuffledQuestions.length > 0) {
    const q = shuffledQuestions[currentIndex]
    const inputType = getOptionInputType(q)
    const isFlagged = flagged.has(q.id)
    const currentAnswer = answers[q.id]
    const answeredCount = Object.keys(answers).length
    const flaggedCount = flagged.size

    return (
      <div className="min-h-screen bg-background">
        <div className="sticky top-0 z-30 border-b border-border bg-surface/95 backdrop-blur-sm">
          <div className="mx-auto max-w-5xl px-4 py-3">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
              <div className="flex items-center gap-3 min-w-0">
                <h2 className="text-sm font-semibold text-on-surface truncate max-w-[200px] sm:max-w-none">
                  {exam?.title}
                </h2>
                <Badge variant="outline" className="shrink-0">{currentIndex + 1}/{shuffledQuestions.length}</Badge>
              </div>
              <div className="flex items-center gap-3 flex-wrap">
                <span className="text-xs text-muted">
                  <CheckCircle className="inline h-3 w-3 mr-1 text-emerald-400" />
                  {answeredCount}
                </span>
                {flaggedCount > 0 && (
                  <span className="text-xs text-muted">
                    <Flag className="inline h-3 w-3 mr-1 text-amber-400" />
                    {flaggedCount}
                  </span>
                )}
                <div className={`flex items-center gap-1.5 text-sm font-mono font-bold ${
                  timeLeft < 300 ? 'text-red-400 animate-pulse' : 'text-on-surface'
                }`}>
                  <Clock className="h-4 w-4" />
                  {formatTime(timeLeft)}
                </div>
              </div>
            </div>

            <div className="flex flex-wrap gap-1.5">
              {shuffledQuestions.map((sq, idx) => {
                const isCurrent = idx === currentIndex
                const isAnswered = answers[sq.id] !== undefined && (
                  Array.isArray(answers[sq.id]) ? (answers[sq.id] as string[]).length > 0 : true
                )
                const isFlaggedQ = flagged.has(sq.id)
                return (
                  <button
                    key={sq.id}
                    onClick={() => setCurrentIndex(idx)}
                    className={`w-9 h-9 rounded-lg text-xs font-medium transition-all duration-150 ${
                      isCurrent
                        ? 'bg-indigo-500 text-white ring-2 ring-indigo-500/30 scale-110'
                        : isAnswered
                        ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                        : isFlaggedQ
                        ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                        : 'bg-surface-container-high text-on-surface-variant border border-border hover:bg-surface-container-highest'
                    }`}
                  >
                    {idx + 1}
                  </button>
                )
              })}
            </div>
          </div>
        </div>

        <div className="mx-auto max-w-3xl px-4 py-6 space-y-6">
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1">
              <div className="flex items-center gap-2 text-xs text-muted mb-2">
                <span>{t('student2.exam.questionOf', { current: currentIndex + 1, total: shuffledQuestions.length })}</span>
                <span className="w-1 h-1 rounded-full bg-border" />
                <span>{t('student2.exam.pts', { points: q.points })}</span>
                {q.question_type && (
                  <>
                    <span className="w-1 h-1 rounded-full bg-border" />
                    <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                      {q.question_type.replace(/_/g, ' ')}
                    </Badge>
                  </>
                )}
              </div>
              <p className="text-lg font-medium text-on-surface">
                {getQuestionText(q)}
              </p>
            </div>
            <Button
              variant={isFlagged ? 'outline' : 'ghost'}
              size="sm"
              onClick={() => toggleFlag(q.id)}
              className={isFlagged ? 'border-amber-500/30 text-amber-400' : ''}
            >
              <Flag className={`h-4 w-4 ${isFlagged ? 'fill-amber-400' : ''}`} />
            </Button>
          </div>

          <div className="space-y-3">
            {q.options && Array.isArray(q.options) && q.options.length > 0 && inputType !== 'text' && (
              q.options.map((opt, oi) => {
                const val = getOptionValue(opt)
                const label = getOptionLabel(opt)
                if (inputType === 'radio') {
                  return (
                    <label
                      key={oi}
                      className={`flex items-center gap-3 rounded-xl border p-4 cursor-pointer transition-all duration-150 ${
                        currentAnswer === val
                          ? 'border-indigo-500/50 bg-indigo-500/10 ring-1 ring-indigo-500/30'
                          : 'border-border bg-surface-container-low hover:border-indigo-500/20 hover:bg-surface-container-high'
                      }`}
                    >
                      <input
                        type="radio"
                        name={`q-${q.id}`}
                        value={val}
                        checked={currentAnswer === val}
                        onChange={() => handleMultipleChoice(q.id, val)}
                        className="h-4 w-4 accent-indigo-500"
                      />
                      <span className="text-sm text-on-surface">{label}</span>
                    </label>
                  )
                }
                if (inputType === 'checkbox') {
                  const selectedArr = (currentAnswer as string[]) || []
                  const isChecked = selectedArr.includes(val)
                  return (
                    <label
                      key={oi}
                      className={`flex items-center gap-3 rounded-xl border p-4 cursor-pointer transition-all duration-150 ${
                        isChecked
                          ? 'border-indigo-500/50 bg-indigo-500/10 ring-1 ring-indigo-500/30'
                          : 'border-border bg-surface-container-low hover:border-indigo-500/20 hover:bg-surface-container-high'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => handleMultiSelect(q.id, val)}
                        className="h-4 w-4 accent-indigo-500 rounded"
                      />
                      <span className="text-sm text-on-surface">{label}</span>
                    </label>
                  )
                }
                return null
              })
            )}
            {inputType === 'text' && (
              <textarea
                className="w-full rounded-xl border border-border bg-surface-container-low p-4 text-sm text-on-surface placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-indigo-500/50 min-h-[120px] resize-y"
                placeholder={t('student2.exam.typeAnswerHere')}
                value={(currentAnswer as string) || ''}
                onChange={(e) => handleAnswer(q.id, e.target.value)}
              />
            )}
          </div>

          <div className="flex flex-col gap-3 pt-4 border-t border-border sm:flex-row sm:items-center sm:justify-between">
            <Button
              variant="secondary"
              onClick={() => setCurrentIndex((prev) => Math.max(0, prev - 1))}
              disabled={currentIndex === 0}
            >
              <ChevronLeft className="mr-1 h-4 w-4" /> {t('student2.exam.previous')}
            </Button>

            <div className="flex flex-wrap items-center justify-center gap-2">
              <span className="text-xs text-muted">
                {t('student2.exam.answeredCount', { count: answeredCount, total: shuffledQuestions.length })}
                {flaggedCount > 0 && ` · ${t('student2.exam.flaggedCount', { count: flaggedCount })}`}
              </span>
              {currentIndex === shuffledQuestions.length - 1 ? (
                <Button
                  variant="success"
                  onClick={handleSubmit}
                  className="shadow-lg shadow-emerald-600/25"
                >
                  {t('student2.exam.submitExam')}
                </Button>
              ) : (
                <Button
                  variant="default"
                  onClick={() => setCurrentIndex((prev) => Math.min(shuffledQuestions.length - 1, prev + 1))}
                >
                  {t('student2.exam.next')} <ChevronRight className="ml-1 h-4 w-4" />
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>
    )
  }

  if (pageState === 'submitting') {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="h-12 w-12 text-indigo-400 animate-spin mx-auto mb-4" />
          <p className="text-lg font-medium text-on-surface">{t('student2.exam.submittingTitle')}</p>
          <p className="text-sm text-muted mt-1">{t('student2.exam.submittingDesc')}</p>
        </div>
      </div>
    )
  }

  if (pageState === 'result' && examResult) {
    const hasEssay = questions.some(q => q.question_type === 'essay')
    return (
      <div className="max-w-2xl mx-auto space-y-6">
          <div>
            <h1 className="text-2xl font-bold text-on-surface">{exam?.title || t('student2.exam.examResult')}</h1>
            <p className="text-on-surface-variant">
              {course ? (typeof course.title === 'string' ? course.title : course.title?.id || course.title?.en || '') : ''}
            </p>
          </div>

          <Card>
            <CardContent className="py-8">
              <div className="text-center">
                {hasEssay ? (
                  <>
                    <div className="inline-flex items-center justify-center w-24 h-24 rounded-full mb-4 bg-amber-500/20">
                      <Clock className="h-12 w-12 text-amber-400" />
                    </div>
                    <h2 className="text-3xl font-bold text-on-surface">{t('student2.exam.examSubmitted')}</h2>
                    <p className="text-sm text-on-surface-variant mt-1">
                      {t('student2.exam.examSubmittedDesc')}
                    </p>
                    <div className="mt-6 flex items-center justify-center gap-8">
                      <div className="text-center">
                        <p className="text-4xl font-bold text-on-surface">{examResult.score}/{examResult.total_points}</p>
                        <p className="text-xs text-muted mt-1">{t('student2.exam.autoGradedPoints')}</p>
                      </div>
                      <div className="w-px h-16 bg-border" />
                      <div className="text-center">
                        <p className="text-4xl font-bold text-amber-400">{t('student2.exam.pts', { points: examResult.total_points - examResult.score })}</p>
                        <p className="text-xs text-muted mt-1">{t('student2.exam.pendingTeacherReview')}</p>
                      </div>
                    </div>
                  </>
                ) : (
                  <>
                    <div className={`inline-flex items-center justify-center w-24 h-24 rounded-full mb-4 ${
                      examResult.passed ? 'bg-emerald-500/20' : 'bg-red-500/20'
                    }`}>
                      {examResult.passed ? (
                        <CheckCircle className="h-12 w-12 text-emerald-400" />
                      ) : (
                        <XCircle className="h-12 w-12 text-red-400" />
                      )}
                    </div>
                    <h2 className="text-3xl font-bold text-on-surface">
                      {examResult.passed ? t('student2.exam.congratsPassed') : t('student2.exam.didNotPass')}
                    </h2>
                    <p className="text-sm text-on-surface-variant mt-1">
                      {examResult.passed
                        ? t('student2.exam.downloadCert')
                        : t('student2.exam.needPass', { score: exam?.passing_score || 70 })}
                    </p>

                    <div className="mt-6 flex flex-wrap items-center justify-center gap-x-6 gap-y-4">
                      <div className="text-center">
                        <p className={`text-4xl font-bold ${
                          examResult.percentage >= (exam?.passing_score || 70) ? 'text-emerald-400' : 'text-red-400'
                        }`}>
                          {examResult.percentage}%
                        </p>
                        <p className="text-xs text-muted mt-1">{t('student2.exam.percentage')}</p>
                      </div>
                      <div className="w-px h-16 bg-border" />
                      <div className="text-center">
                        <p className="text-4xl font-bold text-on-surface">{examResult.score}/{examResult.total_points}</p>
                        <p className="text-xs text-muted mt-1">{t('student2.exam.points')}</p>
                      </div>
                      <div className="w-px h-16 bg-border" />
                      <div className="text-center">
                        <p className={`text-4xl font-bold ${
                          examResult.passed ? 'text-emerald-400' : 'text-red-400'
                        }`}>
                          {examResult.passed ? t('student2.exam.pass') : t('student2.exam.fail')}
                        </p>
                        <p className="text-xs text-muted mt-1">{t('student2.exam.status')}</p>
                      </div>
                    </div>

                    <div className="mt-6 h-3 rounded-full bg-surface-container-highest overflow-hidden max-w-md mx-auto">
                      <div
                        className={`h-full rounded-full transition-all duration-1000 ${
                          examResult.passed
                            ? 'bg-gradient-to-r from-emerald-500 to-emerald-400'
                            : 'bg-gradient-to-r from-red-500 to-red-400'
                        }`}
                        style={{ width: `${examResult.percentage}%` }}
                      />
                    </div>
                  </>
                )}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-sm">
                <BarChart3 className="h-4 w-4 text-indigo-400" /> {t('student2.exam.answerBreakdown')}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {examResult.breakdown.map((b, i) => {
                const isEssay = b.question.question_type === 'essay'
                return (
                  <div
                    key={b.question.id}
                    className={`flex items-start gap-3 rounded-lg border p-4 ${
                      isEssay
                        ? 'border-amber-500/20 bg-amber-500/5'
                        : b.correct
                          ? 'border-emerald-500/20 bg-emerald-500/5'
                          : 'border-red-500/20 bg-red-500/5'
                    }`}
                  >
                    <div className="mt-0.5 shrink-0">
                      {isEssay ? (
                        <Clock className="h-5 w-5 text-amber-400" />
                      ) : b.correct ? (
                        <CheckCircle className="h-5 w-5 text-emerald-400" />
                      ) : (
                        <XCircle className="h-5 w-5 text-red-400" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-on-surface">
                        {i + 1}. {getQuestionText(b.question)}
                      </p>
                      <p className="text-xs text-muted mt-1">
                        {t('student2.exam.yourAnswer', {
                          answer: Array.isArray(b.selected) ? b.selected.join(', ') : b.selected || t('student2.exam.notAnswered'),
                        })}
                      </p>
                      {isEssay ? (
                        <p className="text-xs text-amber-400 mt-0.5">{t('student2.exam.essayAwaiting')}</p>
                      ) : !b.correct ? (
                        <p className="text-xs text-emerald-400 mt-0.5">
                          {t('student2.exam.correct', {
                            answer: Array.isArray(b.question.correct_answer)
                              ? b.question.correct_answer.join(', ')
                              : String(b.question.correct_answer),
                          })}
                        </p>
                      ) : null}
                      <p className="text-[10px] text-muted mt-0.5">
                        {isEssay
                          ? t('student2.exam.pendingGrade')
                          : t('student2.exam.pts', { points: b.correct ? `+${b.question.points}` : b.question.points })}
                      </p>
                    </div>
                  </div>
                )
              })}
            </CardContent>
          </Card>

          <div className="flex justify-between">
            <Button variant="ghost" onClick={() => router.push('/student/dashboard')}>
              <ChevronLeft className="mr-1 h-4 w-4" /> {t('student2.exam.backToCourses')}
            </Button>
            {examResult.passed && (
              <Button onClick={generateCertificate} loading={generatingCert}>
                <Award className="mr-1 h-4 w-4" /> {t('student2.exam.generateCertificate')}
              </Button>
            )}
          </div>

          {certError && (
            <div className="rounded-lg border border-destructive/30 bg-destructive-soft px-4 py-3 text-sm text-destructive animate-fade-in">
              {certError}
            </div>
          )}
        </div>
    )
  }

  if (error) {
    return (
      <div className="max-w-md mx-auto text-center py-12">
          <AlertTriangle className="h-12 w-12 text-amber-400 mx-auto mb-4" />
          <h2 className="text-xl font-bold text-on-surface">{t('student2.exam.notAvailable')}</h2>
          <p className="text-sm text-on-surface-variant mt-1">{error}</p>
          <Button className="mt-6" onClick={() => router.back()}>
            <ChevronLeft className="mr-1 h-4 w-4" /> {t('student2.exam.goBack')}
          </Button>
        </div>
    )
  }

  return null
}
