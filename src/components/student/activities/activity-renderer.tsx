'use client'

import { useEffect, useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { computeActivityResult, type ActivityResult } from '@/lib/learning'
import { matchedWords, scoreTurn } from '@/lib/text-similarity'
import type { ActivityType, LessonActivity } from '@/types'
import { CheckCircle2, Check, Loader2, Pause, Play, Volume2, VolumeX, Mic } from 'lucide-react'
import { SpeakingReviewRenderer } from './speaking-review-renderer'
import { useI18n } from '@/lib/i18n/client'

export interface SubmitPayload {
  answers: Record<string, unknown>
  result: ActivityResult
}

export interface RendererProps {
  activity: LessonActivity
  content: Record<string, unknown>
  preview?: boolean
  taskId?: string
  batchId?: string
  onComplete: (payload: SubmitPayload) => void
}

function useTts(text: string, voiceURI: string | null, speed: number) {
  const [speaking, setSpeaking] = useState(false)
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([])
  useEffect(() => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return
    const load = () => setVoices(window.speechSynthesis.getVoices())
    load()
    window.speechSynthesis.addEventListener('voiceschanged', load)
    return () => window.speechSynthesis.removeEventListener('voiceschanged', load)
  }, [])
  // Pilih voice English paling jelas: Google US English > Microsoft (Aria/Zira/Jenny) > en-US pertama
  function pickVoice(): SpeechSynthesisVoice | null {
    if (voiceURI) {
      const exact = voices.find((x) => x.voiceURI === voiceURI)
      if (exact) return exact
    }
    const en = voices.filter((v) => v.lang?.toLowerCase().startsWith('en'))
    if (en.length === 0) return null
    const google = en.find((v) => /google us english/i.test(v.name))
    if (google) return google
    const ms = en.find((v) => /microsoft (aria|zira|jenny|emma)/i.test(v.name))
    if (ms) return ms
    const us = en.find((v) => /en-us/i.test(v.lang))
    if (us) return us
    return en[0]
  }
  const speak = () => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window) || !text) return
    window.speechSynthesis.cancel()
    const u = new SpeechSynthesisUtterance(text)
    const v = pickVoice()
    if (v) u.voice = v
    u.lang = v?.lang || 'en-US'
    u.rate = speed || 0.9 // sedikit lambat biar jelas
    u.pitch = 1
    u.volume = 1
    u.onend = () => setSpeaking(false)
    u.onerror = () => setSpeaking(false)
    setSpeaking(true)
    window.speechSynthesis.speak(u)
  }
  const stop = () => {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) window.speechSynthesis.cancel()
    setSpeaking(false)
  }
  return { speak, stop, speaking, ttsAvailable: typeof window !== 'undefined' && 'speechSynthesis' in window }
}

function ReadingRenderer({ content, onComplete }: RendererProps) {
  const { t } = useI18n()
  const text = (content.text as string) ?? ''
  const instructions = (content.instructions as string) ?? ''
  const [response, setResponse] = useState('')
  const [grading, setGrading] = useState(false)
  const [feedback, setFeedback] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const tts = useTts(text, null, 0.9)

  async function handleSubmit() {
    if (!response.trim()) return
    setGrading(true)
    setError(null)
    try {
      const res = await fetch('/api/ai/grade', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ activityType: 'reading', passage: text, studentResponse: response }),
      })
      const data = await res.json()
      if (data.error) {
        setError(data.error)
        onComplete({
          answers: { response, aiError: data.error },
          result: { score: 0, correct: 0, total: 1, completed: true },
        })
      } else if (data.score !== undefined) {
        setFeedback(data.feedback ?? null)
        onComplete({
          answers: { response, aiScore: data.score, aiFeedback: data.feedback, aiCorrections: data.corrections, aiGrammar: data.grammar, aiAccuracy: data.accuracy, aiComprehension: data.comprehension },
          result: { score: data.score, correct: data.score >= 70 ? 1 : 0, total: 1, completed: true },
        })
      } else {
        setError('No score returned from AI')
        onComplete({
          answers: { response },
          result: { score: 0, correct: 0, total: 1, completed: true },
        })
      }
    } catch (e) {
      setError('Failed to reach AI grading service')
      onComplete({
        answers: { response },
        result: { score: 0, correct: 0, total: 1, completed: true },
      })
    }
    setGrading(false)
  }

  return (
    <div className="space-y-4">
      {instructions && (
        <p className="text-sm font-medium text-on-surface-variant">{instructions}</p>
      )}
      <div className="rounded-xl border border-border bg-surface-container-low p-5">
        <div className="flex items-start justify-between gap-3">
          <p className="whitespace-pre-wrap text-sm leading-relaxed text-on-surface flex-1">{text}</p>
          <button
            type="button"
            onClick={() => tts.speaking ? tts.stop() : tts.speak()}
            disabled={!tts.ttsAvailable}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary hover:bg-primary/20 transition-colors disabled:opacity-30"
            title={tts.speaking ? 'Stop' : 'Dengarkan'}
          >
            {tts.speaking ? <Pause className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
          </button>
        </div>
        {tts.speaking && (
          <div className="mt-2 flex items-center gap-2 text-xs text-primary">
            <div className="h-1 w-1 rounded-full bg-primary animate-pulse" />
            Memutar...
          </div>
        )}
      </div>
      <div>
        <label className="mb-1 block text-sm font-medium text-on-surface">{t('activity.reading.yourSummary')}</label>
        <Textarea
          rows={6}
          value={response}
          onChange={(e) => setResponse(e.target.value)}
          placeholder={t('activity.reading.placeholder')}
          className="text-sm"
        />
      </div>
      {feedback && (
        <div className="rounded-xl border border-info/30 bg-info/5 p-4">
          <p className="mb-1 text-sm font-semibold text-info">{t('activity.common.aiFeedback')}</p>
          <p className="whitespace-pre-wrap text-sm text-on-surface">{feedback}</p>
        </div>
      )}
      {error && (
        <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4">
          <p className="mb-1 text-sm font-semibold text-destructive">{t('activity.common.error')}</p>
          <p className="whitespace-pre-wrap text-sm text-on-surface">{error}</p>
        </div>
      )}
      <div className="flex justify-end pt-2">
        <Button disabled={!response.trim() || grading} onClick={handleSubmit}>
          {grading ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-1 h-4 w-4" />}
          {grading ? t('activity.common.grading') : t('activity.common.submit')}
        </Button>
      </div>
    </div>
  )
}

function ListeningRenderer({ content, onComplete }: RendererProps) {
  const { t } = useI18n()
  const audioUrl = (content.audio_url as string) ?? ''
  const audioText = (content.audio_text as string) ?? ''
  const voice = (content.voice as string | null) ?? null
  const speed = (content.speed as number) ?? 1
  const instructions = (content.instructions as string) ?? ''
  const [response, setResponse] = useState('')
  const [grading, setGrading] = useState(false)
  const [feedback, setFeedback] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const tts = useTts(audioText, voice, speed)

  async function handleSubmit() {
    if (!response.trim()) return
    setGrading(true)
    setError(null)
    try {
      const res = await fetch('/api/ai/grade', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ activityType: 'listening', transcript: audioText, studentResponse: response }),
      })
      const data = await res.json()
      if (data.error) {
        setError(data.error)
        onComplete({
          answers: { response, aiError: data.error },
          result: { score: 0, correct: 0, total: 1, completed: true },
        })
      } else if (data.score !== undefined) {
        setFeedback(data.feedback ?? null)
        onComplete({
          answers: { response, aiScore: data.score, aiFeedback: data.feedback, aiCorrections: data.corrections, aiGrammar: data.grammar, aiAccuracy: data.accuracy, aiComprehension: data.comprehension },
          result: { score: data.score, correct: data.score >= 70 ? 1 : 0, total: 1, completed: true },
        })
      } else {
        setError('No score returned from AI')
        onComplete({
          answers: { response },
          result: { score: 0, correct: 0, total: 1, completed: true },
        })
      }
    } catch (e) {
      setError('Failed to reach AI grading service')
      onComplete({
        answers: { response },
        result: { score: 0, correct: 0, total: 1, completed: true },
      })
    }
    setGrading(false)
  }

  return (
    <div className="space-y-4">
      {instructions && (
        <p className="text-sm font-medium text-on-surface-variant">{instructions}</p>
      )}
      {audioUrl ? (
        <div className="rounded-xl border border-border bg-surface-container-low p-4">
          <audio controls src={audioUrl} className="w-full" />
        </div>
      ) : (
        <div className="rounded-xl border border-border bg-surface-container-low p-4">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={tts.speaking ? tts.stop : tts.speak}
              disabled={!tts.ttsAvailable || !audioText}
              className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-30 shadow-sm"
            >
              {tts.speaking ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5" />}
            </button>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-on-surface">
                {tts.speaking ? 'Memutar...' : 'Dengarkan audio'}
              </p>
              {!tts.ttsAvailable && (
                <p className="text-xs text-on-surface-variant">{t('activity.listening.ttsUnsupported')}</p>
              )}
            </div>
            {tts.speaking && (
              <div className="flex gap-1">
                {[0, 1, 2].map((i) => (
                  <div key={i} className="h-3 w-1 rounded-full bg-primary animate-pulse" style={{ animationDelay: `${i * 150}ms` }} />
                ))}
              </div>
            )}
          </div>
          {audioText && (
            <details className="mt-3 group">
              <summary className="cursor-pointer text-xs text-on-surface-variant hover:text-on-surface transition-colors">
                Lihat transkrip
              </summary>
              <p className="mt-2 whitespace-pre-wrap text-sm text-on-surface/80 leading-relaxed">{audioText}</p>
            </details>
          )}
        </div>
      )}
      <div>
        <label className="mb-1 block text-sm font-medium text-on-surface">{t('activity.listening.prompt')}</label>
        <Textarea
          rows={6}
          value={response}
          onChange={(e) => setResponse(e.target.value)}
          placeholder={t('activity.listening.placeholder')}
          className="text-sm"
        />
      </div>
      {feedback && (
        <div className="rounded-xl border border-info/30 bg-info/5 p-4">
          <p className="mb-1 text-sm font-semibold text-info">{t('activity.common.aiFeedback')}</p>
          <p className="whitespace-pre-wrap text-sm text-on-surface">{feedback}</p>
        </div>
      )}
      {error && (
        <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4">
          <p className="mb-1 text-sm font-semibold text-destructive">{t('activity.common.error')}</p>
          <p className="whitespace-pre-wrap text-sm text-on-surface">{error}</p>
        </div>
      )}
      <div className="flex justify-end pt-2">
        <Button disabled={!response.trim() || grading} onClick={handleSubmit}>
          {grading ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-1 h-4 w-4" />}
          {grading ? t('activity.common.grading') : t('activity.common.submit')}
        </Button>
      </div>
    </div>
  )
}

function ImageSpeakRenderer({ content, onComplete }: RendererProps) {
  const { t } = useI18n()
  const prompt = (content.prompt as string) ?? ''
  const images: string[] = Array.isArray(content.images) ? content.images : []
  const correctIndex = Number(content.correctIndex ?? 0)
  const expectedText = (content.expectedText as string) ?? prompt
  const threshold = Number(content.threshold ?? 0.9)
  const [selected, setSelected] = useState<number | null>(null)
  const [showMicView, setShowMicView] = useState(false)
  const [isRecording, setIsRecording] = useState(false)
  const [interimText, setInterimText] = useState('')
  const [transcript, setTranscript] = useState('')
  const [wordScores, setWordScores] = useState<{ word: string; accuracy: number }[] | null>(null)
  const [overall, setOverall] = useState<number | null>(null)
  const [feedback, setFeedback] = useState<string | null>(null)
  const [grading, setGrading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const tts = useTts(prompt, null, 0.9)

  useEffect(() => {
    if (!prompt || !tts.ttsAvailable) return
    const timer = setTimeout(() => tts.speak(), 600)
    return () => clearTimeout(timer)
  }, [prompt, tts.ttsAvailable])

  function handleSelect(idx: number) {
    setSelected(idx)
    if (idx === correctIndex) {
      setTimeout(() => tts.speak(), 300)
      setTimeout(() => setShowMicView(true), 1500)
    } else {
      setTimeout(() => setSelected(null), 600)
    }
  }

  async function handleRecord() {
    if (isRecording) return
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      stream.getTracks().forEach((tr) => tr.stop())
    } catch {
      setError('Izin mikrofon ditolak. Izinkan mikrofon di pengaturan browser, lalu coba lagi.')
      return
    }
    const SpeechRecognition = (window as any).webkitSpeechRecognition || (window as any).SpeechRecognition
    if (!SpeechRecognition) {
      setError('Browser ini tidak mendukung pengenalan suara. Gunakan Google Chrome.')
      return
    }
    setIsRecording(true)
    setError(null)
    setInterimText('')
    setTranscript('')
    setWordScores(null)
    setOverall(null)

    const recognition = new SpeechRecognition()
    recognition.lang = 'en-US'
    recognition.interimResults = true
    recognition.maxAlternatives = 1
    recognition.continuous = false

    recognition.onresult = async (event: any) => {
      let interim = ''
      let final = ''
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const t = event.results[i][0].transcript
        if (event.results[i].isFinal) {
          final += t
        } else {
          interim += t
        }
      }
      if (interim) setInterimText(interim)
      if (final) {
        setInterimText('')
        setTranscript(final)
        setIsRecording(false)
        setGrading(true)
        try {
          const res = await fetch('/api/pronunciation/score', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ expectedText, transcript: final, prompt }),
          })
          const data = await res.json()
          if (data.error) {
            setError(data.error)
          } else {
            setWordScores(data.word_scores ?? null)
            setOverall(data.overall ?? null)
            setFeedback(data.feedback ?? null)
            if (typeof data.overall === 'number' && data.overall >= threshold) {
              onComplete({
                answers: { selectedIndex: correctIndex, transcript: final, word_scores: data.word_scores, overall: data.overall, drive_link: data.drive_link },
                result: { score: Math.round(data.overall * 100), correct: 1, total: 1, completed: true },
              })
            }
          }
        } catch (e: any) {
          setError(e?.message || 'Failed to score')
        }
        setGrading(false)
      }
    }
    recognition.onerror = (e: any) => {
      setError(e?.error || 'Recognition failed')
      setIsRecording(false)
      setGrading(false)
    }
    recognition.onend = () => setIsRecording(false)
    recognition.start()
  }

  const canContinue = selected === correctIndex && overall !== null && overall >= threshold

  if (showMicView && selected === correctIndex) {
    return (
      <div className="flex flex-col items-center gap-4">
        <div className="flex gap-2">
          {images.slice(0, 4).map((src, idx) => (
            <div key={idx} className={`relative h-16 w-16 flex-shrink-0 overflow-hidden rounded-lg ${idx === correctIndex ? 'ring-2 ring-blue-500' : 'opacity-50'}`}>
              {src ? <img src={src} alt="" className="h-full w-full object-cover" /> : null}
            </div>
          ))}
        </div>

        <div className="relative w-full max-w-md overflow-hidden rounded-2xl">
          {images[correctIndex] ? (
            <img src={images[correctIndex]} alt="Correct" className="w-full object-cover" />
          ) : null}
          <button
            onClick={() => tts.speak()}
            className="absolute bottom-3 left-3 flex h-9 w-9 items-center justify-center rounded-full bg-black/50 text-white backdrop-blur-sm hover:bg-black/70"
          >
            <Volume2 className="h-4 w-4" />
          </button>
        </div>

        <p className="text-base font-medium text-white/80">{expectedText}</p>

        <button
          onClick={handleRecord}
          disabled={grading}
          className={`flex h-14 w-14 items-center justify-center rounded-full transition-all ${isRecording ? 'bg-destructive animate-pulse scale-110' : 'bg-primary hover:bg-primary/90 hover:scale-105'} shadow-lg`}
        >
          {grading ? <Loader2 className="h-6 w-6 animate-spin text-on-surface" /> : <Mic className="h-6 w-6 text-on-surface" />}
        </button>
        <p className="text-xs text-white/50">{isRecording ? 'Mendengarkan...' : grading ? 'Menilai...' : 'Tekan & ucapkan kalimatnya'}</p>

        {(interimText || transcript) && (
          <p className="text-sm text-white/60">
            {isRecording && interimText ? (
              <span className="text-white/40 italic">{interimText}...</span>
            ) : transcript ? (
              <>Kamu: &quot;{transcript}&quot;</>
            ) : null}
          </p>
        )}
        {wordScores && (
          <div className="w-full max-w-md space-y-2">
            <div className="flex flex-wrap gap-1 justify-center">
              {wordScores.map((w, i) => (
                <span key={i} className={`rounded px-2 py-0.5 text-sm font-medium ${w.accuracy >= 0.9 ? 'bg-success/20 text-success' : w.accuracy >= 0.7 ? 'bg-warning/20 text-warning' : 'bg-destructive/20 text-destructive'}`}>
                  {w.word}
                </span>
              ))}
            </div>
            <div className="flex items-center gap-2">
              <div className="h-2 flex-1 overflow-hidden rounded-full bg-white/10">
                <div className="h-full bg-gradient-to-r from-amber-400 to-emerald-400" style={{ width: `${Math.round((overall ?? 0) * 100)}%` }} />
              </div>
              <span className="text-xs font-bold text-white">{overall !== null ? Math.round(overall * 100) + '%' : ''}</span>
            </div>
            {feedback && <p className="text-xs text-white/50 text-center">{feedback}</p>}
            {overall !== null && overall < threshold && <p className="text-xs text-amber-400 text-center">Belum {Math.round(threshold * 100)}% — coba lagi.</p>}
          </div>
        )}
        {error && <p className="text-xs text-destructive">{error}</p>}

        <div className="flex gap-2 pt-2">
          {canContinue ? (
            <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700 text-white" onClick={() => onComplete({ answers: { selectedIndex: correctIndex, transcript, word_scores: wordScores, overall }, result: { score: Math.round((overall ?? 0) * 100), correct: 1, total: 1, completed: true } })}>
              Lanjut <CheckCircle2 className="ml-1 h-4 w-4" />
            </Button>
          ) : (
            <Button size="sm" variant="outline" className="border-white/20 text-white hover:bg-white/10" onClick={handleRecord} disabled={isRecording || grading}>
              {grading ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null} Coba Lagi
            </Button>
          )}
          <Button size="sm" variant="ghost" className="text-white/60 hover:text-white hover:bg-white/10" onClick={() => { setShowMicView(false); setSelected(null); setWordScores(null); setOverall(null); setTranscript(''); setInterimText(''); }}>
            Kembali
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between rounded-xl bg-surface-container-high px-4 py-3">
        <p className="text-sm font-medium text-on-surface">{prompt || '...'}</p>
        <button onClick={tts.speaking ? tts.stop : tts.speak} disabled={!tts.ttsAvailable} className="flex h-8 w-8 items-center justify-center rounded-full text-on-surface-variant hover:text-on-surface hover:bg-surface-container-low transition-colors">
          {tts.speaking ? <Pause className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
        </button>
      </div>

      <div className="grid grid-cols-2 gap-2">
        {images.slice(0, 4).map((src, idx) => {
          const isCorrect = idx === correctIndex
          const isSelected = selected === idx
          return (
            <button
              key={idx}
              onClick={() => handleSelect(idx)}
              className={`relative overflow-hidden rounded-xl transition-all ${isSelected && isCorrect ? 'ring-2 ring-success scale-[0.97]' : isSelected && !isCorrect ? 'ring-2 ring-destructive animate-pulse' : 'hover:ring-2 hover:ring-border-strong'}`}
            >
              {src ? (
                <img src={src} alt={`Option ${idx + 1}`} className="h-40 w-full object-cover sm:h-48" />
              ) : (
                <div className="flex h-40 w-full items-center justify-center bg-surface-container-high text-xs text-on-surface-variant sm:h-48">Upload required</div>
              )}
              {isSelected && isCorrect && (
                <span className="absolute inset-0 flex items-center justify-center bg-success/20">
                  <CheckCircle2 className="h-10 w-10 text-success drop-shadow-lg" />
                </span>
              )}
            </button>
          )
        })}
      </div>

      {selected !== null && selected !== correctIndex && (
        <p className="text-center text-xs font-medium text-destructive">Salah — coba lagi!</p>
      )}
    </div>
  )
}

function speakText(text: string) {
  try {
    if (typeof window === 'undefined' || !('speechSynthesis' in window) || !text) return
    window.speechSynthesis.cancel()
    const u = new SpeechSynthesisUtterance(text)
    u.lang = 'en-US'
    u.rate = 0.9
    window.speechSynthesis.speak(u)
  } catch { /* diam */ }
}

interface QuizItemState {
  picked: boolean
  score: number | null
  transcript: string
}

function ImageQuizRenderer({ content, onComplete }: RendererProps) {
  const items = useMemo(() => {
    const raw = Array.isArray(content.items) ? content.items : []
    return raw
      .filter((it) => it && typeof it === 'object' && String((it as { image?: unknown }).image ?? '').trim())
      .map((it) => {
        const o = it as { image?: unknown; options?: unknown; correctIndex?: unknown }
        const options = (Array.isArray(o.options) ? o.options : []).map((x) => String(x ?? '')).filter((s) => s.trim())
        return {
          image: String(o.image ?? ''),
          options,
          correctIndex: Math.min(Math.max(Number(o.correctIndex ?? 0), 0), Math.max(options.length - 1, 0)),
        }
      })
      .filter((it) => it.options.length >= 2)
  }, [content.items])
  const threshold = Math.min(Math.max(Number(content.threshold ?? 0.8), 0.5), 1)

  const [qIdx, setQIdx] = useState(0)
  const [pickedIdx, setPickedIdx] = useState<number | null>(null)
  const [wrongIdx, setWrongIdx] = useState<number | null>(null)
  const [speakingOpt, setSpeakingOpt] = useState<number | null>(null)
  const [states, setStates] = useState<Record<number, QuizItemState>>({})
  const [isRecording, setIsRecording] = useState(false)
  const [interimText, setInterimText] = useState('')
  const [transcript, setTranscript] = useState('')
  const [error, setError] = useState<string | null>(null)

  const item = items[qIdx]
  const done = states[qIdx]?.score != null && (states[qIdx]?.score ?? 0) >= Math.round(threshold * 100)
  const liveText = `${transcript} ${interimText}`.trim()
  const hits = useMemo(
    () => (item && pickedIdx === item.correctIndex ? matchedWords(item.options[item.correctIndex], liveText) : new Set<number>()),
    [item, pickedIdx, liveText],
  )

  function pick(i: number) {
    if (!item || done) return
    if (i === item.correctIndex) {
      setPickedIdx(i)
      setWrongIdx(null)
      speakText(item.options[i])
    } else {
      setWrongIdx(i)
      setTimeout(() => setWrongIdx((cur) => (cur === i ? null : cur)), 600)
    }
  }

  async function handleRecord() {
    if (isRecording || !item || pickedIdx !== item.correctIndex) return
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      stream.getTracks().forEach((tr) => tr.stop())
    } catch {
      setError('Izin mikrofon ditolak. Izinkan mikrofon di pengaturan browser, lalu coba lagi.')
      return
    }
    const SR = (window as unknown as Record<string, unknown>).SpeechRecognition || (window as unknown as Record<string, unknown>).webkitSpeechRecognition
    if (!SR) {
      setError('Browser ini tidak mendukung pengenalan suara. Gunakan Google Chrome.')
      return
    }
    setIsRecording(true)
    setError(null)
    setInterimText('')
    setTranscript('')
    try {
      const Rec = SR as new () => {
        lang: string; interimResults: boolean; continuous: boolean; maxAlternatives: number
        onresult: ((e: { resultIndex: number; results: Array<Array<{ transcript: string }> & { isFinal: boolean }> }) => void) | null
        onerror: ((e: { error?: string }) => void) | null
        onend: (() => void) | null
        start: () => void; stop: () => void
      }
      const rec = new Rec()
      rec.lang = 'en-US'
      rec.interimResults = true
      rec.continuous = false
      rec.maxAlternatives = 1
      rec.onresult = (e) => {
        let interim = ''
        let final = ''
        for (let i = e.resultIndex; i < e.results.length; i++) {
          const t = e.results[i][0].transcript
          if ((e.results[i] as { isFinal: boolean }).isFinal) final += t
          else interim += t
        }
        if (interim) setInterimText(interim)
        if (final) {
          setInterimText('')
          setTranscript(final.trim())
          setIsRecording(false)
          try { rec.stop() } catch { /* noop */ }
          const s = scoreTurn(item.options[item.correctIndex], final.trim(), []).score
          setStates((prev) => ({ ...prev, [qIdx]: { picked: true, score: s, transcript: final.trim() } }))
        }
      }
      rec.onerror = (e) => {
        setError(e?.error || 'Recognition failed')
        setIsRecording(false)
      }
      rec.onend = () => setIsRecording(false)
      rec.start()
    } catch {
      setError('Gagal memulai rekaman')
      setIsRecording(false)
    }
  }

  function next() {
    if (qIdx + 1 >= items.length) {
      const scores = items.map((_, i) => states[i]?.score ?? (i === qIdx ? states[qIdx]?.score ?? 0 : 0))
      const avg = Math.round(scores.reduce((a, b) => a + b, 0) / Math.max(scores.length, 1))
      const passed = scores.filter((s) => s >= Math.round(threshold * 100)).length
      onComplete({
        answers: { perItem: states, average: avg },
        result: { score: avg, correct: passed, total: items.length, completed: passed === items.length },
      })
      return
    }
    setQIdx((i) => i + 1)
    setPickedIdx(null)
    setWrongIdx(null)
    setTranscript('')
    setInterimText('')
    setError(null)
  }

  if (items.length === 0) {
    return <p className="py-8 text-center text-sm text-white/50">Soal belum tersedia.</p>
  }
  if (!item) return null

  const expectedWords = item.options[item.correctIndex].split(/(\s+)/)
  let wi = -1

  return (
    <div className="mx-auto w-full max-w-xl">
      {/* Strip soal */}
      <div className="flex gap-2 overflow-x-auto pb-2">
        {items.map((it, i) => {
          const st = states[i]
          const passed = st?.score != null && st.score >= Math.round(threshold * 100)
          const active = i === qIdx
          return (
            <div key={i} className="w-24 shrink-0 sm:w-28">
              <div className={`relative overflow-hidden rounded-lg border-2 ${active ? 'border-sky-400' : passed ? 'border-emerald-400/70' : 'border-white/10'}`}>
                <img src={it.image} alt="" className="h-16 w-full object-cover sm:h-20" />
                {passed && (
                  <span className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-sky-500">
                    <Check className="h-3 w-3 text-white" />
                  </span>
                )}
              </div>
              <p className="mt-1 truncate text-[11px] text-white/70">{it.options[it.correctIndex]}</p>
              {active && <p className="text-center text-[10px] leading-none text-white/60">^</p>}
            </div>
          )
        })}
      </div>

      {/* Gambar besar */}
      <div className="relative mt-1 overflow-hidden rounded-2xl border border-white/10">
        <img src={item.image} alt={`Soal ${qIdx + 1}`} className="max-h-[42vh] w-full object-cover" />
        {pickedIdx === item.correctIndex && (
          <div className="absolute inset-x-3 bottom-3 rounded-xl bg-slate-900/85 px-3 py-2 backdrop-blur">
            <p className="text-sm font-medium text-white">
              {expectedWords.map((w, i) => {
                if (!w.trim()) return <span key={i}>{w}</span>
                wi += 1
                return (
                  <span key={i} className={hits.has(wi) ? 'text-emerald-300' : undefined}>{w}</span>
                )
              })}
            </p>
          </div>
        )}
      </div>

      {/* Fase pilih */}
      {pickedIdx !== item.correctIndex && (
        <div className="mt-3 space-y-2">
          {item.options.map((opt, i) => (
            <div
              key={i}
              className={`flex w-full items-center justify-between gap-2 rounded-full border px-4 py-3 text-left text-sm text-white transition ${
                wrongIdx === i ? 'border-destructive bg-destructive/10' : 'border-white/15 bg-white/5 hover:border-sky-400/60'
              }`}
            >
              <button onClick={() => pick(i)} className="min-w-0 flex-1 truncate text-left">
                {opt}
              </button>
              <button
                onClick={() => { setSpeakingOpt(i); speakText(opt); setTimeout(() => setSpeakingOpt((c) => (c === i ? null : c)), 3000) }}
                aria-label={`Dengarkan opsi ${i + 1}`}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/10 hover:bg-white/20"
              >
                {speakingOpt === i ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
              </button>
            </div>
          ))}
          {wrongIdx !== null && <p className="text-center text-xs font-medium text-destructive">Belum tepat — coba lagi!</p>}
        </div>
      )}

      {/* Fase ucapkan */}
      {pickedIdx === item.correctIndex && !done && (
        <div className="mt-3 flex flex-col items-center gap-2">
          {(interimText || transcript) && (
            <p className="text-sm text-white/60">
              {transcript ? <>Kamu: &quot;{transcript}&quot;</> : <span className="italic text-white/40">{interimText}...</span>}
            </p>
          )}
          <button
            onClick={handleRecord}
            disabled={isRecording}
            aria-label="mic"
            className={`flex h-14 w-14 items-center justify-center rounded-full transition ${isRecording ? 'animate-pulse bg-red-500 text-white' : 'bg-amber-200/90 text-black hover:bg-amber-100'}`}
          >
            <Mic className="h-6 w-6" />
          </button>
          <p className="text-xs text-white/40">{isRecording ? 'Merekam… ucapkan kalimatnya' : 'Tekan mic lalu ucapkan captionnya'}</p>
          {error && <p className="text-xs text-destructive">{error}</p>}
        </div>
      )}

      {/* Hasil per soal */}
      {done && (
        <div className="mt-3 rounded-2xl border border-emerald-400/30 bg-emerald-400/10 p-4 text-center">
          <p className="text-sm font-bold text-emerald-300">Bagus! Kecocokan {states[qIdx]?.score}%</p>
          <Button size="sm" className="mt-2 rounded-full bg-white px-6 text-black hover:bg-white/90" onClick={next}>
            {qIdx + 1 >= items.length ? 'Selesai' : 'Soal Berikutnya'}
          </Button>
        </div>
      )}
    </div>
  )
}

export function ActivityRenderer(props: RendererProps) {
  const { t } = useI18n()
  const { activity } = props
  const wrap = (child: React.ReactNode) => (
    <div className="space-y-4">
      {activity.instruction && <p className="text-sm text-on-surface-variant">{activity.instruction}</p>}
      {child}
    </div>
  )
  switch (activity.activity_type as ActivityType) {
    case 'reading':
      return wrap(<ReadingRenderer {...props} />)
    case 'listening':
      return wrap(<ListeningRenderer {...props} />)
    case 'image_speak':
      return wrap(<ImageSpeakRenderer {...props} />)
    case 'image_quiz':
      return wrap(<ImageQuizRenderer {...props} />)
    case 'speaking_review':
      return wrap(<SpeakingReviewRenderer {...props} />)
    default:
      return <p className="py-10 text-center text-sm text-on-surface-variant">{t('activity.common.unsupported')}</p>
  }
}
