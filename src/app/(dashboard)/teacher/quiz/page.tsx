'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import {
  Plus, ClipboardList, Users, BarChart3, Loader2, FileText, Send,
  BookOpen, CheckCircle, Edit3, Trash2, Eye, EyeOff,
  HelpCircle, AlignLeft, ListChecks
} from 'lucide-react'
import { createClient } from '@/lib/supabase-client'
import { useAuth } from '@/lib/auth-context'
import { useI18n } from '@/lib/i18n/client'
import type { Quiz, QuizQuestion, QuizAttempt, User, Course, Language, LanguageLevel } from '@/types'

const LOCALE_MAP: Record<string, string> = {
  en: 'en-US',
  id: 'id-ID',
  zh: 'zh-CN',
}

/* ───────── Types ───────── */

interface EssayAnswer {
  question_id: string
  answer: string
  score: number | null
  feedback: string | null
}

interface AttemptWithUser extends QuizAttempt {
  user: User
  answers: EssayAnswer[]
}

interface QuizWithQuestions extends Quiz {
  questions: QuizQuestion[]
}

/* ───────── Helpers ───────── */

function _shuffleArray<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

function getQuestionText(q: { question_text?: string | { id?: string; en?: string } }): string {
  if (!q.question_text) return ''
  if (typeof q.question_text === 'string') return q.question_text
  return (q.question_text as { id?: string; en?: string }).id || (q.question_text as { id?: string; en?: string }).en || ''
}

/* ───────── Main Component ───────── */

export default function TeacherQuizPage() {
  const { user, loading: authLoading } = useAuth()
  const supabase = createClient()
  const { t, lang } = useI18n()
  const locale = LOCALE_MAP[lang] || 'en-US'

  /* tab state */
  const [tab, setTab] = useState('overview')

  /* ─ quizzes ─ */
  const [quizzes, setQuizzes] = useState<QuizWithQuestions[]>([])
  const [loading, setLoading] = useState(true)

  const [courses, setCourses] = useState<Course[]>([])
  const [levelMap, setLevelMap] = useState<Record<string, LanguageLevel>>({})
  const [languageMap, setLanguageMap] = useState<Record<string, Language>>({})


  /* quiz editor modal */
  const [showQuizEditor, setShowQuizEditor] = useState(false)
  const [editingQuiz, setEditingQuiz] = useState<QuizWithQuestions | null>(null)
  const [quizForm, setQuizForm] = useState({
    title: '',
    description: '',
    course_id: '',
    time_limit_minutes: 30,
    passing_score: 65,
    attempt_limit: 3,
  })
  const [quizQuestions, setQuizQuestions] = useState<QuizQuestion[]>([])
  const [savingQuiz, setSavingQuiz] = useState(false)


  /* ─ essay grading (quizzes) ─ */
  const [essayAttempts, setEssayAttempts] = useState<Record<string, AttemptWithUser[]>>({})
  const [loadingEssays, setLoadingEssays] = useState(false)
  const [savingScores, setSavingScores] = useState<Record<string, boolean>>({})
  const [localScores, setLocalScores] = useState<Record<string, Record<string, { score: string; feedback: string }>>>({})


  /* ========== LOADS ========== */

  useEffect(() => {
    if (authLoading || !user) return
    fetchQuizzes()
    fetchCourses()
  }, [authLoading, user])

  useEffect(() => {
    if (tab === 'essay') fetchEssayData()
  }, [tab])

  async function fetchQuizzes() {
    setLoading(true)
    const { data: teacherRow } = await supabase
      .from('teachers')
      .select('id')
      .eq('user_id', user!.id)
      .maybeSingle()
    if (!teacherRow) {
      setQuizzes([])
      setLoading(false)
      return
    }
    const { data: ctRows } = await supabase
      .from('course_teachers')
      .select('course_id')
      .eq('teacher_id', teacherRow.id)
    const courseIds = (ctRows || []).map(ct => ct.course_id)
    if (courseIds.length === 0) {
      setQuizzes([])
      setLoading(false)
      return
    }
    const { data } = await supabase
      .from('quizzes')
      .select('*')
      .in('course_id', courseIds)
      .order('created_at', { ascending: false })
    if (data) {
      const quizIds = data.map((q) => (q as { id: string }).id)
      const { data: qData } = quizIds.length
        ? await supabase.from('quiz_questions_teacher').select('*').in('quiz_id', quizIds)
        : { data: null }
      const byQuiz = new Map<string, unknown[]>()
      for (const q of (qData as { quiz_id: string }[]) || []) {
        const arr = byQuiz.get(q.quiz_id) || []
        arr.push(q)
        byQuiz.set(q.quiz_id, arr)
      }
      setQuizzes(data.map((q) => ({
        ...q,
        questions: byQuiz.get((q as { id: string }).id) || [],
      })) as QuizWithQuestions[])
    }
    setLoading(false)
  }

  async function fetchCourses() {
    if (!user) return
    const { data: teacherRow } = await supabase
      .from('teachers')
      .select('id')
      .eq('user_id', user.id)
      .maybeSingle()
    if (!teacherRow) { setCourses([]); return }
    const { data: ctRows } = await supabase
      .from('course_teachers')
      .select('course_id')
      .eq('teacher_id', teacherRow.id)
    const courseIds = (ctRows || []).map(ct => ct.course_id)
    if (courseIds.length === 0) { setCourses([]); return }
    const { data } = await supabase
      .from('courses')
      .select('id, title, language_code, level_id')
      .in('id', courseIds)
    if (data) setCourses(data as Course[])

    const [{ data: levels }, { data: langs }] = await Promise.all([
      supabase.from('language_levels').select('id, language_code, code, name'),
      supabase.from('languages').select('code, name, native_name, flag_emoji'),
    ])
    if (levels) setLevelMap(Object.fromEntries(levels.map(l => [l.id, l])))
    if (langs) setLanguageMap(Object.fromEntries(langs.map(l => [l.code, l])))
  }

  function getCourseLabel(c: Course): string {
    const title = c.title?.en || c.title?.id || t('teacher2.quiz.untitled')
    const lang = languageMap[c.language_code]
    const level = levelMap[c.level_id]
    const langName = lang?.name?.en || c.language_code?.toUpperCase() || ''
    const levelName = level?.name?.en || ''
    return `${title} (${langName} - ${levelName})`
  }

  async function fetchEssayData() {
    /* Quiz essays */
    setLoadingEssays(true)
    const { data: teacherRow } = await supabase
      .from('teachers')
      .select('id')
      .eq('user_id', user!.id)
      .maybeSingle()
    if (!teacherRow) { setEssayAttempts({}); setLoadingEssays(false); return }
    const { data: ctRows } = await supabase
      .from('course_teachers')
      .select('course_id')
      .eq('teacher_id', teacherRow.id)
    const myCourseIds = (ctRows || []).map(ct => ct.course_id)

    const { data: essayQData } = await supabase
      .from('quiz_questions_teacher')
      .select('quiz_id')
      .eq('question_type', 'essay')

    if (essayQData && essayQData.length > 0 && myCourseIds.length > 0) {
      const quizIds = [...new Set(essayQData.map(q => q.quiz_id))]

      const { data: quizData } = await supabase
        .from('quizzes')
        .select('*')
        .in('id', quizIds)
        .in('course_id', myCourseIds)

      if (quizData) {
        const qQuizIds = quizData.map((qz) => (qz as { id: string }).id)
        const { data: qRows } = qQuizIds.length
          ? await supabase.from('quiz_questions_teacher').select('*').in('quiz_id', qQuizIds)
          : { data: null }
        const byQuiz = new Map<string, unknown[]>()
        for (const q of (qRows as { quiz_id: string }[]) || []) {
          const arr = byQuiz.get(q.quiz_id) || []
          arr.push(q)
          byQuiz.set(q.quiz_id, arr)
        }
        const essayQuizzes = quizData.map((qz: any) => ({
          ...qz,
          questions: byQuiz.get(qz.id) || [],
        })) as QuizWithQuestions[]
        const attemptsMap: Record<string, AttemptWithUser[]> = {}

        for (const q of essayQuizzes) {
          const { data: attemptData } = await supabase
            .from('quiz_attempts')
            .select('*, user:users(*)')
            .eq('quiz_id', q.id)
            .in('status', ['submitted', 'completed'])
            .order('submitted_at', { ascending: true })

          if (attemptData) {
            attemptsMap[q.id] = (attemptData as AttemptWithUser[]).map(a => ({
              ...a,
              answers: (a.answers as EssayAnswer[]) || [],
            }))
          }
        }

        setEssayAttempts(attemptsMap)
      }
    }
    setLoadingEssays(false)

  }

  /* ========== QUIZ CRUD ========== */

  function openCreateQuiz() {
    setEditingQuiz(null)
    setQuizForm({ title: '', description: '', course_id: courses[0]?.id || '', time_limit_minutes: 30, passing_score: 65, attempt_limit: 3 })
    setQuizQuestions([])
    setShowQuizEditor(true)
  }

  function openEditQuiz(quiz: QuizWithQuestions) {
    setEditingQuiz(quiz)
    setQuizForm({
      title: quiz.title,
      description: quiz.description || '',
      course_id: quiz.course_id,
      time_limit_minutes: quiz.time_limit_minutes ?? 30,
      passing_score: quiz.passing_score ?? 65,
      attempt_limit: quiz.attempt_limit ?? 3,
    })
    setQuizQuestions(quiz.questions || [])
    setShowQuizEditor(true)
  }

  function addQuizQuestion(type: 'multiple_choice' | 'essay') {
    const newQ: QuizQuestion = {
      id: `temp_${Date.now()}`,
      quiz_id: editingQuiz?.id || '',
      question_type: type,
      question_text: '',
      options: type === 'multiple_choice' ? ['', '', '', ''] : [],
      correct_answer: '',
      points: 10,
      sort_order: quizQuestions.length,
    }
    setQuizQuestions(prev => [...prev, newQ])
  }

  function updateQuizQuestion(index: number, field: keyof QuizQuestion, value: any) {
    setQuizQuestions(prev => {
      const copy = [...prev]
      copy[index] = { ...copy[index], [field]: value }
      return copy
    })
  }

  function removeQuizQuestion(index: number) {
    setQuizQuestions(prev => prev.filter((_, i) => i !== index))
  }

  async function saveQuiz() {
    if (!quizForm.title || !quizForm.course_id) return
    setSavingQuiz(true)

    try {
      if (editingQuiz) {
        await supabase
          .from('quizzes')
          .update({
            title: quizForm.title,
            description: quizForm.description,
            course_id: quizForm.course_id,
            time_limit_minutes: quizForm.time_limit_minutes,
            passing_score: quizForm.passing_score,
            attempt_limit: quizForm.attempt_limit,
          })
          .eq('id', editingQuiz.id)

        const existingIds = editingQuiz.questions?.map(q => q.id).filter(id => !id.startsWith('temp_')) || []
        const currentIds = quizQuestions.map(q => q.id).filter(id => !id.startsWith('temp_'))
        const toDelete = existingIds.filter(id => !currentIds.includes(id))
        if (toDelete.length > 0) {
          await supabase.from('quiz_questions').delete().in('id', toDelete)
        }

        for (let i = 0; i < quizQuestions.length; i++) {
          const q = quizQuestions[i]
          const payload = {
            quiz_id: editingQuiz.id,
            question_type: q.question_type,
            question_text: q.question_text,
            options: q.options,
            correct_answer: q.correct_answer,
            points: q.points,
            sort_order: i,
          }

          if (q.id.startsWith('temp_')) {
            await supabase.from('quiz_questions').insert(payload)
          } else {
            await supabase.from('quiz_questions').update(payload).eq('id', q.id)
          }
        }
      } else {
        const { data: newQuiz, error: quizError } = await supabase
          .from('quizzes')
          .insert({
            course_id: quizForm.course_id,
            title: quizForm.title,
            description: quizForm.description,
            time_limit_minutes: quizForm.time_limit_minutes,
            passing_score: quizForm.passing_score,
            attempt_limit: quizForm.attempt_limit,
            status: 'draft',
            created_at: new Date().toISOString(),
          })
          .select('id')
          .single()

        if (quizError) {
          console.error('Create quiz error:', quizError)
          setSavingQuiz(false)
          return
        }

        for (let i = 0; i < quizQuestions.length; i++) {
          const q = quizQuestions[i]
          await supabase.from('quiz_questions').insert({
            quiz_id: newQuiz.id,
            question_type: q.question_type,
            question_text: q.question_text,
            options: q.options,
            correct_answer: q.correct_answer,
            points: q.points,
            sort_order: i,
          })
        }
      }

      setShowQuizEditor(false)
      fetchQuizzes()
    } catch (err) {
      console.error('Save quiz error:', err)
    } finally {
      setSavingQuiz(false)
    }
  }

  async function deleteQuiz(quizId: string) {
    if (!confirm(t('teacher2.quiz.deleteQuizConfirm'))) return
    await supabase.from('quiz_questions').delete().eq('quiz_id', quizId)
    await supabase.from('quiz_attempts').delete().eq('quiz_id', quizId)
    await supabase.from('quizzes').delete().eq('id', quizId)
    fetchQuizzes()
  }

  /* ========== EXAM CRUD ========== */

  function handleScoreChange(attemptId: string, questionId: string, field: 'score' | 'feedback', value: string) {
    setLocalScores(prev => ({
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

  async function saveEssayGrade(quizId: string, attempt: AttemptWithUser) {
    setSavingScores(prev => ({ ...prev, [attempt.id]: true }))
    try {
      const updatedAnswers = attempt.answers.map(a => {
        const local = localScores[attempt.id]?.[a.question_id]
        return {
          ...a,
          score: local?.score ? Number(local.score) : a.score,
          feedback: local?.feedback !== undefined ? local.feedback : a.feedback,
        }
      })

      const essayScores = Object.fromEntries(
        updatedAnswers.map((answer) => [answer.question_id, Number(answer.score) || 0])
      )
      const essayFeedback = Object.fromEntries(
        updatedAnswers
          .filter((answer) => answer.feedback != null)
          .map((answer) => [answer.question_id, answer.feedback || ''])
      )

      const { data: gradedAttempt, error } = await supabase.rpc('grade_quiz_attempt_essay', {
        p_attempt_id: attempt.id,
        p_essay_scores: essayScores,
        p_essay_feedback: essayFeedback,
      })

      if (!error) {
        const totalScore = Number(gradedAttempt?.score ?? 0)
        const savedAnswers = (gradedAttempt?.answers as EssayAnswer[] | undefined) || updatedAnswers

        setEssayAttempts(prev => ({
          ...prev,
          [quizId]: prev[quizId].map(a => a.id === attempt.id ? { ...a, answers: savedAnswers, score: totalScore, status: 'graded' } : a),
        }))
        setLocalScores(prev => { const copy = { ...prev }; delete copy[attempt.id]; return copy })
      }
    } catch (err) {
      console.error('Failed to save essay grade', err)
    } finally {
      setSavingScores(prev => ({ ...prev, [attempt.id]: false }))
    }
  }


  /* essay questions map for quizzes */
  const essayQuestionsMap: Record<string, QuizQuestion[]> = {}
  for (const q of quizzes) {
    const essayQs = q.questions?.filter(qq => qq.question_type === 'essay') || []
    if (essayQs.length > 0) essayQuestionsMap[q.id] = essayQs
  }


  if (authLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="h-8 w-8 text-indigo-400 animate-spin" />
      </div>
    )
  }

  /* ========== RENDER ========== */

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-on-surface">{t('teacher2.quiz.title')}</h1>
          <p className="text-on-surface-variant">{t('teacher2.quiz.subtitle')}</p>
        </div>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="overview" icon={<ClipboardList className="h-4 w-4" />}>{t('teacher2.quiz.tabQuiz')}</TabsTrigger>
          <TabsTrigger value="essay" icon={<FileText className="h-4 w-4" />}>{t('teacher2.quiz.tabEssayGrading')}</TabsTrigger>
        </TabsList>

        {/* ════════ KUIS TAB ════════ */}
        <TabsContent value="overview">
          <div className="flex justify-end mb-4">
            <Button size="sm" onClick={openCreateQuiz}><Plus className="mr-1 h-4 w-4" /> {t('teacher2.quiz.createQuiz')}</Button>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="h-6 w-6 text-indigo-400 animate-spin" />
            </div>
          ) : quizzes.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-16">
                <ClipboardList className="h-10 w-10 text-muted mb-3" />
                <p className="text-sm text-on-surface-variant">{t('teacher2.quiz.emptyQuiz')}</p>
                <Button size="sm" className="mt-4" onClick={openCreateQuiz}><Plus className="mr-1 h-4 w-4" /> {t('teacher2.quiz.createQuiz')}</Button>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {quizzes.map((q) => (
                <Card key={q.id}>
                  <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                    <div className="flex items-start gap-3 flex-1">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-indigo-500/10">
                        <ClipboardList className="h-5 w-5 text-indigo-400" />
                      </div>
                      <div>
                        <h3 className="font-medium text-on-surface">{q.title}</h3>
                        <div className="flex flex-wrap items-center gap-2 text-xs text-muted mt-1">
                          <span className="flex items-center gap-1"><BarChart3 className="h-3 w-3" /> {t('teacher2.quiz.questionCount', { count: q.questions?.length || 0 })}</span>
                          <span className="flex items-center gap-1"><Users className="h-3 w-3" /> {t('teacher2.quiz.maxAttempts', { limit: q.attempt_limit })}</span>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant={q.status === 'active' ? 'success' : 'warning'}>
                        {q.status === 'active' ? t('teacher2.quiz.published') : t('teacher2.quiz.draft')}
                      </Badge>
                      <Button size="sm" variant="ghost" onClick={() => openEditQuiz(q)}>
                        <Edit3 className="h-3.5 w-3.5" />
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => deleteQuiz(q.id)}>
                        <Trash2 className="h-3.5 w-3.5 text-red-400" />
                      </Button>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        {/* ════════ NILAI ESSAY TAB ════════ */}
        <TabsContent value="essay">
          {renderQuizEssayGrading()}
        </TabsContent>
      </Tabs>

      {/* ════════ QUIZ EDITOR MODAL ════════ */}
      {showQuizEditor && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/60 backdrop-blur-sm p-4">
          <div className="w-full max-w-3xl mt-8 mb-8 rounded-2xl border border-border bg-surface shadow-2xl">
            <div className="flex items-center justify-between border-b border-border px-6 py-4">
              <h2 className="text-lg font-bold text-on-surface">
                {editingQuiz ? t('teacher2.quiz.modalEditQuiz') : t('teacher2.quiz.modalCreateQuiz')}
              </h2>
              <Button variant="ghost" size="sm" onClick={() => setShowQuizEditor(false)}>✕</Button>
            </div>

            <div className="p-6 space-y-6 max-h-[75vh] overflow-y-auto">
              {/* Quiz Details */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="sm:col-span-2">
                  <Label required>{t('teacher2.quiz.quizTitleLabel')}</Label>
                  <Input
                    placeholder={t('teacher2.quiz.quizTitlePlaceholder')}
                    value={quizForm.title}
                    onChange={e => setQuizForm(prev => ({ ...prev, title: e.target.value }))}
                  />
                </div>
                <div className="sm:col-span-2">
                  <Label>{t('teacher2.quiz.descriptionLabel')}</Label>
                  <Textarea
                    placeholder={t('teacher2.quiz.quizDescPlaceholder')}
                    value={quizForm.description}
                    onChange={e => setQuizForm(prev => ({ ...prev, description: e.target.value }))}
                  />
                </div>
                <div>
                  <Label required>{t('teacher2.quiz.courseLabel')}</Label>
                  <Select
                    value={quizForm.course_id}
                    onChange={e => setQuizForm(prev => ({ ...prev, course_id: e.target.value }))}
                  >
                    <option value="">{t('teacher2.quiz.coursePlaceholder')}</option>
                    {courses.map(c => (
                      <option key={c.id} value={c.id}>{getCourseLabel(c)}</option>
                    ))}
                  </Select>
                </div>
                <div>
                  <Label required>{t('teacher2.quiz.timeLimitLabel')}</Label>
                  <Input
                    type="number"
                    min={1}
                    value={quizForm.time_limit_minutes}
                    onChange={e => setQuizForm(prev => ({ ...prev, time_limit_minutes: Number(e.target.value) }))}
                  />
                </div>
                <div>
                  <Label required>{t('teacher2.quiz.passingScoreLabel')}</Label>
                  <Input
                    type="number"
                    min={0}
                    max={100}
                    value={quizForm.passing_score}
                    onChange={e => setQuizForm(prev => ({ ...prev, passing_score: Number(e.target.value) }))}
                  />
                </div>
                <div>
                  <Label required>{t('teacher2.quiz.attemptLimitLabel')}</Label>
                  <Input
                    type="number"
                    min={1}
                    value={quizForm.attempt_limit}
                    onChange={e => setQuizForm(prev => ({ ...prev, attempt_limit: Number(e.target.value) }))}
                  />
                </div>
              </div>

              {/* Questions */}
              <div className="border-t border-border pt-6">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between mb-4">
                  <h3 className="font-semibold text-on-surface">{t('teacher2.quiz.questionsTitle', { count: quizQuestions.length })}</h3>
                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" variant="outline" onClick={() => addQuizQuestion('multiple_choice')}>
                      <ListChecks className="h-3.5 w-3.5 mr-1" /> {t('teacher2.quiz.addMultipleChoice')}
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => addQuizQuestion('essay')}>
                      <AlignLeft className="h-3.5 w-3.5 mr-1" /> {t('teacher2.quiz.addEssay')}
                    </Button>
                  </div>
                </div>

                {quizQuestions.length === 0 && (
                  <div className="rounded-lg border border-dashed border-border bg-surface-container-lowest p-8 text-center">
                    <HelpCircle className="h-8 w-8 text-muted mx-auto mb-2" />
                    <p className="text-sm text-on-surface-variant">{t('teacher2.quiz.noQuestions')}</p>
                  </div>
                )}

                <div className="space-y-4">
                  {quizQuestions.map((q, idx) => (
                    <div key={q.id} className="rounded-xl border border-border bg-surface-container-low p-4 space-y-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Badge variant={q.question_type === 'essay' ? 'warning' : 'info'} size="sm">
                            {q.question_type === 'essay' ? t('teacher2.quiz.questionBadgeEssay') : t('teacher2.quiz.questionBadgeMc')}
                          </Badge>
                          <span className="text-xs text-muted">{t('teacher2.quiz.questionNumber', { number: idx + 1 })}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="flex items-center gap-1">
                            <Label className="text-xs">{t('teacher2.quiz.pointsLabel')}</Label>
                            <Input
                              type="number"
                              min={1}
                              className="w-16 h-7 text-xs"
                              value={q.points}
                              onChange={e => updateQuizQuestion(idx, 'points', Number(e.target.value))}
                            />
                          </div>
                          <Button size="sm" variant="ghost" onClick={() => removeQuizQuestion(idx)}>
                            <Trash2 className="h-3.5 w-3.5 text-red-400" />
                          </Button>
                        </div>
                      </div>

                      <div>
                        <Label className="text-xs">{t('teacher2.quiz.questionTextLabel')}</Label>
                        <Textarea
                          placeholder={t('teacher2.quiz.questionTextPlaceholder')}
                          className="min-h-[60px]"
                          value={q.question_text}
                          onChange={e => updateQuizQuestion(idx, 'question_text', e.target.value)}
                        />
                      </div>

                      {q.question_type === 'multiple_choice' && (() => {
                        const opts = (q.options as string[]) || ['', '', '', '']
                        return (
                        <>
                          <div className="space-y-2">
                            <Label className="text-xs">{t('teacher2.quiz.optionsLabel')}</Label>
                            {opts.map((opt, oi) => (
                              <div key={oi} className="flex items-center gap-2">
                                <span className="text-xs font-mono text-muted w-6">{String.fromCharCode(65 + oi)}.</span>
                                <Input
                                  placeholder={t('teacher2.quiz.optionPlaceholder', { letter: String.fromCharCode(65 + oi) })}
                                  value={opt}
                                  onChange={e => {
                                    const newOpts = [...opts]
                                    newOpts[oi] = e.target.value
                                    updateQuizQuestion(idx, 'options', newOpts)
                                  }}
                                />
                              </div>
                            ))}
                          </div>
                          <div>
                            <Label className="text-xs">{t('teacher2.quiz.correctAnswerLabel')}</Label>
                            <Select
                              value={q.correct_answer}
                              onChange={e => updateQuizQuestion(idx, 'correct_answer', e.target.value)}
                            >
                              <option value="">{t('teacher2.quiz.selectAnswerPlaceholder')}</option>
                              {opts.map((opt, oi) => (
                                <option key={oi} value={opt}>{String.fromCharCode(65 + oi)}. {opt}</option>
                              ))}
                            </Select>
                          </div>
                        </>
                        )
                      })()}
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between border-t border-border px-6 py-4">
              <Button variant="ghost" onClick={() => setShowQuizEditor(false)}>{t('teacher2.quiz.cancel')}</Button>
              <Button onClick={saveQuiz} loading={savingQuiz}>
                {editingQuiz ? t('teacher2.quiz.saveChanges') : t('teacher2.quiz.modalCreateQuiz')}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )

  /* ────── Quiz essay grading render ────── */
  function renderQuizEssayGrading() {
    if (loadingEssays) {
      return (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-6 w-6 text-indigo-400 animate-spin" />
        </div>
      )
    }

    if (Object.keys(essayAttempts).length === 0) {
      return (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16">
            <FileText className="h-10 w-10 text-muted mb-3" />
            <p className="text-sm text-on-surface-variant">{t('teacher2.quiz.emptyQuizEssays')}</p>
          </CardContent>
        </Card>
      )
    }

    return (
      <div className="space-y-6">
        {Object.entries(essayAttempts).map(([quizId, attempts]) => {
          const quiz = quizzes.find(q => q.id === quizId)
          const essayQs = essayQuestionsMap[quizId] || []
          return (
            <Card key={quizId}>
              <CardHeader>
                <CardTitle>{quiz?.title || t('teacher2.quiz.createQuiz')}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                {attempts.length === 0 ? (
                  <p className="text-sm text-muted py-4 text-center">{t('teacher2.quiz.noSubmittedAttempts')}</p>
                ) : (
                  attempts.map((attempt) => {
                    const attemptLocal = localScores[attempt.id] || {}
                    return (
                      <div key={attempt.id} className="rounded-lg border border-border bg-background p-4 space-y-4">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 to-indigo-600 text-xs font-bold text-white">
                              {attempt.user?.display_name?.[0] || '?'}
                            </div>
                            <div>
                              <span className="text-sm font-medium text-on-surface">{attempt.user?.display_name || t('teacher2.quiz.unknown')}</span>
                              <p className="text-xs text-muted">{t('teacher2.quiz.attemptNumber', { number: attempt.attempt_number, date: attempt.submitted_at ? new Date(attempt.submitted_at).toLocaleDateString(locale) : '-' })}</p>
                            </div>
                          </div>
                          <Badge variant={attempt.score != null ? 'success' : 'warning'}>
                            {attempt.score != null ? t('teacher2.quiz.scoreBadge', { score: attempt.score }) : t('teacher2.quiz.notGraded')}
                          </Badge>
                        </div>

                        {essayQs.map((eq) => {
                          const answer = attempt.answers?.find(a => a.question_id === eq.id)
                          const local = attemptLocal[eq.id] || {}
                          return (
                            <div key={eq.id} className="ml-10 space-y-2 border-l-2 border-indigo-500/20 pl-4">
                              <p className="text-sm font-medium text-on-surface">
                                {getQuestionText(eq)}
                              </p>
                              <div className="rounded-md bg-surface-container-highest p-3">
                                <p className="text-sm text-on-surface whitespace-pre-wrap">{answer?.answer || t('teacher2.quiz.noAnswer')}</p>
                              </div>
                              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                                <div>
                                  <Label className="text-xs">{t('teacher2.quiz.scoreMax', { max: eq.points })}</Label>
                                  <Input
                                    type="number"
                                    max={eq.points}
                                    placeholder="0"
                                    value={local.score !== undefined ? local.score : (answer?.score ?? '')}
                                    onChange={e => handleScoreChange(attempt.id, eq.id, 'score', e.target.value)}
                                  />
                                </div>
                                <div className="sm:col-span-2">
                                  <Label className="text-xs">{t('teacher2.quiz.feedbackLabel')}</Label>
                                  <Input
                                    placeholder={t('teacher2.quiz.feedbackPlaceholder')}
                                    value={local.feedback !== undefined ? local.feedback : (answer?.feedback ?? '')}
                                    onChange={e => handleScoreChange(attempt.id, eq.id, 'feedback', e.target.value)}
                                  />
                                </div>
                              </div>
                            </div>
                          )
                        })}

                        <div className="flex justify-end pt-2">
                          <Button
                            size="sm"
                            onClick={() => saveEssayGrade(quizId, attempt)}
                            loading={savingScores[attempt.id]}
                          >
                            <Send className="h-3.5 w-3.5 mr-1" /> {t('teacher2.quiz.saveGrade')}
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