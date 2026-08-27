'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import { createClient } from '@/lib/supabase-client'
import { useAuth } from '@/lib/auth-context'
import { useI18n } from '@/lib/i18n/client'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { Flag } from '@/components/ui/flag'
import {
  FileText, Clock, CheckCircle, ArrowRight, Loader2, ChevronLeft, Award, BarChart3, Sparkles, GraduationCap, Globe2, XCircle, Volume2, BookOpenText,
  Lock, CreditCard, Phone, Copy, CheckCircle2, ExternalLink, ShieldCheck, Users, AlertCircle
} from 'lucide-react'
import Link from 'next/link'
import type { Language, Payment } from '@/types'
import { normalizeTier } from '@/lib/course-catalog'
import { languageLabel } from '@/lib/utils'

interface Question {
  id: string
  language_code: string
  question_type: string
  question_text: string
  passage_text?: string
  audio_url?: string
  options: string[]
  correct_answer: string
  difficulty_level: string
}

interface PlacementResult {
  score: number
  level: string
  total: number
  language_code?: string
}

export default function PlacementTestPage() {
  const router = useRouter()
  const { user, loading: authLoading } = useAuth()
  const { t, lang } = useI18n()
  const supabase = createClient()
  const locale = { en: 'en-US', id: 'id-ID', zh: 'zh-CN' }[lang] || 'id-ID'

  // Payment gate
  type AccessState = 'loading' | 'unpaid' | 'pending' | 'granted'
  const ACCESS_DAYS = 7
  const ACCESS_MS = ACCESS_DAYS * 24 * 60 * 60 * 1000
  const [access, setAccess] = useState<AccessState>('loading')
  const [accessExpired, setAccessExpired] = useState(false)
  const [placementPayment, setPlacementPayment] = useState<(Payment & { user?: any }) | null>(null)
  const [gateSettings, setGateSettings] = useState<Record<string, string>>({})
  const [purchasing, setPurchasing] = useState(false)
  const [purchaseError, setPurchaseError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  // Language selection
  const [languages, setLanguages] = useState<Language[]>([])
  const [languageLoading, setLanguageLoading] = useState(true)
  const [selectedLanguage, setSelectedLanguage] = useState<string | null>(null)

  // Test state
  const [questions, setQuestions] = useState<Question[]>([])
  const [questionsLoading, setQuestionsLoading] = useState(false)
  const [started, setStarted] = useState(false)
  const [currentIndex, setCurrentIndex] = useState(0)
  const [answers, setAnswers] = useState<Record<string, number>>({})
  const [submitting, setSubmitting] = useState(false)
  const [result, setResult] = useState<PlacementResult | null>(null)
  const [alreadyTaken, setAlreadyTaken] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const totalQuestions = questions.length
  const currentQuestion = questions[currentIndex]
  const progress = totalQuestions > 0 ? ((currentIndex) / totalQuestions) * 100 : 0
  const selectedAnswer = currentQuestion ? answers[currentQuestion.id] : undefined
  const currentTier = normalizeTier(currentQuestion?.difficulty_level) || 'basic'

  useEffect(() => {
    if (authLoading) return
    if (!user) {
      router.push('/masuk')
      return
    }
    fetchGate()
    fetchLanguages()
  }, [user, authLoading])

  async function fetchGate() {
    try {
      const [{ data: payRes }, { data: settingsRes }] = await Promise.all([
        supabase
          .from('payments')
          .select('*')
          .eq('user_id', user!.id)
          .eq('purpose', 'placement')
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle(),
        supabase.from('system_settings').select('key, value'),
      ])

      if (settingsRes) {
        const map: Record<string, string> = {}
        for (const row of settingsRes) map[row.key] = String(row.value ?? '')
        setGateSettings(map)
      }

      if (payRes) {
        const pay = payRes as unknown as Payment
        setPlacementPayment(pay)
        if (pay.status === 'approved') {
          const validUntil = new Date(pay.paid_at || pay.updated_at).getTime() + ACCESS_MS
          const expired = Date.now() > validUntil
          setAccessExpired(expired)
          setAccess(expired ? 'unpaid' : 'granted')
        } else if (pay.status === 'pending') {
          setAccess('pending')
        } else {
          setAccessExpired(true)
          setAccess('unpaid')
        }
      } else {
        setAccess('unpaid')
      }
    } catch (err) {
      console.error('Failed to fetch placement payment', err)
      setAccess('granted')
    }
  }

  async function handlePurchase() {
    setPurchasing(true)
    setPurchaseError(null)
    try {
      const res = await fetch('/api/placement/purchase', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })
      const data = await res.json()
      if (res.ok) {
        await fetchGate()
      } else {
        setPurchaseError(data.error || t('student2.test.payError'))
      }
    } catch {
      setPurchaseError(t('student2.test.payError'))
    } finally {
      setPurchasing(false)
    }
  }

  function copyToClipboard(text: string) {
    navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  function formatPrice(n: number): string {
    return new Intl.NumberFormat(locale, { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(n)
  }

  function formatAccessUntil(): string {
    if (!placementPayment?.paid_at && !placementPayment?.updated_at) return ''
    const until = new Date(new Date(placementPayment.paid_at || placementPayment.updated_at).getTime() + ACCESS_MS)
    return new Intl.DateTimeFormat(locale, { dateStyle: 'long', timeStyle: 'short' }).format(until)
  }

  async function fetchLanguages() {
    setLanguageLoading(true)
    try {
      const { data, error: langError } = await supabase
        .from('languages')
        .select('*')
        .eq('is_active', true)
        .order('sort_order')

      if (langError) throw langError
      if (data) {
        setLanguages(data as Language[])
      }
    } catch (err) {
      console.error('Failed to fetch languages', err)
      setError(t('student2.test.fetchLangError'))
    } finally {
      setLanguageLoading(false)
    }
  }

  async function handleLanguageSelect(code: string) {
    setSelectedLanguage(code)
    setQuestionsLoading(true)
    setError(null)

    try {
      // Aturan 1x: jika sudah punya hasil placement test (bahasa apa pun),
      // tidak boleh mengerjakan test lagi
      const { data: anyResult, error: anyResultError } = await supabase
        .from('placement_results')
        .select('score, provisional_level, test_id, total_questions, completed_at')
        .eq('user_id', user!.id)
        .order('completed_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (anyResultError) throw anyResultError

      if (anyResult) {
        const resultTest = await supabase
          .from('placement_tests')
          .select('language_code')
          .eq('id', anyResult.test_id)
          .maybeSingle()

        let total = anyResult.total_questions || 0
        if (!total && anyResult.test_id) {
          const { count } = await supabase
            .from('placement_questions_student')
            .select('id', { count: 'exact', head: true })
            .eq('test_id', anyResult.test_id)
          total = count || 0
        }

        setAlreadyTaken(true)
        setResult({
          score: anyResult.score,
          level: anyResult.provisional_level,
          total,
          language_code: resultTest.data?.language_code || code,
        })
        setQuestionsLoading(false)
        return
      }

      // Find active test for this language to check existing results
      const { data: testData, error: testError } = await supabase
        .from('placement_tests')
        .select('id')
        .eq('language_code', code)
        .eq('is_active', true)
        .maybeSingle()

      if (testError) throw testError

      setAlreadyTaken(false)
      setResult(null)

      // Fetch questions for the active test (view tanpa correct_answer)
      const qQuery = supabase
        .from('placement_questions_student')
        .select('*')
        .order('difficulty_level', { ascending: true })
      const questionsQuery = testData
        ? qQuery.eq('test_id', testData.id)
        : qQuery.eq('language_code', code)
      const { data: qData, error: qError } = await questionsQuery

      if (qError) throw qError

      if (qData) {
        setQuestions(qData as Question[])
      } else {
        setQuestions([])
      }

      // Reset test state
      setStarted(false)
      setCurrentIndex(0)
      setAnswers({})
    } catch (err) {
      console.error('Failed to load placement data', err)
      setError(t('student2.test.fetchTestError'))
    } finally {
      setQuestionsLoading(false)
    }
  }

  function handleSelectOption(index: number) {
    if (!currentQuestion) return
    setAnswers((prev) => ({ ...prev, [currentQuestion.id]: index }))
  }

  function handleNext() {
    if (currentIndex < totalQuestions - 1) {
      setCurrentIndex((i) => i + 1)
    }
  }

  function handlePrevious() {
    if (currentIndex > 0) {
      setCurrentIndex((i) => i - 1)
    }
  }

  async function handleSubmit() {
    setSubmitting(true)
    try {
      const res = await fetch('/api/placement', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ answers, language_code: selectedLanguage }),
      })
      const data = await res.json()
      if (res.ok) {
        setResult({ score: data.score, level: data.level, total: totalQuestions, language_code: selectedLanguage! })
      } else {
        setError(data.error || t('student2.test.submitError'))
      }
    } catch {
      setError(t('student2.test.submitError'))
    } finally {
      setSubmitting(false)
    }
  }

  function handleBackToLanguageSelect() {
    setSelectedLanguage(null)
    setQuestions([])
    setResult(null)
    setAlreadyTaken(false)
    setStarted(false)
    setCurrentIndex(0)
    setAnswers({})
    setError(null)
  }

  function getSelectedLanguageData(): Language | undefined {
    return languages.find((l) => l.code === selectedLanguage)
  }

  // ========== RENDER BRANCHES ==========

  if (authLoading || access === 'loading' || languageLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center space-y-4">
          <Loader2 className="h-8 w-8 animate-spin text-indigo-400 mx-auto" />
          <p className="text-on-surface-variant">{t('student2.test.loading')}</p>
        </div>
      </div>
    )
  }

  if (!user) return null

  // Gate 0 — Pembayaran
  if (access === 'unpaid' || access === 'pending') {
    return (
      <PaymentGateView
        status={access}
        expired={accessExpired}
        payment={placementPayment}
        settings={gateSettings}
        price={Number(gateSettings.placement_test_price || 599000)}
        bonus={Number(gateSettings.placement_bonus_meetings || 2)}
        personalityLink={gateSettings.personality_test_link || ''}
        purchasing={purchasing}
        error={purchaseError}
        copied={copied}
        formatPrice={formatPrice}
        onPurchase={handlePurchase}
        onCopy={copyToClipboard}
      />
    )
  }

  // Step 1 — Language Selection
  if (!selectedLanguage) {
    return (
      <LanguageSelectView
        languages={languages}
        onSelect={handleLanguageSelect}
        error={error}
        personalityLink={gateSettings.personality_test_link || ''}
        accessUntilLabel={formatAccessUntil()}
      />
    )
  }

  if (questionsLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center space-y-4">
          <Loader2 className="h-8 w-8 animate-spin text-indigo-400 mx-auto" />
          <p className="text-on-surface-variant">{t('student2.test.loadingQuestions')}</p>
        </div>
      </div>
    )
  }

  if (error && !result) {
    return (
      <ErrorView
        error={error}
        onRetry={() => handleLanguageSelect(selectedLanguage)}
        onBack={handleBackToLanguageSelect}
      />
    )
  }

  // Step 2 — Already taken → Show Result (tidak bisa diulang: aturan 1x)
  if (alreadyTaken && result) {
    return (
      <ResultView
        result={result}
        languageCode={selectedLanguage}
        languageData={getSelectedLanguageData()}
      />
    )
  }

  // Step 3 — Intro
  if (!started) {
    return (
      <IntroView
        onStart={() => setStarted(true)}
        questionCount={totalQuestions}
        languageData={getSelectedLanguageData()}
        onBack={handleBackToLanguageSelect}
      />
    )
  }

  // Step 4 — Result (after submission)
  if (result) {
    return (
      <ResultView
        result={result}
        languageCode={selectedLanguage}
        languageData={getSelectedLanguageData()}
      />
    )
  }

  // Step 5 — No questions available
  if (questions.length === 0) {
    return (
      <div className="mx-auto max-w-2xl space-y-6 text-center">
        <div className="rounded-full bg-amber-500/10 p-4 w-fit mx-auto">
          <FileText className="h-10 w-10 text-amber-400" />
        </div>
        <h2 className="text-xl font-bold text-on-surface">{t('student2.test.noQuestionsTitle')}</h2>
        <p className="text-on-surface-variant">
          {t('student2.test.noQuestionsDesc', { language: languageLabel(lang, t, getSelectedLanguageData()) || selectedLanguage })}
        </p>
        <Button onClick={handleBackToLanguageSelect} variant="outline">
          <Globe2 className="mr-2 h-4 w-4" /> {t('student2.test.chooseOtherLanguage')}
        </Button>
      </div>
    )
  }

  // Step 6 — Test Questions
  const allAnswered = Object.keys(answers).length === totalQuestions && totalQuestions > 0
  const hasSelection = selectedAnswer !== undefined

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      {/* Language indicator + back button */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={handleBackToLanguageSelect} className="shrink-0">
            <ChevronLeft className="h-4 w-4 mr-1" /> {t('student2.test.change')}
          </Button>
          <div className="h-5 w-px bg-border" />
          <div className="flex items-center gap-2">
            <Flag emoji={getSelectedLanguageData()?.flag_emoji} className="h-5 w-auto" />
            <span className="font-medium text-on-surface text-sm">
              {languageLabel(lang, t, getSelectedLanguageData()) || selectedLanguage}
            </span>
          </div>
        </div>
        <span className="text-sm text-on-surface-variant">
          {t('student2.test.questionOf', { current: currentIndex + 1, total: totalQuestions })}
        </span>
      </div>

      {/* Progress bar */}
      <div className="space-y-2">
        <div className="flex justify-between text-xs text-muted">
          <span>{t(`common.tier.${currentTier}`)}</span>
          <span>{Math.round(progress)}%</span>
        </div>
        <div className="h-2 rounded-full bg-surface-container-highest overflow-hidden">
          <div
            className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-indigo-400 transition-all duration-500"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      <AnimatePresence mode="wait">
        <motion.div
          key={currentQuestion.id}
          initial={{ opacity: 0, x: 40 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -40 }}
          transition={{ duration: 0.25, ease: 'easeInOut' }}
        >
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2 mb-1 flex-wrap">
                {/* Type badge */}
                {currentQuestion.question_type === 'listening' && (
                  <Badge className="bg-purple-500/15 text-purple-400 border-purple-500/30">
                    <Volume2 className="h-3 w-3 mr-1" /> {t('student2.test.typeListening')}
                  </Badge>
                )}
                {currentQuestion.question_type === 'reading' && (
                  <Badge className="bg-blue-500/15 text-blue-400 border-blue-500/30">
                    <BookOpenText className="h-3 w-3 mr-1" /> {t('student2.test.typeReading')}
                  </Badge>
                )}
                {(!currentQuestion.question_type || currentQuestion.question_type === 'grammar') && (
                  <Badge className="bg-emerald-500/15 text-emerald-400 border-emerald-500/30">
                    {t('student2.test.typeGrammar')}
                  </Badge>
                )}
                <Badge variant="outline">{t(`common.tier.${currentTier}`)}</Badge>
              </div>

              {/* Listening: audio play button instead of question text */}
              {currentQuestion.question_type === 'listening' && (
                <div className="flex flex-col items-center py-6 space-y-3">
                  <div className="h-20 w-20 rounded-full bg-purple-500/10 border border-purple-500/20 flex items-center justify-center">
                    <Volume2 className="h-10 w-10 text-purple-400" />
                  </div>
                  <span className="text-sm text-purple-300 font-medium">{t('student2.test.playAudio')}</span>
                  {currentQuestion.audio_url && (
                    <audio
                      key={currentQuestion.id}
                      controls
                      className="w-full max-w-sm mt-2"
                      controlsList="nodownload noremoteplayback"
                    >
                      <source src={currentQuestion.audio_url} type="audio/mpeg" />
                      {t('student2.test.audioNotSupported')}
                    </audio>
                  )}
                </div>
              )}

              {/* Reading: passage box + question text */}
              {currentQuestion.question_type === 'reading' && (
                <div className="space-y-3">
                  {currentQuestion.passage_text && (
                    <div className="max-h-48 overflow-y-auto rounded-xl bg-surface-container-low border border-border p-4 text-sm text-on-surface-variant leading-relaxed">
                      {currentQuestion.passage_text}
                    </div>
                  )}
                  <CardTitle className="text-lg sm:text-xl leading-relaxed">
                    {currentQuestion.question_text}
                  </CardTitle>
                </div>
              )}

              {/* Grammar: just question text */}
              {(!currentQuestion.question_type || currentQuestion.question_type === 'grammar') && (
                <CardTitle className="text-lg sm:text-xl leading-relaxed">
                  {currentQuestion.question_text}
                </CardTitle>
              )}
            </CardHeader>
            <CardContent className="space-y-3">
              {currentQuestion.options.map((option, idx) => {
                const isSelected = selectedAnswer === idx
                const letter = String.fromCharCode(65 + idx)
                return (
                  <button
                    key={idx}
                    onClick={() => handleSelectOption(idx)}
                    className={cn(
                      'w-full text-left p-4 rounded-xl border transition-all duration-200',
                      'hover:border-indigo-500/40 hover:bg-indigo-500/5',
                      isSelected
                        ? 'border-indigo-500 bg-indigo-500/10 ring-1 ring-indigo-500/30'
                        : 'border-border bg-surface-container-low'
                    )}
                  >
                    <div className="flex items-start gap-3">
                      <span
                        className={cn(
                          'flex items-center justify-center h-7 w-7 rounded-full text-sm font-medium shrink-0 transition-colors',
                          isSelected
                            ? 'bg-indigo-500 text-white'
                            : 'bg-surface-container-highest text-on-surface-variant'
                        )}
                      >
                        {letter}
                      </span>
                      <span className="pt-0.5 text-on-surface">{option}</span>
                    </div>
                  </button>
                )
              })}
            </CardContent>
          </Card>
        </motion.div>
      </AnimatePresence>

      <div className="flex items-center justify-between">
        <Button
          variant="ghost"
          onClick={handlePrevious}
          disabled={currentIndex === 0}
        >
          <ChevronLeft className="h-4 w-4 mr-1" /> {t('student2.test.previous')}
        </Button>

        {currentIndex === totalQuestions - 1 ? (
          <Button onClick={handleSubmit} loading={submitting} disabled={!allAnswered}>
            {submitting ? t('student2.test.submitting') : t('student2.test.submitTest')} <CheckCircle className="ml-2 h-4 w-4" />
          </Button>
        ) : (
          <Button onClick={handleNext} disabled={!hasSelection}>
            {t('student2.test.next')} <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
        )}
      </div>

      {error && (
        <div className="rounded-lg bg-red-500/10 border border-red-500/20 p-3 text-sm text-red-400">
          {error}
        </div>
      )}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Payment Gate View                                                   */
/* ------------------------------------------------------------------ */

function PaymentGateView({
  status,
  expired,
  payment,
  settings,
  price,
  bonus,
  personalityLink,
  purchasing,
  error,
  copied,
  formatPrice,
  onPurchase,
  onCopy,
}: {
  status: 'unpaid' | 'pending'
  expired: boolean
  payment: (Payment & { user?: any }) | null
  settings: Record<string, string>
  price: number
  bonus: number
  personalityLink: string
  purchasing: boolean
  error: string | null
  copied: boolean
  formatPrice: (n: number) => string
  onPurchase: () => void
  onCopy: (text: string) => void
}) {
  const { t } = useI18n()

  const whatsappLink = settings.whatsapp_number
    ? `https://wa.me/${settings.whatsapp_number.replace(/[^0-9]/g, '')}?text=Halo%20admin%2C%20saya%20ingin%20konfirmasi%20pembayaran%20untuk%20${encodeURIComponent(payment?.invoice_number || '')}`
    : ''

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="text-center space-y-2">
        <div className="inline-flex items-center gap-2 rounded-full bg-indigo-500/10 border border-indigo-500/20 px-4 py-1.5 text-sm text-indigo-300 mb-2">
          <Lock className="h-4 w-4" />
          <span>{t('student2.test.payGateBadge')}</span>
        </div>
        <h1 className="text-3xl font-bold text-on-surface sm:text-4xl">
          {t('student2.test.payGateTitle')}
        </h1>
        <p className="text-on-surface-variant text-lg max-w-lg mx-auto">
          {t('student2.test.payGateDesc')}
        </p>
      </div>

      {expired && (
        <div className="mx-auto max-w-lg rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-300 flex items-start gap-2.5">
          <Clock className="h-4 w-4 shrink-0 mt-0.5" />
          <span>{t('student2.test.payExpiredDesc')}</span>
        </div>
      )}

      <div className="grid gap-5 sm:grid-cols-2">
        <Card className="border-indigo-500/20 bg-indigo-500/5">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Sparkles className="h-5 w-5 text-indigo-400" /> {t('student2.test.payIncludesTitle')}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {[
              { icon: Globe2, text: t('student2.test.payIncludeLanguage') },
              { icon: Users, text: t('student2.test.payIncludePersonality') },
              { icon: Award, text: t('student2.test.payIncludeBonus', { count: bonus }) },
            ].map((item) => (
              <div key={item.text} className="flex items-start gap-2.5 text-sm text-on-surface-variant">
                <item.icon className="h-4 w-4 text-indigo-400 shrink-0 mt-0.5" />
                <span>{item.text}</span>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <CreditCard className="h-5 w-5 text-indigo-400" /> {t('student2.test.payPriceTitle')}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="text-center py-2">
              <p className="text-4xl font-bold text-indigo-400">{formatPrice(price)}</p>
              <p className="text-xs text-on-surface-variant mt-1">{t('student2.test.payPriceNote')}</p>
            </div>

            {status === 'unpaid' && (
              <Button size="lg" className="w-full" onClick={onPurchase} loading={purchasing}>
                {purchasing ? t('student2.test.payProcessing') : t('student2.test.payNow')}
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            )}

            {status === 'pending' && payment && (
              <div className="rounded-lg border border-warning/30 bg-warning/10 p-3">
                <div className="flex items-center gap-2 mb-1">
                  <Clock className="h-4 w-4 text-warning shrink-0" />
                  <p className="text-sm font-semibold text-on-surface">{t('student2.test.payPendingTitle')}</p>
                </div>
                <p className="text-xs text-on-surface-variant">{t('student2.test.payPendingDesc')}</p>
              </div>
            )}

            {error && (
              <div className="rounded-lg bg-red-500/10 border border-red-500/20 p-3 text-sm text-red-400">
                {error}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {status === 'pending' && payment && (
        <Card className="border-border">
          <CardContent className="space-y-4 p-5">
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="text-xs text-muted">{t('student2.test.payInvoice')}</span>
                <div className="flex items-center gap-2">
                  <p className="text-on-surface font-semibold">{payment.invoice_number}</p>
                  <button
                    onClick={() => onCopy(payment.invoice_number)}
                    aria-label={t('student2.test.payCopy')}
                    className="text-indigo-400 hover:text-indigo-300"
                  >
                    {copied ? <CheckCircle2 className="h-4 w-4 text-success" /> : <Copy className="h-4 w-4" />}
                  </button>
                </div>
              </div>
              <div>
                <span className="text-xs text-muted">{t('student2.test.payTotal')}</span>
                <p className="text-on-surface font-bold">{formatPrice(payment.amount)}</p>
              </div>
              {settings.bank_name && (
                <>
                  <div>
                    <span className="text-xs text-muted">{t('student2.test.payBank')}</span>
                    <p className="text-on-surface">{settings.bank_name}</p>
                  </div>
                  <div>
                    <span className="text-xs text-muted">{t('student2.test.payAccountNo')}</span>
                    <p className="text-on-surface font-semibold">{settings.bank_account}</p>
                  </div>
                </>
              )}
            </div>

            <div className="rounded-lg border border-border bg-surface-container-low p-4">
              <p className="text-xs text-muted uppercase font-semibold mb-2">{t('student1.pembayaran.paymentMethod')}</p>
              <ol className="space-y-1 text-sm text-on-surface list-decimal list-inside">
                <li>{t('student1.pembayaran.step1', { amount: formatPrice(payment.amount) })}</li>
                <li>{t('student1.pembayaran.step2')}</li>
                <li>{t('student1.pembayaran.step3')}</li>
                <li>{t('student1.pembayaran.step4')}</li>
              </ol>
            </div>

            {settings.whatsapp_number ? (
              <div className="rounded-lg border border-green-500/30 bg-green-500/10 p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Phone className="h-5 w-5 text-green-400" />
                  <span className="font-semibold text-on-surface">{t('student1.pembayaran.sendProofTitle')}</span>
                </div>
                <p className="text-sm text-on-surface-variant mb-2">{t('student1.pembayaran.sendProofDesc')}</p>
                <div className="flex items-center gap-2">
                  <a
                    href={whatsappLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-500 transition-colors"
                  >
                    <ExternalLink className="h-4 w-4" />
                    {settings.whatsapp_number}
                  </a>
                  <Button variant="ghost" size="sm" onClick={() => onCopy(settings.whatsapp_number)}>
                    {copied ? <CheckCircle2 className="h-4 w-4 text-success" /> : <Copy className="h-4 w-4" />}
                  </Button>
                </div>
              </div>
            ) : (
              <div className="rounded-lg border border-warning/30 bg-warning/10 p-3 flex items-center gap-2">
                <AlertCircle className="h-4 w-4 text-warning shrink-0" />
                <p className="text-sm text-on-surface-variant">{t('student1.pembayaran.noWhatsapp')}</p>
              </div>
            )}

            <div className="flex items-start gap-2 rounded-lg bg-indigo-500/10 border border-indigo-500/20 p-3">
              <ShieldCheck className="h-4 w-4 text-indigo-400 shrink-0 mt-0.5" />
              <p className="text-xs text-on-surface-variant">{t('student2.test.payVerifyNote')}</p>
            </div>
          </CardContent>
        </Card>
      )}

      {personalityLink ? (
        <Card className="border-purple-500/20 bg-purple-500/5">
          <CardContent className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 p-5">
            <div className="flex items-start gap-3">
              <Users className="h-5 w-5 text-purple-400 shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold text-on-surface">{t('student2.test.payPersonalityTitle')}</p>
                <p className="text-sm text-on-surface-variant">{t('student2.test.payPersonalityDesc')}</p>
              </div>
            </div>
            <a
              href={personalityLink}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex shrink-0 items-center gap-2 rounded-lg bg-purple-600 px-4 py-2 text-sm font-medium text-white hover:bg-purple-500 transition-colors"
            >
              {t('student2.test.payPersonalityCta')} <ExternalLink className="h-4 w-4" />
            </a>
          </CardContent>
        </Card>
      ) : (
        <Card className="border-border">
          <CardContent className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 p-5">
            <div className="flex items-start gap-3">
              <Users className="h-5 w-5 text-muted shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold text-on-surface">{t('student2.test.payPersonalityTitle')}</p>
                <p className="text-sm text-on-surface-variant">{t('student2.test.payPersonalitySoonDesc')}</p>
              </div>
            </div>
            <span className="inline-flex shrink-0 items-center gap-2 rounded-lg bg-surface-container-high px-4 py-2 text-sm font-medium text-muted cursor-not-allowed">
              <Clock className="h-4 w-4" /> {t('student2.test.payPersonalitySoon')}
            </span>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Language Selection View                                            */
/* ------------------------------------------------------------------ */

function LanguageSelectView({
  languages,
  onSelect,
  error,
  personalityLink,
  accessUntilLabel,
}: {
  languages: Language[]
  onSelect: (code: string) => void
  error: string | null
  personalityLink: string
  accessUntilLabel: string
}) {
  const { t, lang } = useI18n()

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <div className="text-center space-y-2">
        <div className="inline-flex items-center gap-2 rounded-full bg-indigo-500/10 border border-indigo-500/20 px-4 py-1.5 text-sm text-indigo-300 mb-2">
          <Globe2 className="h-4 w-4" />
          <span>{t('student2.placement.title')}</span>
        </div>
        <h1 className="text-3xl font-bold text-on-surface sm:text-4xl">
          {t('student2.test.selectLanguageTitle')}
        </h1>
        <p className="text-on-surface-variant text-lg max-w-lg mx-auto">
          {t('student2.test.selectLanguageDesc')}
        </p>
      </div>

      <div className="flex items-center justify-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-300 mx-auto max-w-lg">
        <CheckCircle2 className="h-4 w-4 shrink-0" />
        <span>{accessUntilLabel ? t('student2.test.payGrantedUntil', { date: accessUntilLabel }) : t('student2.test.payGrantedNote')}</span>
      </div>

      {personalityLink ? (
        <Card className="border-purple-500/20 bg-purple-500/5 max-w-lg mx-auto">
          <CardContent className="flex items-center justify-between gap-3 p-4">
            <div className="flex items-start gap-3">
              <Users className="h-5 w-5 text-purple-400 shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-semibold text-on-surface">{t('student2.test.payPersonalityTitle')}</p>
                <p className="text-xs text-on-surface-variant">{t('student2.test.payPersonalityDesc')}</p>
              </div>
            </div>
            <a
              href={personalityLink}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-purple-600 px-3 py-2 text-xs font-medium text-white hover:bg-purple-500 transition-colors"
            >
              {t('student2.test.payPersonalityCta')} <ExternalLink className="h-3.5 w-3.5" />
            </a>
          </CardContent>
        </Card>
      ) : (
        <Card className="border-border max-w-lg mx-auto">
          <CardContent className="flex items-center justify-between gap-3 p-4">
            <div className="flex items-start gap-3">
              <Users className="h-5 w-5 text-muted shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-semibold text-on-surface">{t('student2.test.payPersonalityTitle')}</p>
                <p className="text-xs text-on-surface-variant">{t('student2.test.payPersonalitySoonDesc')}</p>
              </div>
            </div>
            <span className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-surface-container-high px-3 py-2 text-xs font-medium text-muted cursor-not-allowed">
              <Clock className="h-3.5 w-3.5" /> {t('student2.test.payPersonalitySoon')}
            </span>
          </CardContent>
        </Card>
      )}

      {error && (
        <div className="rounded-xl bg-red-500/10 border border-red-500/20 p-4 text-sm text-red-400 text-center mx-auto max-w-md">
          {error}
        </div>
      )}

      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {languages.map((lg, idx) => (
          <motion.button
            key={lg.code}
            onClick={() => onSelect(lg.code)}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: idx * 0.05, duration: 0.3, ease: 'easeOut' }}
            whileHover={{ scale: 1.03, y: -4 }}
            whileTap={{ scale: 0.97 }}
            className="group relative flex flex-col items-center gap-4 rounded-2xl border border-border bg-surface p-8 text-center transition-all hover:border-indigo-500/40 hover:bg-indigo-500/[0.03] hover:shadow-lg hover:shadow-indigo-500/5"
          >
            {/* Hover glow */}
            <div className="absolute inset-0 rounded-2xl opacity-0 transition-opacity duration-300 group-hover:opacity-100 pointer-events-none"
              style={{
                background: 'radial-gradient(600px circle at 50% 30%, oklch(0.6 0.2 270 / 0.06), transparent 60%)',
              }}
            />
            <Flag emoji={lg.flag_emoji} className="relative h-12 w-auto" />
            <div className="relative">
              <p className="text-lg font-bold text-on-surface">{languageLabel(lang, t, lg)}</p>
              <p className="text-sm text-on-surface-variant mt-0.5">{lg.native_name}</p>
            </div>
            <div className="relative flex items-center gap-1 text-xs text-indigo-400 opacity-0 translate-y-1 transition-all group-hover:opacity-100 group-hover:translate-y-0">
              <span>{t('student2.test.startTest')}</span>
              <ArrowRight className="h-3 w-3" />
            </div>
          </motion.button>
        ))}
      </div>

      {languages.length === 0 && !error && (
        <div className="text-center py-12">
          <p className="text-on-surface-variant">{t('student2.test.noLanguages')}</p>
        </div>
      )}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Intro View                                                         */
/* ------------------------------------------------------------------ */

function IntroView({
  onStart,
  questionCount,
  languageData,
  onBack,
}: {
  onStart: () => void
  questionCount: number
  languageData?: Language
  onBack?: () => void
}) {
  const { t, lang } = useI18n()
  const langDisplay = languageData
    ? `${languageData.flag_emoji} ${languageLabel(lang, t, languageData)} (${languageData.native_name})`
    : ''

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="flex items-center gap-3">
        {onBack && (
          <Button variant="ghost" size="sm" onClick={onBack}>
            <ChevronLeft className="h-4 w-4 mr-1" /> {t('student2.test.changeLanguage')}
          </Button>
        )}
      </div>

      <div>
        <h1 className="text-2xl font-bold text-on-surface">{t('student2.placement.title')}</h1>
        <p className="text-on-surface-variant mt-1">
          {langDisplay
            ? t('student2.test.introTestYour', { language: languageLabel(lang, t, languageData) || '' })
            : t('student2.test.introSubtitle')}
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-indigo-400" /> {t('student2.test.beforeStarting')}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {languageData && (
            <div className="flex items-center gap-3 rounded-xl bg-indigo-500/10 border border-indigo-500/20 p-4">
              <Flag emoji={languageData.flag_emoji} className="h-8 w-auto" />
              <div>
                <p className="font-semibold text-on-surface">{languageLabel(lang, t, languageData)}</p>
                <p className="text-sm text-on-surface-variant">{languageData.native_name}</p>
              </div>
            </div>
          )}

          <p className="text-on-surface-variant leading-relaxed">
            {t('student2.test.introDesc', { language: languageLabel(lang, t, languageData) || '' })}
          </p>
          <div className="grid gap-3 sm:grid-cols-3">
            {[
              { icon: FileText, text: t('student2.test.questionCountShort', { count: questionCount }) },
              { icon: Clock, text: t('student2.test.noTimeLimit') },
              { icon: CheckCircle, text: t('student2.test.autoGradedShort') },
            ].map((item) => (
              <div
                key={item.text}
                className="flex items-center gap-2 rounded-lg bg-surface-container-low p-3 text-sm text-on-surface-variant"
              >
                <item.icon className="h-4 w-4 text-indigo-400 shrink-0" /> {item.text}
              </div>
            ))}
          </div>
          <div className="rounded-lg bg-indigo-500/10 border border-indigo-500/20 p-4">
            <p className="text-sm text-indigo-300">
              <strong>{t('student2.test.tips')}</strong> {t('student2.test.tipsDesc')}
            </p>
          </div>
          <Button size="lg" className="w-full" onClick={onStart}>
            {t('student2.test.startPlacementTest')} <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Result View                                                        */
/* ------------------------------------------------------------------ */

function ResultView({
  result,
  languageCode,
  languageData,
  onRetake,
}: {
  result: PlacementResult
  languageCode: string
  languageData?: Language
  onRetake?: () => void
}) {
  const { t, lang } = useI18n()
  const tier = normalizeTier(result.level) || 'basic'
  const resultInfo = {
    labelKey: `common.tier.${tier}`,
    color: tier === 'expert' ? 'bg-purple-500/20 text-purple-400' : tier === 'advance' ? 'bg-amber-500/20 text-amber-400' : 'bg-emerald-500/20 text-emerald-400',
    border: tier === 'expert' ? 'border-purple-500/30' : tier === 'advance' ? 'border-amber-500/30' : 'border-emerald-500/30',
    descKey: `student2.test.tier${tier.charAt(0).toUpperCase() + tier.slice(1)}Desc`,
  }
  const percentage = Math.round((result.score / result.total) * 100)
  const _langDisplay = languageData
    ? `${languageData.flag_emoji} ${languageLabel(lang, t, languageData)}`
    : languageCode.toUpperCase()

  // Store result in localStorage for cross-page access
  useEffect(() => {
    try {
      localStorage.setItem('placement_result', JSON.stringify({
        language_code: languageCode,
        level_code: result.level,
      }))
    } catch {}
  }, [languageCode, result.level])

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-on-surface">{t('student2.test.resultTitle')}</h1>
        <p className="text-on-surface-variant">{t('student2.test.resultSubtitle')}</p>
      </div>

      {/* Language Badge */}
      <Card className="border-indigo-500/20 bg-indigo-500/5">
        <CardContent className="flex items-center justify-between p-4">
          <div className="flex items-center gap-3">
            <span className="text-2xl">{languageData?.flag_emoji ? <Flag emoji={languageData.flag_emoji} className="h-6 w-auto" /> : '🌐'}</span>
            <div>
              <p className="font-semibold text-on-surface">{languageLabel(lang, t, languageData) || languageCode}</p>
              <p className="text-xs text-on-surface-variant">{languageData?.native_name || languageCode}</p>
            </div>
          </div>
          <Badge variant="outline" className="text-indigo-400 border-indigo-500/30">
            {languageCode.toUpperCase()}
          </Badge>
        </CardContent>
      </Card>

      <div className="grid gap-6 sm:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Award className="h-5 w-5 text-indigo-400" /> {t('student2.test.yourLevel')}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-center py-6 space-y-4">
            <div className="text-6xl font-bold text-indigo-400">{t(`common.tier.${tier}`)}</div>
            <Badge className={cn('text-sm px-3 py-1', resultInfo.color)}>
              {t(resultInfo.labelKey)}
            </Badge>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BarChart3 className="h-5 w-5 text-indigo-400" /> {t('student2.test.score')}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-center py-6 space-y-4">
            <div className="text-5xl font-bold text-on-surface">
              {result.score}<span className="text-xl text-muted">/{result.total}</span>
            </div>
            <div className="flex items-center justify-center gap-2 text-sm text-on-surface-variant">
              <div className="h-2 w-32 rounded-full bg-surface-container-highest overflow-hidden">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-indigo-400 transition-all duration-1000"
                  style={{ width: `${percentage}%` }}
                />
              </div>
              <span>{percentage}%</span>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className={cn('border', resultInfo.border)}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <GraduationCap className="h-5 w-5 text-indigo-400" /> {t('student2.test.meaning')}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-on-surface-variant leading-relaxed">{t(resultInfo.descKey)}</p>
        </CardContent>
      </Card>

      <div className="grid gap-3 sm:grid-cols-2">
        <Link
          href={`/student/kursus?tab=jelajahi&language_code=${languageCode}&level_code=${tier}`}
        >
          <Button className="w-full" size="lg">
            <GraduationCap className="mr-2 h-4 w-4" /> {t('student2.test.continueProgramTeacher')}
          </Button>
        </Link>
        <div className="flex gap-3">
          <Link href="/student/dashboard" className="flex-1">
            <Button variant="outline" className="w-full">
              <Sparkles className="mr-2 h-4 w-4" /> {t('student2.test.dashboard')}
            </Button>
          </Link>
          {onRetake && (
            <Button variant="ghost" size="icon" onClick={onRetake} title={t('student2.test.retakeTest')}>
              <FileText className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Error View                                                         */
/* ------------------------------------------------------------------ */

function ErrorView({
  error,
  onRetry,
  onBack,
}: {
  error: string
  onRetry: () => void
  onBack: () => void
}) {
  const { t } = useI18n()

  return (
    <div className="mx-auto max-w-md space-y-6 text-center">
      <div className="rounded-full bg-red-500/10 p-4 w-fit mx-auto">
        <XCircle className="h-10 w-10 text-red-400" />
      </div>
      <h2 className="text-xl font-bold text-on-surface">{t('student2.test.errorTitle')}</h2>
      <p className="text-on-surface-variant">{error}</p>
      <div className="flex gap-3 justify-center">
        <Button onClick={onRetry} variant="default">
          {t('student2.test.retry')}
        </Button>
        <Button onClick={onBack} variant="outline">
          <Globe2 className="mr-2 h-4 w-4" /> {t('student2.test.chooseOtherLanguage')}
        </Button>
      </div>
    </div>
  )
}
