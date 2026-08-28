'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { CheckCircle2, Loader2, Mic, Volume2, AlertTriangle, Clock, Send } from 'lucide-react'
import { useI18n } from '@/lib/i18n/client'
import type { RendererProps, SubmitPayload } from './activity-renderer'
import dynamic from 'next/dynamic'

const ComparisonView = dynamic(() => import('@/components/shared/comparison-view').then(m => ({ default: m.ComparisonView })), { ssr: false })

type Phase = 'prep' | 'listen' | 'record' | 'compare' | 'pending' | 'reviewed'

function useTtsAudio(text: string, rate: number) {
  const [audioUrl, setAudioUrl] = useState<string | null>(null)
  const [speaking, setSpeaking] = useState(false)
  const [available, setAvailable] = useState(false)
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null)

  useEffect(() => {
    setAvailable(typeof window !== 'undefined' && 'speechSynthesis' in window)
  }, [])

  const generateAudio = useCallback(async () => {
    if (!available || !text) return null
    // Use SpeechSynthesis to create an audio blob via AudioContext
    const synth = window.speechSynthesis
    const u = new SpeechSynthesisUtterance(text)
    const voices = synth.getVoices()
    const en = voices.filter(v => v.lang?.toLowerCase().startsWith('en'))
    const google = en.find(v => /google us english/i.test(v.name))
    const ms = en.find(v => /microsoft (aria|zira|jenny)/i.test(v.name))
    const us = en.find(v => /en-us/i.test(v.lang))
    u.voice = google || ms || us || en[0] || null
    u.lang = u.voice?.lang || 'en-US'
    u.rate = rate || 0.9
    u.pitch = 1
    utteranceRef.current = u
    return new Promise<string | null>((resolve) => {
      // Fallback: use TTS directly for playback (no blob capture in modern browsers)
      // We'll use a placeholder approach — record via MediaRecorder later
      resolve(null)
    })
  }, [text, rate, available])

  const speak = useCallback(() => {
    if (!available || !text) return
    const synth = window.speechSynthesis
    synth.cancel()
    const u = new SpeechSynthesisUtterance(text)
    const voices = synth.getVoices()
    const en = voices.filter(v => v.lang?.toLowerCase().startsWith('en'))
    const google = en.find(v => /google us english/i.test(v.name))
    const ms = en.find(v => /microsoft (aria|zira|jenny)/i.test(v.name))
    const us = en.find(v => /en-us/i.test(v.lang))
    u.voice = google || ms || us || en[0] || null
    u.lang = u.voice?.lang || 'en-US'
    u.rate = rate || 0.9
    u.pitch = 1
    u.onstart = () => setSpeaking(true)
    u.onend = () => setSpeaking(false)
    u.onerror = () => setSpeaking(false)
    synth.speak(u)
  }, [text, rate, available])

  const stop = useCallback(() => {
    window.speechSynthesis?.cancel()
    setSpeaking(false)
  }, [])

  return { speak, stop, speaking, available, audioUrl, generateAudio }
}

export function SpeakingReviewRenderer({ content, onComplete }: RendererProps) {
  const { t } = useI18n()
  const text = (content.text as string) ?? ''
  const instructions = (content.instructions as string) ?? ''
  const rate = (content.rate as number) ?? 0.9

  const [phase, setPhase] = useState<Phase>('prep')
  const [isRecording, setIsRecording] = useState(false)
  const [interimText, setInterimText] = useState('')
  const [transcript, setTranscript] = useState('')
  const [wordScores, setWordScores] = useState<{ word: string; accuracy: number }[] | null>(null)
  const [overall, setOverall] = useState<number | null>(null)
  const [grading, setGrading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [studentBlob, setStudentBlob] = useState<Blob | null>(null)
  const [studentAudioUrl, setStudentAudioUrl] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [reviewData, setReviewData] = useState<any>(null)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])

  const tts = useTtsAudio(text, rate)

  // Auto-play TTS when entering listen phase
  useEffect(() => {
    if (phase === 'listen') {
      setTimeout(() => tts.speak(), 400)
    }
    return () => tts.stop()
  }, [phase, tts])

  // Cleanup audio URL
  useEffect(() => {
    return () => {
      if (studentAudioUrl) URL.revokeObjectURL(studentAudioUrl)
    }
  }, [studentAudioUrl])

  async function handleRecord() {
    if (isRecording) return

    // Request mic
    let stream: MediaStream
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    } catch {
      setError('Izin mikrofon ditolak.')
      return
    }

    const SpeechRecognition = (window as any).webkitSpeechRecognition || (window as any).SpeechRecognition
    if (!SpeechRecognition) {
      setError('Browser tidak mendukung pengenalan suara. Gunakan Chrome.')
      stream.getTracks().forEach(t => t.stop())
      return
    }

    // Start MediaRecorder for audio blob
    chunksRef.current = []
    const recorder = new MediaRecorder(stream, { mimeType: MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : 'audio/mp4' })
    recorder.ondataavailable = (e: any) => { if (e.data.size > 0) chunksRef.current.push(e.data) }
    recorder.onstop = () => {
      const blob = new Blob(chunksRef.current, { type: recorder.mimeType })
      setStudentBlob(blob)
      const url = URL.createObjectURL(blob)
      setStudentAudioUrl(url)
      stream.getTracks().forEach(t => t.stop())
    }
    recorder.start()
    mediaRecorderRef.current = recorder

    // Start speech recognition
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

    recognition.onresult = (event: any) => {
      let interim = ''
      let final = ''
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const t = event.results[i][0].transcript
        if (event.results[i].isFinal) final += t
        else interim += t
      }
      if (interim) setInterimText(interim)
      if (final) {
        setInterimText('')
        setTranscript(final)
        setIsRecording(false)
        recorder.stop()
        // Score
        scoreTranscript(final)
      }
    }
    recognition.onerror = (e: any) => {
      setError(e?.error || 'Recognition failed')
      setIsRecording(false)
      recorder.stop()
      stream.getTracks().forEach(t => t.stop())
    }
    recognition.onend = () => {
      setIsRecording(false)
      if (recorder.state === 'recording') recorder.stop()
    }
    recognition.start()
  }

  async function scoreTranscript(spoken: string) {
    setGrading(true)
    try {
      // Convert blob to base64
      let audioBase64: string | null = null
      let mimeType: string | null = null
      if (studentBlob) {
        const arrayBuf = await studentBlob.arrayBuffer()
        audioBase64 = Buffer.from(arrayBuf).toString('base64')
        mimeType = studentBlob.type
      }

      const res = await fetch('/api/pronunciation/score', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ expectedText: text, transcript: spoken, prompt: text, audioBase64, mimeType }),
      })
      const data = await res.json()
      if (data.error) {
        setError(data.error)
      } else {
        setWordScores(data.word_scores ?? null)
        setOverall(data.overall ?? null)
        setPhase('compare')
      }
    } catch (e: any) {
      setError(e?.message || 'Failed to score')
    }
    setGrading(false)
  }

  async function handleSubmit() {
    setSubmitting(true)
    try {
      // Upload audio if not yet uploaded
      let audioDriveFileId: string | null = null
      let audioDriveLink: string | null = null

      const res = await fetch('/api/speaking-review/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          activityId: (content as any).activityId,
          taskId: (content as any).taskId,
          batchId: (content as any).batchId,
          activityProgressId: (content as any).activityProgressId,
          transcript,
          wordScores,
          autoScore: overall,
        }),
      })
      const data = await res.json()
      if (data.error) {
        setError(data.error)
      } else {
        setPhase('pending')
        onComplete({
          answers: { transcript, word_scores: wordScores, overall, submission_id: data.submission_id },
          result: { score: Math.round((overall ?? 0) * 100), correct: 1, total: 1, completed: true },
        })
      }
    } catch (e: any) {
      setError(e?.message || 'Failed to submit')
    }
    setSubmitting(false)
  }

  const canContinue = overall !== null && transcript

  // ── PREP PHASE ──
  if (phase === 'prep') {
    return (
      <div className="flex flex-col items-center gap-4 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-amber-400/20">
          <AlertTriangle className="h-7 w-7 text-amber-400" />
        </div>
        <h3 className="text-lg font-bold text-white">Siap untuk Berbicara?</h3>
        {instructions && <p className="text-sm text-white/60">{instructions}</p>}
        <div className="rounded-xl bg-white/5 p-4 text-left max-w-md w-full">
          <p className="whitespace-pre-wrap text-sm leading-relaxed text-white/80">{text}</p>
        </div>
        <div className="flex items-center gap-2 rounded-lg bg-amber-500/10 px-4 py-2 text-sm text-amber-300">
          <AlertTriangle className="h-4 w-4 flex-shrink-0" />
          <span>Kamu hanya bisa rekam <strong>1 kali</strong>. Pastikan sudah siap!</span>
        </div>
        <Button onClick={() => setPhase('listen')} className="bg-indigo-600 hover:bg-indigo-700 text-white">
          Saya Sudah Siap
        </Button>
      </div>
    )
  }

  // ── LISTEN PHASE (TTS Reference) ──
  if (phase === 'listen') {
    return (
      <div className="flex flex-col items-center gap-4">
        <p className="text-sm text-white/60">Dengarkan native speaker membaca teks ini:</p>
        <div className="rounded-xl bg-white/5 p-4 max-w-md w-full">
          <p className="whitespace-pre-wrap text-sm leading-relaxed text-white/80">{text}</p>
        </div>
        <button
          onClick={tts.speaking ? tts.stop : tts.speak}
          disabled={!tts.available}
          className="flex h-14 w-14 items-center justify-center rounded-full bg-indigo-500 hover:bg-indigo-400 transition-colors shadow-lg"
        >
          <Volume2 className="h-6 w-6 text-white" />
        </button>
        <p className="text-xs text-white/50">{tts.speaking ? 'Memutar...' : 'Klik untuk dengarkan'}</p>
        <Button onClick={() => { tts.stop(); setPhase('record') }} variant="outline" className="border-white/20 text-white hover:bg-white/10">
          Mulai Rekam <Mic className="ml-1 h-4 w-4" />
        </Button>
      </div>
    )
  }

  // ── RECORD PHASE ──
  if (phase === 'record') {
    return (
      <div className="flex flex-col items-center gap-4">
        <div className="rounded-xl bg-white/5 p-4 max-w-md w-full">
          <p className="whitespace-pre-wrap text-sm leading-relaxed text-white/80">{text}</p>
        </div>

        <button
          onClick={handleRecord}
          disabled={grading}
          className={`flex h-16 w-16 items-center justify-center rounded-full transition-all shadow-lg ${
            isRecording ? 'bg-red-500 animate-pulse scale-110' : 'bg-amber-400 hover:bg-amber-300 hover:scale-105'
          }`}
        >
          {grading ? <Loader2 className="h-7 w-7 animate-spin text-slate-800" /> : <Mic className="h-7 w-7 text-slate-800" />}
        </button>
        <p className="text-xs text-white/50">
          {isRecording ? 'Mendengarkan... ucapkan sekarang!' : grading ? 'Menilai...' : 'Tekan untuk mulai rekam'}
        </p>

        {(interimText || transcript) && (
          <div className="rounded-lg bg-white/5 px-4 py-2 max-w-md w-full">
            {isRecording && interimText ? (
              <p className="text-sm text-white/40 italic">{interimText}...</p>
            ) : transcript ? (
              <p className="text-sm text-white/70">&quot;{transcript}&quot;</p>
            ) : null}
          </div>
        )}

        {error && <p className="text-xs text-red-400">{error}</p>}
      </div>
    )
  }

  // ── COMPARE PHASE ──
  if (phase === 'compare') {
    return (
      <div className="flex flex-col items-center gap-4">
        <h3 className="text-sm font-semibold text-white">Hasil Rekaman</h3>

        {/* Word scores */}
        {wordScores && (
          <div className="flex flex-wrap gap-1 justify-center max-w-md">
            {wordScores.map((w, i) => (
              <span key={i} className={`rounded px-2 py-0.5 text-sm font-medium ${
                w.accuracy >= 0.9 ? 'bg-emerald-500/20 text-emerald-300' :
                w.accuracy >= 0.7 ? 'bg-amber-500/20 text-amber-300' :
                'bg-red-500/20 text-red-300'
              }`}>
                {w.word}
              </span>
            ))}
          </div>
        )}

        {overall !== null && (
          <div className="flex items-center gap-2">
            <div className="h-2 w-32 overflow-hidden rounded-full bg-white/10">
              <div className="h-full bg-gradient-to-r from-amber-400 to-emerald-400" style={{ width: `${Math.round(overall * 100)}%` }} />
            </div>
            <span className="text-xs font-bold text-white">{Math.round(overall * 100)}%</span>
          </div>
        )}

        {/* A/B Comparison */}
        <div className="w-full max-w-lg">
          <ComparisonView
            studentAudioBlob={studentBlob ?? undefined}
            ttsAudioUrl={undefined}
          />
        </div>

        <p className="text-xs text-white/40 flex items-center gap-1">
          <Clock className="h-3 w-3" />
          Setelah dikirim, guru akan memberikan review.
        </p>

        {error && <p className="text-xs text-red-400">{error}</p>}

        <div className="flex gap-2">
          <Button onClick={handleSubmit} disabled={submitting} className="bg-emerald-600 hover:bg-emerald-700 text-white">
            {submitting ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Send className="mr-1 h-4 w-4" />}
            Kirim untuk Review
          </Button>
        </div>
      </div>
    )
  }

  // ── PENDING PHASE ──
  if (phase === 'pending') {
    return (
      <div className="flex flex-col items-center gap-4 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-blue-500/20">
          <Clock className="h-7 w-7 text-blue-400" />
        </div>
        <h3 className="text-lg font-bold text-white">Menunggu Review Tutor</h3>
        <p className="text-sm text-white/60 max-w-sm">
          Rekamanmu sudah dikirim. Guru akan segera memberikan feedback dan penilaian.
        </p>
      </div>
    )
  }

  // ── REVIEWED PHASE ──
  if (phase === 'reviewed' && reviewData) {
    return (
      <div className="flex flex-col items-center gap-4">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-500/20">
          <CheckCircle2 className="h-7 w-7 text-emerald-400" />
        </div>
        <h3 className="text-lg font-bold text-white">Review Selesai!</h3>

        <div className="w-full max-w-md space-y-2">
          {[
            { label: 'Kelancaran', score: reviewData.score_fluency },
            { label: 'Intonasi', score: reviewData.score_intonation },
            { label: 'Pronunciation', score: reviewData.score_pronunciation },
            { label: 'Confidence', score: reviewData.score_confidence },
            { label: 'Comprehension', score: reviewData.score_comprehension },
          ].map(({ label, score }) => (
            <div key={label} className="flex items-center gap-2">
              <span className="w-28 text-xs text-white/60">{label}</span>
              <div className="h-2 flex-1 overflow-hidden rounded-full bg-white/10">
                <div className="h-full bg-gradient-to-r from-amber-400 to-emerald-400" style={{ width: `${score ?? 0}%` }} />
              </div>
              <span className="text-xs font-bold text-white w-8 text-right">{score ?? '-'}</span>
            </div>
          ))}
        </div>

        {reviewData.teacher_feedback && (
          <div className="rounded-xl bg-white/5 p-3 max-w-md w-full">
            <p className="text-xs text-white/40 mb-1">Feedback Guru:</p>
            <p className="text-sm text-white/80">{reviewData.teacher_feedback}</p>
          </div>
        )}
      </div>
    )
  }

  return null
}
