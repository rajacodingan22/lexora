'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { cn } from '@/lib/utils'
import {
  MessageCircle,
  X,
  Send,
  Bot,
  User,
  Sparkles,
  RefreshCw,
  Copy,
  Check,
  Trash2,
  LogIn,
  Eraser,
  Gift,
  ChevronsUpDown,
  CheckCircle2,
  BookOpen,
} from 'lucide-react'
import { useAuth } from '@/lib/auth-context'
import { createClient } from '@/lib/supabase-client'
import { useI18n } from '@/lib/i18n/client'

const LOCALE_MAP: Record<string, string> = { en: 'en-US', id: 'id-ID', zh: 'zh-CN' }

const GRADIENT = 'linear-gradient(135deg, oklch(0.83 0.15 200), oklch(0.66 0.22 290))'
const GIFT_GRADIENT = 'linear-gradient(135deg, oklch(0.85 0.15 85), oklch(0.75 0.18 45))'

interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
  error?: boolean
}

interface OfferData {
  code?: string
  discount_value?: number
  discount_type?: string
  expires_at?: string
  offered_reason?: string
  batch_id?: string
}

interface UserContext {
  languages: string
  levels: string
  courses: string
}

interface ActiveBatch {
  id: string
  name: string
  courseTitle: string
  status: string
}

const BATCH_KEY = 'lexora_chat_batch_id'
const SESSION_KEY = 'lexora_chat_session_id'

function formatTime(d: Date, locale: string): string {
  return new Intl.DateTimeFormat(locale, { hour: '2-digit', minute: '2-digit' }).format(d)
}

function formatDate(iso: string | undefined, locale: string): string {
  if (!iso) return ''
  return new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short' }).format(new Date(iso))
}

export function AIChatbot() {
  const { user } = useAuth()
  const { t, lang } = useI18n()
  const locale = LOCALE_MAP[lang] || 'en-US'
  const welcome = t('ui2.chat.welcome')
  const suggestions = [
    { label: t('ui2.chat.suggest1.label'), hint: t('ui2.chat.suggest1.hint') },
    { label: t('ui2.chat.suggest2.label'), hint: t('ui2.chat.suggest2.hint') },
    { label: t('ui2.chat.suggest3.label'), hint: t('ui2.chat.suggest3.hint') },
    { label: t('ui2.chat.suggest4.label'), hint: t('ui2.chat.suggest4.hint') },
  ]
  const [open, setOpen] = useState(false)
  const [messages, setMessages] = useState<ChatMessage[]>([
    { role: 'assistant', content: welcome },
  ])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [userCtx, setUserCtx] = useState<UserContext | null>(null)
  const [aiEnabled, setAiEnabled] = useState(true)
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null)
  const [sentAt, setSentAt] = useState<Date>(new Date())
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [loaded, setLoaded] = useState(false)
  const [activeBatches, setActiveBatches] = useState<ActiveBatch[]>([])
  const [batchId, setBatchId] = useState<string | null>(null)
  const [offer, setOffer] = useState<OfferData | null>(null)
  const [offerCopied, setOfferCopied] = useState(false)
  const [batchPickerOpen, setBatchPickerOpen] = useState(false)
  const [greetingPending, setGreetingPending] = useState(false)
  const [ctxReady, setCtxReady] = useState(false)
  const chatRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const messagesRef = useRef<ChatMessage[]>(messages)
  messagesRef.current = messages

  useEffect(() => {
    setMessages((prev) =>
      prev.length === 1 && prev[0].role === 'assistant'
        ? [{ role: 'assistant', content: welcome }]
        : prev
    )
  }, [welcome])

  // kill-switch dari system_settings
  useEffect(() => {
    const supabase = createClient()
    ;(async () => {
      try {
        const { data } = await supabase
          .from('system_settings')
          .select('key, value')
        const setting = (data ?? []).find((s) => s.key === 'ai_enabled')
        setAiEnabled(!setting || String(setting.value) !== 'false')
      } catch {
        // settings unavailable — keep enabled
      }
    })()
  }, [])

  // konteks user + daftar kelas aktif (untuk per-batch session)
  useEffect(() => {
    if (!open || !user) return
    const supabase = createClient()

    ;(async () => {
      try {
        const enrollRes = await supabase
          .from('enrollments')
          .select('*, course:courses(*, language:languages(*), level:language_levels(*)), batch:batches(id, name, status)')
          .eq('user_id', user.id)
          .in('status', ['active', 'pending'])

        const enrollments = (enrollRes.data ?? []) as any[]
        if (enrollments.length > 0) {
          const langs = [
            ...new Set(
              enrollments
                .map((e: any) => e.course?.language?.name?.en || e.course?.language_code)
                .filter(Boolean),
            ),
          ]
          const levels = [
            ...new Set(
              enrollments
                .map((e: any) => {
                  const lv = e.course?.level
                  return lv?.display_name?.en || lv?.code || e.course?.level_id
                })
                .filter(Boolean),
            ),
          ]
          const courses = enrollments
            .map((e: any) => e.course?.title?.en || e.course?.title?.id)
            .filter(Boolean)
          setUserCtx({
            languages: langs.join(', '),
            levels: levels.join(', '),
            courses: courses.join(', '),
          })

          // kelas aktif dengan batch → dropdown per-batch session
          const batches: ActiveBatch[] = enrollments
            .filter((e: any) => e.batch?.id && e.status === 'active')
            .map((e: any) => ({
              id: e.batch.id,
              name: e.batch.name || e.course?.title?.en || e.course?.title?.id || 'Kelas',
              courseTitle: e.course?.title?.en || e.course?.title?.id || '',
              status: e.batch.status || '',
            }))
          setActiveBatches(batches)
          // prefer batch yang terakhir dipakai user (persist di localStorage)
          const savedBatch = typeof window !== 'undefined' ? localStorage.getItem(BATCH_KEY) : null
          const savedValid = savedBatch && batches.some((b) => b.id === savedBatch)
          const target = savedValid ? savedBatch! : batches[0].id
          if (!batchId) {
            setBatchId(target)
          }
        } else {
          setUserCtx(null)
        }
      } catch {
        // Enrollments fetch failed — user context stays null
      } finally {
        setCtxReady(true)
      }
    })()
  }, [open, user, batchId])

  // load history + greeting saat dialog pertama kali dibuka
  // (tunggu ctxReady agar batchId sudah ter-resolve — kalau tidak,
  //  greet jalan dengan batch null, session umum kosong, history batch hilang)
  useEffect(() => {
    if (!open || !user || !ctxReady || loaded) return
    const loadSession = async () => {
      setGreetingPending(true)
      try {
        const res = await fetch('/api/ai/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'greet', batchId }),
        })
        if (!res.ok) throw new Error('greet failed')
        const data = await res.json()
        if (data.sessionId) {
          setSessionId(data.sessionId)
          try {
            localStorage.setItem(SESSION_KEY, data.sessionId)
            if (batchId) localStorage.setItem(BATCH_KEY, batchId)
          } catch {
            // storage unavailable
          }
        }

        const history = (data.history ?? []) as { role: string; content: string }[]
        if (history.length > 0) {
          setMessages(
            history.map((m) => ({
              role: m.role === 'user' ? 'user' : 'assistant',
              content: m.content,
            })),
          )
        } else if (data.greeting) {
          setMessages([{ role: 'assistant', content: data.greeting }])
        }
      } catch {
        // session load gagal — tetap pakai welcome statis
      } finally {
        setGreetingPending(false)
        setLoaded(true)
      }
    }
    loadSession()
  }, [open, user, loaded, batchId, ctxReady])

  useEffect(() => {
    if (chatRef.current) {
      chatRef.current.scrollTo({ top: chatRef.current.scrollHeight, behavior: 'smooth' })
    }
  }, [messages, loading, offer])

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 180)
  }, [open])

  const autoResize = useCallback(() => {
    const el = inputRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = Math.min(el.scrollHeight, 112) + 'px'
  }, [])

  const handleSend = useCallback(
    async (text?: string) => {
      const userMsg = (text ?? input).trim()
      if (!userMsg || loading) return
      setInput('')
      setError(null)
      setSentAt(new Date())
      if (inputRef.current) inputRef.current.style.height = 'auto'

      const userMessage: ChatMessage = { role: 'user', content: userMsg }
      setMessages((prev) => [...prev, userMessage])
      setLoading(true)

      try {
        const response = await fetch('/api/ai/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'chat',
            message: userMsg,
            language: userCtx?.languages || '',
            level: userCtx?.levels || '',
            courseContext: userCtx?.courses || '',
            sessionId,
            batchId,
          }),
        })

        if (!response.ok) {
          const errData = await response.json().catch(() => ({}))
          throw new Error(errData.error || 'API error (' + response.status + ')')
        }

        const data = await response.json()
        const reply = data.reply || t('ui2.chat.noReply')
        if (data.sessionId) setSessionId(data.sessionId)

        setMessages((prev) => [...prev, { role: 'assistant', content: reply }])
        if (data.offer) {
          setOffer(data.offer as OfferData)
          setOfferCopied(false)
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : t('ui2.chat.fetchError')
        setError(message)
        setMessages((prev) => [
          ...prev,
          {
            role: 'assistant',
            content: t('ui2.chat.errorTemplate', { message }),
            error: true,
          },
        ])
      } finally {
        setLoading(false)
      }
    },
    [input, loading, userCtx, t, sessionId, batchId],
  )

  const handleRetry = useCallback(() => {
    setMessages((prev) => {
      const last = prev[prev.length - 1]
      if (last.role === 'assistant' && last.error) {
        for (let i = prev.length - 2; i >= 0; i--) {
          if (prev[i].role === 'user') {
            setInput(prev[i].content)
            return prev.slice(0, i)
          }
        }
        return prev.slice(0, -1)
      }
      return prev
    })
    setError(null)
  }, [])

  const handleClear = useCallback(async () => {
    if (sessionId) {
      try {
        await fetch('/api/ai/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'clear', sessionId, batchId }),
        })
      } catch {
        // hapus lokal tetap jalan walau API gagal
      }
    }
    setMessages([{ role: 'assistant', content: welcome }])
    setSessionId(null)
    setOffer(null)
    setOfferCopied(false)
    setLoaded(false)
    setError(null)
    setInput('')
  }, [sessionId, batchId, welcome])

  const handleCopy = useCallback(async (content: string, idx: number) => {
    try {
      await navigator.clipboard.writeText(content)
      setCopiedIdx(idx)
      setTimeout(() => setCopiedIdx(null), 1500)
    } catch {
      // clipboard unavailable
    }
  }, [])

  const handleCopyOffer = useCallback(async (code: string) => {
    try {
      await navigator.clipboard.writeText(code)
      setOfferCopied(true)
      setTimeout(() => setOfferCopied(false), 2000)
    } catch {
      // clipboard unavailable
    }
  }, [])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault()
        handleSend()
      }
    },
    [handleSend],
  )

  const switchBatch = useCallback((id: string | null) => {
    setBatchId(id)
    setSessionId(null)
    setOffer(null)
    setOfferCopied(false)
    setLoaded(false)
    setMessages([{ role: 'assistant', content: welcome }])
    setBatchPickerOpen(false)
    try {
      if (id) localStorage.setItem(BATCH_KEY, id)
      localStorage.removeItem(SESSION_KEY)
    } catch {
      // storage unavailable
    }
  }, [welcome])

  if (!aiEnabled) return null

  const hasHistory = messages.length > 1
  const currentBatch = activeBatches.find((b) => b.id === batchId) || null

  return (
    <>
      {/* Launcher */}
      <button
        onClick={() => setOpen(!open)}
        aria-label={open ? t('ui2.chat.closeLauncher') : t('ui2.chat.openLauncher')}
        aria-expanded={open}
        className={cn(
          'group fixed bottom-6 right-6 z-50 flex h-14 w-14 items-center justify-center rounded-full text-primary-foreground shadow-lg transition-all duration-[var(--dur)] ease-[var(--ease-spring)] hover:scale-105 hover:shadow-glow',
          open && 'pointer-events-none rotate-90 scale-90 opacity-0',
        )}
        style={{ background: GRADIENT }}
      >
        {!open && (
          <span className="absolute inset-0 -z-10 animate-ping rounded-full bg-[oklch(0.66_0.22_290/0.35)]" />
        )}
        <MessageCircle className="size-6 transition-transform duration-[var(--dur)] group-hover:-rotate-6 group-hover:scale-110" />
        <span className="pointer-events-none absolute right-full mr-3 hidden whitespace-nowrap rounded-lg border border-border bg-surface-container-lowest px-2.5 py-1.5 text-xs font-medium text-on-surface shadow-md md:block md:opacity-0 md:transition-opacity md:duration-[var(--dur)] md:group-hover:opacity-100">
          {t('ui2.chat.tooltip')}
        </span>
      </button>

      {/* Dialog */}
      <div
        role="dialog"
        aria-label={t('ui2.chat.dialogLabel')}
        aria-modal="false"
        className={cn(
          'fixed bottom-6 right-6 z-50 flex w-[min(400px,calc(100vw-2rem))] flex-col overflow-hidden rounded-2xl border border-border bg-surface-container-lowest shadow-2xl transition-all duration-[var(--dur)] ease-[var(--ease-spring)]',
          open
            ? 'pointer-events-auto translate-y-0 scale-100 opacity-100'
            : 'pointer-events-none translate-y-4 scale-95 opacity-0',
        )}
        style={{ height: 'min(640px, calc(100dvh - 7rem))' }}
      >
        {/* Header */}
        <div
          className="relative flex items-center justify-between px-4 py-3"
          style={{ background: GRADIENT }}
        >
          <div className="pointer-events-none absolute inset-0 opacity-20 [background-image:radial-gradient(circle_at_1px_1px,white_1px,transparent_0)] [background-size:16px_16px]" />
          <div className="relative flex items-center gap-3">
            <div className="relative">
              <div className="flex h-10 w-10 items-center justify-center rounded-full border-2 border-white/40 bg-background/25 shadow-inner backdrop-blur">
                <Bot className="size-5 text-white" />
              </div>
              <span className="absolute -bottom-0.5 -right-0.5 flex size-3">
                <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-300 opacity-75" />
                <span className="relative inline-flex size-3 rounded-full border-2 border-white/60 bg-emerald-400" />
              </span>
            </div>
            <div>
              <p className="text-sm font-bold leading-tight text-white">Lexora AI</p>
              <p className="mt-0.5 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-white/85">
                <span className="inline-flex size-1.5 rounded-full bg-emerald-300" />
                {t('ui2.chat.statusOnline')}
              </p>
            </div>
          </div>
          <div className="relative flex items-center gap-1">
            {hasHistory && (
              <button
                onClick={handleClear}
                aria-label={t('ui2.chat.newConversation')}
                title={t('ui2.chat.newConversation')}
                className="rounded-full p-1.5 text-white/85 transition-colors hover:bg-white/20 hover:text-white"
              >
                <Eraser className="size-4" />
              </button>
            )}
            <button
              onClick={() => setOpen(false)}
              aria-label={t('ui2.chat.close')}
              className="rounded-full p-1.5 text-white/85 transition-colors hover:bg-white/20 hover:text-white"
            >
              <X className="size-4" />
            </button>
          </div>
        </div>

        {/* Batch selector (per-kelas context) */}
        {user && activeBatches.length > 0 && (
          <div className="relative border-b border-border bg-surface-container-low/60 px-4 py-2">
            <button
              onClick={() => setBatchPickerOpen((v) => !v)}
              className="flex w-full items-center gap-2 rounded-lg px-2 py-1 text-left transition-colors hover:bg-surface-container-high/60"
              aria-expanded={batchPickerOpen}
            >
              <BookOpen className="size-3.5 shrink-0 text-primary" />
              <span className="min-w-0 flex-1 truncate text-xs font-semibold text-on-surface">
                {currentBatch ? currentBatch.name : t('ui2.chat.generalChat')}
              </span>
              <span className="hidden max-w-[40%] truncate text-[10px] text-on-surface-variant sm:block">
                {currentBatch?.courseTitle || ''}
              </span>
              <ChevronsUpDown className="size-3 shrink-0 text-on-surface-variant" />
            </button>
            {batchPickerOpen && (
              <div className="absolute left-4 right-4 top-full z-20 mt-1 overflow-hidden rounded-xl border border-border bg-surface-container-lowest shadow-xl">
                {activeBatches.map((b) => (
                  <button
                    key={b.id}
                    onClick={() => switchBatch(b.id)}
                    className={cn(
                      'flex w-full items-center gap-2 px-3 py-2.5 text-left transition-colors hover:bg-primary-soft/50',
                      b.id === batchId && 'bg-primary-soft/40',
                    )}
                  >
                    <BookOpen className="size-3.5 shrink-0 text-primary" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-xs font-semibold text-on-surface">{b.name}</span>
                      <span className="block truncate text-[10px] text-on-surface-variant">{b.courseTitle}</span>
                    </span>
                    {b.id === batchId && <CheckCircle2 className="size-4 shrink-0 text-primary" />}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Messages */}
        <div
          ref={chatRef}
          aria-live="polite"
          className="flex-1 space-y-4 overflow-y-auto px-4 py-4 [scrollbar-width:thin]"
        >
          {greetingPending && messages.length <= 1 && (
            <div className="flex animate-fade-in items-end gap-2.5">
              <div className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary-soft text-primary">
                <Bot className="size-3.5" />
              </div>
              <div className="rounded-2xl rounded-bl-sm bg-surface-container-high px-4 py-3">
                <div className="flex items-center gap-2">
                  <div className="flex gap-1">
                    <span
                      className="size-2 animate-bounce rounded-full"
                      style={{ background: 'oklch(0.66 0.22 290)', animationDelay: '0ms' }}
                    />
                    <span
                      className="size-2 animate-bounce rounded-full"
                      style={{ background: 'oklch(0.66 0.22 290)', animationDelay: '150ms' }}
                    />
                    <span
                      className="size-2 animate-bounce rounded-full"
                      style={{ background: 'oklch(0.66 0.22 290)', animationDelay: '300ms' }}
                    />
                  </div>
                  <span className="text-xs text-on-surface-variant">{t('ui2.chat.typing')}</span>
                </div>
              </div>
            </div>
          )}

          {messages.map((msg, idx) => {
            const isUser = msg.role === 'user'
            const isFirstOfGroup =
              idx === 0 || messages[idx - 1]?.role !== msg.role
            return (
              <div
                key={idx}
                className={cn('flex animate-fade-in items-end gap-2.5', isUser && 'flex-row-reverse')}
              >
                <div
                  className={cn(
                    'flex size-7 shrink-0 items-center justify-center rounded-full transition-all',
                    isUser
                      ? 'bg-gradient-to-br from-accent to-primary text-primary-foreground shadow-sm'
                      : 'bg-primary-soft text-primary',
                    !isFirstOfGroup && 'opacity-0',
                  )}
                >
                  {isUser ? <User className="size-3.5" /> : <Bot className="size-3.5" />}
                </div>
                <div className={cn('flex max-w-[78%] flex-col', isUser && 'items-end')}>
                  <div
                    className={cn(
                      'group relative rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed whitespace-pre-wrap',
                      isUser
                        ? 'rounded-br-sm text-primary-foreground shadow-sm'
                        : msg.error
                          ? 'rounded-bl-sm border border-destructive/30 bg-destructive-soft text-destructive'
                          : 'rounded-bl-sm bg-surface-container-high text-on-surface',
                    )}
                    style={isUser ? { background: GRADIENT } : undefined}
                  >
                    {msg.content}
                    {!isUser && !msg.error && hasHistory && (
                      <button
                        onClick={() => handleCopy(msg.content, idx)}
                        aria-label={t('ui2.chat.copyAnswer')}
                        className="absolute -right-8 top-2 hidden size-7 items-center justify-center rounded-lg border border-border bg-surface-container-lowest text-on-surface-variant shadow-sm transition-all duration-[var(--dur-fast)] group-hover:flex hover:border-primary hover:text-primary"
                      >
                        {copiedIdx === idx ? (
                          <Check className="size-3.5 text-success" />
                        ) : (
                          <Copy className="size-3.5" />
                        )}
                      </button>
                    )}
                  </div>
                  <span
                    className={cn(
                      'mt-1 px-1 text-[9px] font-medium uppercase tracking-wider text-muted',
                      isUser && 'text-right',
                    )}
                  >
                    {formatTime(sentAt, locale)}
                  </span>
                </div>
              </div>
            )
          })}

          {loading && (
            <div className="flex animate-fade-in items-end gap-2.5">
              <div className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary-soft text-primary">
                <Bot className="size-3.5" />
              </div>
              <div className="rounded-2xl rounded-bl-sm bg-surface-container-high px-4 py-3">
                <div className="flex items-center gap-2">
                  <div className="flex gap-1">
                    <span
                      className="size-2 animate-bounce rounded-full"
                      style={{ background: 'oklch(0.66 0.22 290)', animationDelay: '0ms' }}
                    />
                    <span
                      className="size-2 animate-bounce rounded-full"
                      style={{ background: 'oklch(0.66 0.22 290)', animationDelay: '150ms' }}
                    />
                    <span
                      className="size-2 animate-bounce rounded-full"
                      style={{ background: 'oklch(0.66 0.22 290)', animationDelay: '300ms' }}
                    />
                  </div>
                  <span className="text-xs text-on-surface-variant">{t('ui2.chat.typing')}</span>
                </div>
              </div>
            </div>
          )}

          {/* Offer card */}
          {offer && (
            <div className="animate-fade-in">
              <div
                className="relative overflow-hidden rounded-2xl border border-amber-300/50 p-4 shadow-lg"
                style={{ background: GIFT_GRADIENT }}
              >
                <div className="pointer-events-none absolute inset-0 opacity-15 [background-image:radial-gradient(circle_at_1px_1px,white_1px,transparent_0)] [background-size:14px_14px]" />
                <div className="relative">
                  <div className="flex items-center gap-2">
                    <Gift className="size-4 text-white" />
                    <p className="text-xs font-bold uppercase tracking-wider text-white">
                      {t('ui2.chat.offerTitle')}
                    </p>
                  </div>
                  <p className="mt-2 text-2xl font-extrabold leading-none text-white">
                    {offer.discount_value != null ? `${offer.discount_value}%` : ''}
                    <span className="ml-1.5 text-sm font-semibold text-white/85">
                      {t('ui2.chat.offerDiscount')}
                    </span>
                  </p>
                  <p className="mt-2 text-xs leading-relaxed text-white/90">
                    {t('ui2.chat.offerDesc')}
                  </p>
                  {offer.code && (
                    <button
                      onClick={() => handleCopyOffer(offer.code!)}
                      className="mt-3 flex w-full items-center justify-between gap-2 rounded-xl border border-white/40 bg-white/15 px-3 py-2.5 backdrop-blur transition-colors hover:bg-white/25"
                    >
                      <code className="font-mono text-sm font-bold tracking-widest text-white">
                        {offer.code}
                      </code>
                      {offerCopied ? (
                        <span className="flex items-center gap-1 text-xs font-semibold text-white">
                          <Check className="size-3.5" /> {t('ui2.chat.offerCopied')}
                        </span>
                      ) : (
                        <span className="flex items-center gap-1 text-xs font-semibold text-white/85">
                          <Copy className="size-3.5" /> {t('ui2.chat.offerCopy')}
                        </span>
                      )}
                    </button>
                  )}
                  <p className="mt-2 text-[10px] text-white/80">
                    {t('ui2.chat.offerExpiry')} {formatDate(offer.expires_at, locale)}
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Suggestions */}
        {!hasHistory && !loading && !greetingPending && (
          <div className="border-t border-border px-4 pb-1 pt-3">
            <div className="mb-2 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-on-surface-variant">
              <Sparkles className="size-3 text-primary" />
              {t('ui2.chat.tryAsking')}
            </div>
            <div className="grid grid-cols-2 gap-2">
              {suggestions.map((s) => (
                <button
                  key={s.label}
                  onClick={() => handleSend(`${s.label}: ${s.hint}`)}
                  className="group flex flex-col items-start rounded-xl border border-border bg-surface-container-low px-3 py-2 text-left transition-all duration-[var(--dur-fast)] hover:-translate-y-0.5 hover:border-primary/40 hover:bg-primary-soft/60 hover:shadow-sm"
                >
                  <span className="text-xs font-semibold text-on-surface transition-colors group-hover:text-primary">
                    {s.label}
                  </span>
                  <span className="mt-0.5 line-clamp-1 text-[10px] text-on-surface-variant">
                    {s.hint}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Error actions */}
        {error && !loading && messages[messages.length - 1]?.error && (
          <div className="flex justify-center border-t border-border px-4 py-2">
            <button
              onClick={handleRetry}
              className="flex items-center gap-1.5 rounded-full border border-border bg-surface px-3 py-1 text-xs font-medium text-on-surface-variant transition-colors hover:border-primary hover:text-primary"
            >
              <RefreshCw className="size-3" /> {t('ui2.chat.retry')}
            </button>
          </div>
        )}

        {/* Input */}
        <div className="border-t border-border p-3">
          {user ? (
            <div className="flex items-end gap-2">
              <div className="relative flex-1">
                <textarea
                  ref={inputRef}
                  value={input}
                  onChange={(e) => {
                    setInput(e.target.value)
                    autoResize()
                  }}
                  onKeyDown={handleKeyDown}
                  rows={1}
                  placeholder={t('ui2.chat.placeholder')}
                  className="max-h-28 w-full resize-none rounded-xl border border-border bg-surface-container-low px-4 py-2.5 pr-9 text-sm text-on-surface placeholder:text-muted transition-all duration-[var(--dur-fast)] focus:border-primary focus:outline-none focus:ring-2 focus:ring-ring"
                  aria-label={t('ui2.chat.inputAria')}
                />
                <Sparkles className="absolute right-3 top-1/2 size-4 -translate-y-1/2 text-primary/60" />
              </div>
              <button
                onClick={() => handleSend()}
                disabled={!input.trim() || loading}
                aria-label={t('ui2.chat.sendAria')}
                className="flex size-10 shrink-0 items-center justify-center rounded-xl text-primary-foreground transition-all duration-[var(--dur-fast)] hover:scale-105 hover:shadow-glow disabled:scale-100 disabled:opacity-50"
                style={{ background: GRADIENT }}
              >
                {loading ? (
                  <span className="size-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
                ) : (
                  <Send className="size-4" />
                )}
              </button>
            </div>
          ) : (
            <div className="flex items-center justify-between gap-3 rounded-xl border border-border bg-surface-container-low px-4 py-3">
              <div className="flex items-center gap-2 text-xs text-on-surface-variant">
                <LogIn className="size-4 shrink-0 text-primary" />
                {t('ui2.chat.loginPrompt')}
              </div>
              <a
                href="/masuk"
                className="shrink-0 rounded-lg px-3 py-1.5 text-xs font-semibold text-primary-foreground transition-transform duration-[var(--dur-fast)] hover:scale-105"
                style={{ background: GRADIENT }}
              >
                {t('ui2.chat.login')}
              </a>
            </div>
          )}
          {user && (
            <p className="mt-1.5 flex items-center gap-1 text-[10px] text-on-surface-variant">
              <Trash2 className="size-2.5" />
              {t('ui2.chat.disclaimer')}
            </p>
          )}
        </div>
      </div>
    </>
  )
}