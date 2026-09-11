'use client'

import { use, useState, useEffect, useCallback, useRef } from 'react'
import { createClient } from '@/lib/supabase-client'
import { useAuth } from '@/lib/auth-context'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { formatDate } from '@/lib/utils'
import {
  Clock, CheckCircle, XCircle,
  HelpCircle, ArrowLeft, Play, Timer, Headphones, FileText, Type
} from 'lucide-react'
import Link from 'next/link'

type QuizQuestion = {
  id: string
  quiz_id: string
  question_type: string
  question_text: string
  options: string[] | null
  correct_answer: string
  audio_url: string | null
  passage: string | null
  points: number
  sort_order: number
}

type AnswerMap = Record<string, string>

const TYPE_MAP: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  multiple_choice: { label: 'Multiple Choice', color: 'bg-blue-500/10 text-blue-400 border-blue-500/30', icon: <HelpCircle className="h-3.5 w-3.5" /> },
  essay: { label: 'Essay', color: 'bg-purple-500/10 text-purple-400 border-purple-500/30', icon: <Type className="h-3.5 w-3.5" /> },
  listening: { label: 'Listening', color: 'bg-amber-500/10 text-amber-400 border-amber-500/30', icon: <Headphones className="h-3.5 w-3.5" /> },
  reading: { label: 'Reading', color: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30', icon: <FileText className="h-3.5 w-3.5" /> },
}

function getQType(q: QuizQuestion): string {
  return q.question_type || 'multiple_choice'
}

function getQText(q: QuizQuestion): string {
  return q.question_text || ''
}

export default function QuizDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = use(params)
  const supabase = createClient()
  const { user } = useAuth()

  const [quiz, setQuiz] = useState<any>(null)
  const [questions, setQuestions] = useState<QuizQuestion[]>([])
  const [started, setStarted] = useState(false)
  const [currentQuestion, setCurrentQuestion] = useState(0)
  const [answers, setAnswers] = useState<AnswerMap>({})
  const [timeRemaining, setTimeRemaining] = useState<number | null>(null)
  const [submitted, setSubmitted] = useState(false)
  const [result, setResult] = useState<{
    score: number
    total: number
    correctCount: number
    totalQuestions: number
    timeSpent: string
    passed: boolean
    passingScore: number
    details?: { q: QuizQuestion; answer: string; correct: boolean; correctAnswer?: string }[]
  } | null>(null)
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [_existingAttempt, setExistingAttempt] = useState<any>(null)
  const [attemptsUsed, setAttemptsUsed] = useState(0)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const timerRef = useRef<NodeJS.Timeout | null>(null)
  const startTimeRef = useRef<number>(0)

  const fetchData = useCallback(async () => {
    setLoading(true)

    try {
      const { data: q } = await supabase
        .from('quizzes')
        .select('*')
        .eq('id', id)
        .single()

      if (q) setQuiz(q)

      const { data: qs } = await supabase
        .from('quiz_questions_student')
        .select('*')
        .eq('quiz_id', id)
        .order('sort_order', { ascending: true })

      if (qs) setQuestions(qs as QuizQuestion[])

      if (user) {
        const { data: attempt, error: attemptError } = await supabase
          .from('quiz_attempts')
          .select('*')
          .eq('quiz_id', id)
          .eq('user_id', user.id)
          .eq('status', 'completed')
          .order('submitted_at', { ascending: false })
          .limit(1)
          .maybeSingle()

        if (!attemptError) {
          const { count } = await supabase
            .from('quiz_attempts')
            .select('id', { count: 'exact', head: true })
            .eq('quiz_id', id)
            .eq('user_id', user.id)
            .eq('status', 'completed')
          setAttemptsUsed(count ?? 0)
        }

        if (attempt) {
          setExistingAttempt(attempt)
          setSubmitted(true)
          const allQuestions = (qs as QuizQuestion[]) || []
          const totalPoints = allQuestions.reduce((s, qq) => s + qq.points, 0)
          const rawAnswers = attempt.answers || {}
          // Grading RPC menyimpan jawaban essay sebagai array berisi metadata;
          // attempt lama menyimpan object questionId -> answer. Normalisasi
          // keduanya agar review tetap tampil setelah reload.
          const savedAnswers: Record<string, string> = Array.isArray(rawAnswers)
            ? Object.fromEntries((rawAnswers as { question_id?: string; answer?: string }[]).map((item) => [item.question_id || '', item.answer || '']))
            : rawAnswers as Record<string, string>
          // Kunci jawaban hanya via RPC review (khusus pemilik attempt)
          const { data: reviewData } = await supabase.rpc('get_quiz_review', {
            p_attempt_id: attempt.id,
          })
          const reviewItems = ((reviewData as { items?: { id: string; correct_answer: string }[] } | null)?.items) || []
          const correctMap = new Map(reviewItems.map((i) => [i.id, i.correct_answer]))
          let correctCount = 0
          const details = allQuestions.map((qq) => {
            const userAns = savedAnswers[qq.id] || ''
            const isEssay = qq.question_type === 'essay'
            const correctAnswer = correctMap.get(qq.id)
            const isCorrect = !isEssay && !!correctAnswer && userAns === correctAnswer
            if (isCorrect) correctCount++
            return { q: qq, answer: userAns, correct: isCorrect, correctAnswer }
          })
          setResult({
            score: attempt.score,
            total: totalPoints,
            correctCount,
            totalQuestions: allQuestions.length,
            timeSpent: '',
            passed: attempt.score >= (q?.passing_score || 70),
            passingScore: q?.passing_score || 70,
            details,
          })
        }
      }
    } catch (err) {
      console.error('Failed to fetch quiz data:', err)
    }

    setLoading(false)
  }, [id, user])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  useEffect(() => {
    if (timeRemaining === null || timeRemaining <= 0 || submitted) return

    timerRef.current = setInterval(() => {
      setTimeRemaining((prev) => {
        if (prev === null || prev <= 1) {
          if (timerRef.current) clearInterval(timerRef.current)
          handleSubmitQuiz()
          return 0
        }
        return prev - 1
      })
    }, 1000)

    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
    }
  }, [started, timeRemaining, submitted])

  const handleStart = () => {
    const limit = quiz?.attempt_limit ?? 1
    if (attemptsUsed >= limit) {
      setSubmitError(`You have reached the maximum of ${limit} attempt${limit > 1 ? 's' : ''} for this quiz.`)
      return
    }
    setStarted(true)
    startTimeRef.current = Date.now()
    if (quiz.time_limit_minutes) {
      setTimeRemaining(quiz.time_limit_minutes * 60)
    }
  }

  const handleAnswer = (questionId: string, answer: string) => {
    setAnswers((prev) => ({ ...prev, [questionId]: answer }))
  }

  const handleSubmitQuiz = async () => {
    if (submitting || !user || !quiz) return
    setSubmitting(true)

    if (timerRef.current) clearInterval(timerRef.current)

    const timeSpentMs = Date.now() - startTimeRef.current
    const minutes = Math.floor(timeSpentMs / 60000)
    const seconds = Math.floor((timeSpentMs % 60000) / 1000)
    const timeSpentStr = `${minutes}m ${seconds}s`

    try {
      // RPC atomik (security definer): skor dihitung server-side,
      // enforce attempt_limit di DB, dan insert dalam satu transaksi
      const { data: saved, error: saveError } = await supabase.rpc('record_quiz_attempt', {
        p_quiz_id: quiz.id,
        p_score: 0,
        p_answers: answers,
        p_started_at: new Date(startTimeRef.current).toISOString(),
        p_submitted_at: new Date().toISOString(),
      })

      if (saveError || !saved) {
        console.error('Failed to save quiz attempt:', saveError)
        setSubmitError(saveError?.message?.includes('limit') ? 'You have reached the maximum number of attempts for this quiz.' : 'Failed to save your quiz result. Please try again.')
        setSubmitting(false)
        return
      }

      const savedRow = saved as { id: string; score: number } | null
      const finalScore = savedRow?.score ?? 0
      const passed = finalScore >= (quiz.passing_score || 70)

      // Kunci jawaban via RPC review untuk detail hasil
      let correctCount = 0
      let detailedResults: { q: QuizQuestion; answer: string; correct: boolean; correctAnswer?: string }[] = questions.map((q) => ({
        q,
        answer: (answers[q.id] as string) || '',
        correct: false,
      }))
      if (savedRow?.id) {
        const { data: reviewData } = await supabase.rpc('get_quiz_review', {
          p_attempt_id: savedRow.id,
        })
        const reviewItems = ((reviewData as { items?: { id: string; correct_answer: string }[] } | null)?.items) || []
        const correctMap = new Map(reviewItems.map((i) => [i.id, i.correct_answer]))
        detailedResults = questions.map((q) => {
          const userAns = (answers[q.id] as string) || ''
          const isEssay = q.question_type === 'essay'
          const correctAnswer = correctMap.get(q.id)
          const isCorrect = !isEssay && !!correctAnswer && userAns === correctAnswer
          if (isCorrect) correctCount++
          return { q, answer: userAns, correct: isCorrect, correctAnswer }
        })
      }
      const totalPoints = questions.reduce((s, qq) => s + qq.points, 0)

      setResult({
        score: finalScore,
        total: totalPoints,
        correctCount,
        totalQuestions: questions.length,
        timeSpent: timeSpentStr,
        passed,
        passingScore: quiz.passing_score,
        details: detailedResults,
      })
      setSubmitted(true)
      setSubmitting(false)
    } catch (err) {
      console.error('Failed to save quiz attempt:', err)
      setSubmitError('Failed to save your quiz result. Please try again.')
      setSubmitting(false)
      return
    }
  }

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60)
    const s = seconds % 60
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
  }

  const countWords = (text: string) => {
    return text.trim() ? text.trim().split(/\s+/).length : 0
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin h-8 w-8 border-2 border-indigo-500 border-t-transparent rounded-full" />
      </div>
    )
  }

  if (!quiz) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold text-on-surface">Quiz not found</h1>
        <Button onClick={() => window.history.back()}>
          <ArrowLeft className="h-4 w-4 mr-1" /> Back
        </Button>
      </div>
    )
  }

  if (submitted && result) {
    return (
      <div className="max-w-2xl mx-auto space-y-6">
<Link href="/student/dashboard" className="text-sm text-indigo-400 hover:text-indigo-300 inline-flex items-center gap-1">
<ArrowLeft className="h-4 w-4" /> Back to Dashboard
</Link>

        <Card>
          <CardContent className="p-8 text-center">
            <div className={`mx-auto w-20 h-20 rounded-full flex items-center justify-center mb-4 ${result.passed ? 'bg-emerald-500/20' : 'bg-red-500/20'}`}>
              {result.passed
                ? <CheckCircle className="h-10 w-10 text-emerald-400" />
                : <XCircle className="h-10 w-10 text-red-400" />
              }
            </div>
            <h2 className="text-2xl font-bold text-on-surface mb-2">
              {result.passed ? 'Congratulations!' : 'Try Again'}
            </h2>
            <p className="text-on-surface-variant mb-6">
              {result.passed
                ? 'You passed the quiz'
                : `You need ${result.passingScore}% to pass`
              }
            </p>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
              <div className="rounded-lg bg-surface-container-low p-3">
                <p className="text-xs text-muted">Score</p>
                <p className={`text-xl font-bold ${result.passed ? 'text-emerald-400' : 'text-red-400'}`}>
                  {result.score}%
                </p>
              </div>
              <div className="rounded-lg bg-surface-container-low p-3">
                <p className="text-xs text-muted">Correct</p>
                <p className="text-xl font-bold text-on-surface">
                  {result.correctCount}/{result.totalQuestions}
                </p>
              </div>
              <div className="rounded-lg bg-surface-container-low p-3">
                <p className="text-xs text-muted">Points</p>
                <p className="text-xl font-bold text-on-surface">
                  {Math.round((result.score / 100) * result.total)}/{result.total}
                </p>
              </div>
              <div className="rounded-lg bg-surface-container-low p-3">
                <p className="text-xs text-muted">Time</p>
                <p className="text-xl font-bold text-on-surface">{result.timeSpent}</p>
              </div>
            </div>

            <Badge variant={result.passed ? 'success' : 'destructive'} className="text-sm py-1 px-4">
              {result.passed ? 'PASSED' : 'FAILED'}
            </Badge>
          </CardContent>
        </Card>

        {/* Detailed Answer Review */}
        {result.details && result.details.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-sm">
                <HelpCircle className="h-4 w-4 text-indigo-400" /> Answer Breakdown
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {result.details.map((d, i) => {
                const t = getQType(d.q)
                const isEssay = t === 'essay'
                return (
                  <div
                    key={d.q.id}
                    className={`flex items-start gap-3 rounded-lg border p-4 ${
                      isEssay
                        ? 'border-amber-500/20 bg-amber-500/5'
                        : d.correct
                          ? 'border-emerald-500/20 bg-emerald-500/5'
                          : 'border-red-500/20 bg-red-500/5'
                    }`}
                  >
                    <div className="mt-0.5 shrink-0">
                      {isEssay ? (
                        <Clock className="h-5 w-5 text-amber-400" />
                      ) : d.correct ? (
                        <CheckCircle className="h-5 w-5 text-emerald-400" />
                      ) : (
                        <XCircle className="h-5 w-5 text-red-400" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-on-surface">
                        {i + 1}. {getQText(d.q)}
                      </p>
                      <p className="text-xs text-muted mt-1">
                        Your answer: {d.answer || '(not answered)'}
                      </p>
                      {isEssay ? (
                        <p className="text-xs text-amber-400 mt-0.5">Essay - awaiting teacher grading</p>
                      ) : !d.correct ? (
                        <p className="text-xs text-emerald-400 mt-0.5">
                          Correct answer: {d.correctAnswer ?? '-'}
                        </p>
                      ) : null}
                      <p className="text-[10px] text-muted mt-0.5">
                        {isEssay ? 'Pending grade' : d.correct ? `+${d.q.points} pts` : `${d.q.points} pts`}
                      </p>
                    </div>
                  </div>
                )
              })}
            </CardContent>
          </Card>
        )}
      </div>
    )
  }

  if (!started) {
    return (
      <div className="max-w-2xl mx-auto space-y-6">
        <div className="flex items-center gap-2 text-sm text-muted">
          <Link href="/student/dashboard" className="hover:text-indigo-400">Dashboard</Link>
          <span>/</span>
          <span className="text-on-surface">{quiz.title}</span>
        </div>

        <Card>
          <CardContent className="p-8 text-center">
            <div className="mx-auto w-16 h-16 rounded-full bg-indigo-500/20 flex items-center justify-center mb-4">
              <HelpCircle className="h-8 w-8 text-indigo-400" />
            </div>
            <h1 className="text-2xl font-bold text-on-surface mb-2">{quiz.title}</h1>
            {quiz.description && (
              <p className="text-on-surface-variant mb-6">{quiz.description}</p>
            )}

            <div className="grid grid-cols-1 gap-4 mb-8 max-w-sm mx-auto sm:grid-cols-3">
              <div className="rounded-lg bg-surface-container-low p-3">
                <p className="text-xs text-muted">Questions</p>
                <p className="text-lg font-bold text-on-surface">{questions.length}</p>
              </div>
              <div className="rounded-lg bg-surface-container-low p-3">
                <p className="text-xs text-muted">Duration</p>
                <p className="text-lg font-bold text-on-surface">
                  {quiz.time_limit_minutes || 'Infinity'}m
                </p>
              </div>
              <div className="rounded-lg bg-surface-container-low p-3">
                <p className="text-xs text-muted">Pass</p>
                <p className="text-lg font-bold text-on-surface">{quiz.passing_score}%</p>
              </div>
            </div>

            <div className="space-y-2 text-sm text-on-surface-variant mb-6">
              <p>• Read each question carefully before answering</p>
              <p>• You cannot pause once started</p>
              {quiz.time_limit_minutes && (
                <p>• Quiz auto-submits after {quiz.time_limit_minutes} minutes</p>
              )}
              <p>• You need {quiz.passing_score}% to pass</p>
            </div>

            {submitError && (
              <div className="mb-6 rounded-lg border border-destructive/30 bg-destructive-soft px-4 py-3 text-sm text-destructive">
                {submitError}
              </div>
            )}

            <Button size="lg" onClick={handleStart} disabled={attemptsUsed >= (quiz.attempt_limit ?? 1)}>
              <Play className="h-5 w-5 mr-2" /> Start Quiz
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {submitError && (
        <div className="rounded-lg border border-destructive/30 bg-destructive-soft px-4 py-3 text-sm text-destructive">
          {submitError}
        </div>
      )}

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Badge variant="default">
            {currentQuestion + 1} / {questions.length}
          </Badge>
        </div>
        {timeRemaining !== null && (
          <div className={`flex items-center gap-2 text-sm font-medium ${timeRemaining < 60 ? 'text-red-400 animate-pulse' : 'text-on-surface'}`}>
            <Timer className="h-4 w-4" />
            {formatTime(timeRemaining)}
          </div>
        )}
      </div>

      <div className="flex gap-2 flex-wrap">
        {questions.map((q, idx) => {
          const t = getQType(q)
          const info = TYPE_MAP[t] || TYPE_MAP.multiple_choice
          return (
            <button
              key={q.id}
              onClick={() => setCurrentQuestion(idx)}
              className={`w-8 h-8 rounded-lg text-xs font-medium transition-colors ${
                idx === currentQuestion
                  ? 'bg-indigo-500 text-white'
                  : answers[q.id]
                  ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                  : 'bg-surface-container-high text-on-surface-variant border border-border hover:bg-surface-container-highest'
              }`}
              title={'Q' + (idx + 1) + ' (' + info.label + ')'}
            >
              {idx + 1}
            </button>
          )
        })}
      </div>

      <Card>
        <CardContent className="p-6">
          {(() => {
            const q = questions[currentQuestion]
            if (!q) return null
            const t = getQType(q)
            const info = TYPE_MAP[t] || TYPE_MAP.multiple_choice

            return (
              <div className="space-y-6">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className={'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium border ' + info.color}>
                      {info.icon}
                      {info.label}
                    </span>
                    <span className="text-xs text-muted">{q.points} pts</span>
                  </div>
                  <p className="text-base font-medium text-on-surface">{getQText(q)}</p>
                </div>

                {t === 'listening' && q.audio_url && (
                  <div className="rounded-xl bg-surface-container-low p-4 border border-border">
                    <div className="flex items-center gap-3 mb-2">
                      <div className="w-10 h-10 rounded-full bg-amber-500/20 flex items-center justify-center">
                        <Headphones className="h-5 w-5 text-amber-400" />
                      </div>
                      <div>
                        <p className="text-sm font-medium text-on-surface">Audio</p>
                        <p className="text-xs text-muted">Listen to the audio and answer the question</p>
                      </div>
                    </div>
                    <audio controls className="w-full h-10 rounded-lg">
                      <source src={q.audio_url} type="audio/mpeg" />
                      Your browser does not support the audio element.
                    </audio>
                  </div>
                )}

                {t === 'reading' && q.passage && (
                  <div className="rounded-xl bg-surface-container-low p-4 border border-border max-h-64 overflow-y-auto">
                    <div className="flex items-center gap-2 mb-3">
                      <FileText className="h-4 w-4 text-emerald-400" />
                      <span className="text-xs font-medium text-emerald-400 uppercase tracking-wider">Passage</span>
                    </div>
                    <p className="text-sm text-on-surface leading-relaxed whitespace-pre-line">{q.passage}</p>
                  </div>
                )}

                <div className="space-y-3">
                  {t === 'multiple_choice' && q.options && (
                    <div className="space-y-2">
                      {q.options.map((option, oi) => (
                        <label
                          key={oi}
                          className={'flex items-center gap-3 p-4 rounded-xl border-2 cursor-pointer transition-all ' + (answers[q.id] === option
                            ? 'border-indigo-500 bg-indigo-500/10'
                            : 'border-border bg-surface-container-low hover:border-indigo-500/30'
                          )}
                        >
                          <input
                            type="radio"
                            name={'q_' + q.id}
                            value={option}
                            checked={answers[q.id] === option}
                            onChange={() => handleAnswer(q.id, option)}
                            className="accent-indigo-500"
                          />
                          <span className="text-sm text-on-surface">{option}</span>
                        </label>
                      ))}
                    </div>
                  )}

                  {(t === 'listening' || t === 'reading') && q.options && q.options.length > 0 && (
                    <div className="space-y-2">
                      {q.options.map((option, oi) => (
                        <label
                          key={oi}
                          className={'flex items-center gap-3 p-4 rounded-xl border-2 cursor-pointer transition-all ' + (answers[q.id] === option
                            ? 'border-indigo-500 bg-indigo-500/10'
                            : 'border-border bg-surface-container-low hover:border-indigo-500/30'
                          )}
                        >
                          <input
                            type="radio"
                            name={'q_' + q.id}
                            value={option}
                            checked={answers[q.id] === option}
                            onChange={() => handleAnswer(q.id, option)}
                            className="accent-indigo-500"
                          />
                          <span className="text-sm text-on-surface">{option}</span>
                        </label>
                      ))}
                    </div>
                  )}

                  {t === 'essay' && (
                    <div className="space-y-3">
                      <textarea
                        value={answers[q.id] || ''}
                        onChange={(e) => handleAnswer(q.id, e.target.value)}
                        placeholder="Write your answer here..."
                        rows={8}
                        className="w-full rounded-xl border-2 border-border bg-surface-container-low p-4 text-sm text-on-surface placeholder:text-muted focus:border-indigo-500 focus:outline-none focus:ring-0 transition-colors resize-y min-h-[160px]"
                      />
                      <div className="flex items-center justify-between text-xs text-muted">
                        <span>Minimum 50 words recommended</span>
                        <span className={'font-medium ' + (countWords(answers[q.id] || '') < 10 ? 'text-red-400' : 'text-emerald-400')}>
                          {countWords(answers[q.id] || '')} words
                        </span>
                      </div>
                    </div>
                  )}

                  {(t === 'listening' || t === 'reading') && (!q.options || q.options.length === 0) && (
                    <div className="space-y-3">
                      <textarea
                        value={answers[q.id] || ''}
                        onChange={(e) => handleAnswer(q.id, e.target.value)}
                        placeholder="Type your answer here..."
                        rows={4}
                        className="w-full rounded-xl border-2 border-border bg-surface-container-low p-4 text-sm text-on-surface placeholder:text-muted focus:border-indigo-500 focus:outline-none focus:ring-0 transition-colors resize-y"
                      />
                    </div>
                  )}
                </div>
              </div>
            )
          })()}
        </CardContent>
      </Card>

      <div className="flex items-center justify-between">
        <Button
          variant="secondary"
          onClick={() => setCurrentQuestion((p) => Math.max(0, p - 1))}
          disabled={currentQuestion === 0}
        >
          Previous
        </Button>

        <div className="flex gap-2">
          {currentQuestion < questions.length - 1 ? (
            <Button onClick={() => setCurrentQuestion((p) => p + 1)}>
              Next
            </Button>
          ) : (
            <Button onClick={handleSubmitQuiz} loading={submitting}>
              {submitting ? 'Submitting...' : 'Submit Quiz'}
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}
