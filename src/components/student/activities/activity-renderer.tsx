'use client'

import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { computeActivityResult, type ActivityResult } from '@/lib/learning'
import type { ActivityType, LessonActivity } from '@/types'
import { CheckCircle2, Loader2, Pause, Play, Volume2, Mic } from 'lucide-react'
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
        <p className="text-sm font-medium text-indigo-700">{instructions}</p>
      )}
      <div className="rounded-xl border border-slate-200 bg-slate-50 p-5">
        <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-700">{text}</p>
      </div>
      <div>
        <label className="mb-1 block text-sm font-medium text-slate-700">{t('activity.reading.yourSummary')}</label>
        <Textarea
          rows={6}
          value={response}
          onChange={(e) => setResponse(e.target.value)}
          placeholder={t('activity.reading.placeholder')}
          className="text-sm"
        />
      </div>
      {feedback && (
        <div className="rounded-xl border border-indigo-200 bg-indigo-50 p-4">
          <p className="mb-1 text-sm font-semibold text-indigo-800">{t('activity.common.aiFeedback')}</p>
          <p className="whitespace-pre-wrap text-sm text-indigo-700">{feedback}</p>
        </div>
      )}
      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4">
          <p className="mb-1 text-sm font-semibold text-red-800">{t('activity.common.error')}</p>
          <p className="whitespace-pre-wrap text-sm text-red-700">{error}</p>
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
        <p className="text-sm font-medium text-indigo-700">{instructions}</p>
      )}
      {audioUrl ? (
        <audio controls src={audioUrl} className="w-full" />
      ) : (
        <div className="flex items-center gap-2 rounded-xl bg-slate-50 p-3">
          <Button size="sm" onClick={tts.speaking ? tts.stop : tts.speak} disabled={!tts.ttsAvailable || !audioText}>
            {tts.speaking ? <Pause className="mr-1 h-4 w-4" /> : <Play className="mr-1 h-4 w-4" />}
            {tts.speaking ? t('activity.listening.pause') : t('activity.listening.playAudio')}
          </Button>
          {!tts.ttsAvailable && <span className="text-xs text-slate-400">{t('activity.listening.ttsUnsupported')}</span>}
        </div>
      )}
      <div>
        <label className="mb-1 block text-sm font-medium text-slate-700">{t('activity.listening.prompt')}</label>
        <Textarea
          rows={6}
          value={response}
          onChange={(e) => setResponse(e.target.value)}
          placeholder={t('activity.listening.placeholder')}
          className="text-sm"
        />
      </div>
      {feedback && (
        <div className="rounded-xl border border-indigo-200 bg-indigo-50 p-4">
          <p className="mb-1 text-sm font-semibold text-indigo-800">{t('activity.common.aiFeedback')}</p>
          <p className="whitespace-pre-wrap text-sm text-indigo-700">{feedback}</p>
        </div>
      )}
      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4">
          <p className="mb-1 text-sm font-semibold text-red-800">{t('activity.common.error')}</p>
          <p className="whitespace-pre-wrap text-sm text-red-700">{error}</p>
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
          className={`flex h-14 w-14 items-center justify-center rounded-full transition-all ${isRecording ? 'bg-red-500 animate-pulse scale-110' : 'bg-amber-400 hover:bg-amber-300 hover:scale-105'} shadow-lg`}
        >
          {grading ? <Loader2 className="h-6 w-6 animate-spin text-slate-800" /> : <Mic className="h-6 w-6 text-slate-800" />}
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
                <span key={i} className={`rounded px-2 py-0.5 text-sm font-medium ${w.accuracy >= 0.9 ? 'bg-emerald-500/20 text-emerald-300' : w.accuracy >= 0.7 ? 'bg-amber-500/20 text-amber-300' : 'bg-red-500/20 text-red-300'}`}>
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
        {error && <p className="text-xs text-red-400">{error}</p>}

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
      <div className="flex items-center justify-between rounded-xl bg-slate-700/80 px-4 py-3">
        <p className="text-sm font-medium text-white">{prompt || '...'}</p>
        <button onClick={tts.speaking ? tts.stop : tts.speak} disabled={!tts.ttsAvailable} className="flex h-8 w-8 items-center justify-center rounded-full text-white/70 hover:text-white hover:bg-white/10 transition-colors">
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
              className={`relative overflow-hidden rounded-xl transition-all ${isSelected && isCorrect ? 'ring-2 ring-emerald-400 scale-[0.97]' : isSelected && !isCorrect ? 'ring-2 ring-red-500 animate-pulse' : 'hover:ring-2 hover:ring-white/20'}`}
            >
              {src ? (
                <img src={src} alt={`Option ${idx + 1}`} className="h-40 w-full object-cover sm:h-48" />
              ) : (
                <div className="flex h-40 w-full items-center justify-center bg-slate-700 text-xs text-slate-400 sm:h-48">Upload required</div>
              )}
              {isSelected && isCorrect && (
                <span className="absolute inset-0 flex items-center justify-center bg-emerald-500/20">
                  <CheckCircle2 className="h-10 w-10 text-emerald-400 drop-shadow-lg" />
                </span>
              )}
            </button>
          )
        })}
      </div>

      {selected !== null && selected !== correctIndex && (
        <p className="text-center text-xs font-medium text-red-400">Salah — coba lagi!</p>
      )}
    </div>
  )
}

export function ActivityRenderer(props: RendererProps) {
  const { t } = useI18n()
  const { activity } = props
  const wrap = (child: React.ReactNode) => (
    <div className="space-y-4">
      {activity.instruction && <p className="text-sm text-slate-600">{activity.instruction}</p>}
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
    case 'speaking_review':
      return wrap(<SpeakingReviewRenderer {...props} />)
    default:
      return <p className="py-10 text-center text-sm text-slate-400">{t('activity.common.unsupported')}</p>
  }
}
