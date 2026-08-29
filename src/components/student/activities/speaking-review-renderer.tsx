'use client'

import { useEffect, useState, useRef, useCallback, useMemo } from 'react'
import { Button } from '@/components/ui/button'
import { CheckCircle2, Loader2, Mic, MicOff, AlertTriangle, Clock, Send } from 'lucide-react'
import { useI18n } from '@/lib/i18n/client'
import type { RendererProps } from './activity-renderer'
import type { ActivityResult } from '@/lib/learning'
import dynamic from 'next/dynamic'

const ComparisonView = dynamic(() => import('@/components/shared/comparison-view').then(m => ({ default: m.ComparisonView })), { ssr: false })
const KaraokeText = dynamic(() => import('@/components/shared/karaoke-text').then(m => ({ default: m.KaraokeText })), { ssr: false })

type Phase = 'karaoke' | 'record' | 'compare' | 'pending' | 'reviewed' | 'comparison'

function similarity(a: string, b: string): number {
  if (!a || !b) return 0
  const m = a.length, n = b.length
  if (m === 0 || n === 0) return 0
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0))
  for (let i = 0; i <= m; i++) dp[i][0] = i
  for (let j = 0; j <= n; j++) dp[0][j] = j
  for (let i = 1; i <= m; i++) for (let j = 1; j <= n; j++) dp[i][j] = a[i-1]===b[j-1] ? dp[i-1][j-1] : 1 + Math.min(dp[i-1][j], dp[i][j-1], dp[i-1][j-1])
  const maxLen = Math.max(m, n)
  return maxLen === 0 ? 1 : 1 - dp[m][n] / maxLen
}

function norm(s: string): string { return s.toLowerCase().replace(/[^a-z0-9]/g, '').trim() }

/**
 * Greedy sequential matching with fuzzy fallback (>0.7) so "helo" matches "hello"
 */
function matchSpokenWords(expected: string[], transcript: string): Set<number> {
  const spoken = new Set<number>()
  const transcriptWords = transcript.toLowerCase().split(/\s+/).filter(Boolean).map(w => w.replace(/[^a-z0-9]/g,'')).filter(Boolean)
  let ei = 0
  let ti = 0
  while (ei < expected.length && ti < transcriptWords.length) {
    const expNorm = norm(expected[ei])
    const trNorm = transcriptWords[ti]
    const exact = expNorm && expNorm === trNorm
    const fuzzy = expNorm && trNorm && similarity(expNorm, trNorm) > 0.7
    if (exact || fuzzy) {
      spoken.add(ei)
      ei++
      ti++
    } else {
      // try to find next transcript word that matches this expected word
      let found = -1
      for (let k = ti+1; k < Math.min(ti+4, transcriptWords.length); k++) {
        if (expNorm === transcriptWords[k] || similarity(expNorm, transcriptWords[k]) > 0.7) { found = k; break }
      }
      if (found !== -1) {
        ti = found + 1
        spoken.add(ei)
        ei++
      } else {
        ei++
      }
    }
  }
  return spoken
}

function findCurrentWordIndex(expected: string[], finalTranscript: string, interim: string): number {
  const combined = (finalTranscript + ' ' + interim).trim()
  if (!combined) return -1
  const transcriptWords = combined.toLowerCase().split(/\s+/).filter(Boolean).map(w => w.replace(/[^a-z0-9]/g,'')).filter(Boolean)
  let lastMatched = -1
  let ei = 0
  let ti = 0
  while (ei < expected.length && ti < transcriptWords.length) {
    const expNorm = norm(expected[ei])
    const trNorm = transcriptWords[ti]
    if (expNorm && (expNorm === trNorm || similarity(expNorm, trNorm) > 0.7)) {
      lastMatched = ei
      ei++
      ti++
    } else {
      ei++
    }
  }
  return lastMatched
}

export function SpeakingReviewRenderer({ activity, content, taskId, batchId, onComplete }: RendererProps) {
  const { t } = useI18n()
  const text = (content.text as string) ?? ''
  const instructions = (content.instructions as string) ?? ''
  const rate = (content.rate as number) ?? 0.9
  const expectedWords = useMemo(() => text.split(/\s+/).filter(Boolean), [text])

  const [phase, setPhase] = useState<Phase>('karaoke')
  const [isRecording, setIsRecording] = useState(false)
  const [transcript, setTranscript] = useState('')
  const [spokenWords, setSpokenWords] = useState<Set<number>>(new Set())
  const [currentRecordWord, setCurrentRecordWord] = useState(-1)
  const [wordScores, setWordScores] = useState<{ word: string; accuracy: number }[] | null>(null)
  const [overall, setOverall] = useState<number | null>(null)
  const [grading, setGrading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [studentBlob, setStudentBlob] = useState<Blob | null>(null)
  const [studentAudioUrl, setStudentAudioUrl] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [submissionId, setSubmissionId] = useState<string | null>(null)
  const [reviewData, setReviewData] = useState<any>(null)
  const [ttsTimings, setTtsTimings] = useState<{ word: string; start: number; end: number }[] | null>(null)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const recognitionRef = useRef<any>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const isRecordingRef = useRef(false)
  const transcriptRef = useRef('')
  const silenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const chunksRef = useRef<Blob[]>([])

  // Sentence mapping (same as KaraokeText)
  const { sentences, sentenceWordMap } = useMemo(() => {
    const raw = text.split(/(?<=[.!?])\s+/).filter(Boolean)
    let wordIdx = 0
    const map = raw.map(sent => {
      const sentWords = sent.split(/\s+/).filter(Boolean)
      const start = wordIdx
      wordIdx += sentWords.length
      return { start, end: wordIdx - 1 }
    })
    return { sentences: raw, sentenceWordMap: map }
  }, [text])

  // Cleanup audio URLs + mic + recognition
  useEffect(() => {
    return () => {
      if (studentAudioUrl) URL.revokeObjectURL(studentAudioUrl)
      window.speechSynthesis?.cancel()
      if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current)
      if (recognitionRef.current) try { recognitionRef.current.stop() } catch {}
      if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop())
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') try { mediaRecorderRef.current.stop() } catch {}
    }
  }, [studentAudioUrl])

  function stopRecordingManual() {
    isRecordingRef.current = false
    setIsRecording(false)
    if (silenceTimerRef.current) { clearTimeout(silenceTimerRef.current); silenceTimerRef.current = null }
    if (recognitionRef.current) { try { recognitionRef.current.stop() } catch {} ; recognitionRef.current = null }
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      try { mediaRecorderRef.current.stop() } catch {}
    }
    if (streamRef.current) { streamRef.current.getTracks().forEach(t => t.stop()); streamRef.current = null }
  }

  // Poll for review status when pending
  useEffect(() => {
    if (phase !== 'pending' || !submissionId) return
    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/speaking-review/${submissionId}`)
        if (res.ok) {
          const data = await res.json()
          if (data.review_status === 'reviewed') {
            setReviewData(data)
            setPhase('reviewed')
            // Use teacher's overall_score if available, fallback to auto-score
            const teacherScore = data.overall_score != null ? Math.round(data.overall_score) : Math.round((overall ?? 0) * 100)
            onComplete({
              answers: { transcript, word_scores: wordScores, overall: teacherScore, submission_id: submissionId },
              result: { score: teacherScore, correct: 1, total: 1, completed: true },
            })
          }
        }
      } catch {}
    }, 10000)
    return () => clearInterval(interval)
  }, [phase, submissionId, onComplete, transcript, wordScores, overall])

  async function handleRecord() {
    // toggle: if already recording -> manual stop
    if (isRecordingRef.current || isRecording) {
      stopRecordingManual()
      // after manual stop, score what we have
      const t = transcriptRef.current.trim()
      if (t) {
        scoreTranscript(t)
      } else if (transcript.trim()) {
        scoreTranscript(transcript.trim())
      }
      return
    }

    if (typeof window !== 'undefined' && !window.isSecureContext && window.location.hostname !== 'localhost') {
      setError('Mikrofon butuh HTTPS. Buka via https:// atau localhost.')
      return
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      setError('Browser tidak mendukung mikrofon. Gunakan Chrome terbaru.')
      return
    }

    // cancel TTS if still speaking (avoid echo)
    window.speechSynthesis?.cancel()

    let stream: MediaStream
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } })
    } catch {
      setError('Izin mikrofon ditolak. Aktifkan di chrome://settings/content/microphone')
      return
    }
    streamRef.current = stream

    const SpeechRecognition = (window as any).webkitSpeechRecognition || (window as any).SpeechRecognition
    if (!SpeechRecognition) {
      setError('Browser tidak mendukung pengenalan suara. Gunakan Chrome di desktop/Android.')
      stream.getTracks().forEach(t => t.stop())
      streamRef.current = null
      return
    }

    // Start MediaRecorder
    chunksRef.current = []
    const mimeType = MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : 'audio/mp4'
    const recorder = new MediaRecorder(stream, { mimeType })
    recorder.ondataavailable = (e: any) => { if (e.data.size > 0) chunksRef.current.push(e.data) }
    recorder.onstop = () => {
      const blob = new Blob(chunksRef.current, { type: mimeType })
      if (blob.size > 0) {
        setStudentBlob(blob)
        setStudentAudioUrl(prev => { if (prev) URL.revokeObjectURL(prev); return URL.createObjectURL(blob) })
      }
      // stream tracks stopped in stopRecordingManual / onend
    }
    recorder.start()
    mediaRecorderRef.current = recorder

    // Start speech recognition — immediate feedback, interim updates live
    setIsRecording(true); isRecordingRef.current = true
    transcriptRef.current = ''
    setError(null)
    setTranscript('')
    setSpokenWords(new Set())
    setCurrentRecordWord(-1)
    setWordScores(null)
    setOverall(null)

    const recognition = new SpeechRecognition()
    recognition.lang = 'en-US'
    recognition.interimResults = true
    recognition.maxAlternatives = 1
    recognition.continuous = true
    recognitionRef.current = recognition

    const finalChunks: string[] = []
    let interim = ''

    // silence cue: if no speech after 4s, show hint
    if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current)
    silenceTimerRef.current = setTimeout(() => {
      if (!transcriptRef.current) setError('Coba bicara lebih keras & dekat ke mic, atau ketik manual di bawah.')
    }, 4000)

    recognition.onresult = (event: any) => {
      interim = ''
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const t = event.results[i][0].transcript
        if (event.results[i].isFinal) {
          finalChunks.push(t)
        } else {
          interim += t
        }
      }
      const fullFinal = finalChunks.join(' ').trim()
      const combinedForDisplay = (fullFinal + ' ' + interim).trim()
      if (combinedForDisplay) {
        transcriptRef.current = combinedForDisplay
        setTranscript(combinedForDisplay)
      } else if (fullFinal) {
        transcriptRef.current = fullFinal
        setTranscript(fullFinal)
      }
      if (silenceTimerRef.current) { clearTimeout(silenceTimerRef.current); silenceTimerRef.current = null }

      // live green highlight from final+interim so user sees kedetect langsung
      const liveText = (fullFinal + ' ' + interim).trim()
      const newSpoken = matchSpokenWords(expectedWords, liveText)
      setSpokenWords(newSpoken)
      const curIdx = findCurrentWordIndex(expectedWords, fullFinal, interim)
      setCurrentRecordWord(curIdx)
    }

    recognition.onerror = (e: any) => {
      const code = e?.error
      if (code === 'no-speech') {
        setError('Tidak ada suara terdeteksi. Coba lagi lebih keras.')
      } else if (code === 'audio-capture') {
        setError('Mic tidak terdeteksi. Cek perangkat.')
      } else if (code === 'not-allowed') {
        setError('Izin mic diblokir. Aktifkan di pengaturan browser.')
      } else {
        setError(code || 'Recognition failed')
      }
      // don't auto-stop recorder here, let user press stop manual
    }

    recognition.onend = () => {
      // auto-restart if still supposed to be recording (Chrome silence timeout)
      if (isRecordingRef.current) {
        try { recognition.start() } catch {}
        return
      }
      // otherwise final scoring handled by manual stop; if transcript empty after auto end, show error
      const fullTranscript = (finalChunks.join(' ') + ' ' + interim).trim() || transcriptRef.current.trim()
      if (fullTranscript) {
        transcriptRef.current = fullTranscript
        setTranscript(fullTranscript)
        setSpokenWords(matchSpokenWords(expectedWords, fullTranscript))
        setCurrentRecordWord(-1)
        // if user didn't manually stop but recognition ended naturally, score
        if (!grading && !studentBlob) {
          // wait for recorder stop
        }
      }
    }

    try { recognition.start() } catch (err: any) { setError(err?.message || 'Gagal memulai pengenalan suara'); stopRecordingManual() }
  }

  async function scoreTranscript(spoken: string) {
    setGrading(true)
    try {
      const blob = new Blob(chunksRef.current, { type: 'audio/webm' })
      let audioBase64: string | null = null
      if (blob.size > 0) {
        const arrayBuf = await blob.arrayBuffer()
        const bytes = new Uint8Array(arrayBuf)
        let binary = ''
        for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i])
        audioBase64 = btoa(binary)
      }

      const res = await fetch('/api/pronunciation/score', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ expectedText: text, transcript: spoken, prompt: text, audioBase64, mimeType: 'audio/webm' }),
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
      let audioBase64: string | null = null
      if (studentBlob && studentBlob.size > 0) {
        const arrayBuf = await studentBlob.arrayBuffer()
        const bytes = new Uint8Array(arrayBuf)
        let binary = ''
        for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i])
        audioBase64 = btoa(binary)
      }

      const res = await fetch('/api/speaking-review/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          activityId: activity.id,
          taskId,
          batchId,
          transcript,
          wordScores,
          autoScore: overall,
          audioBase64,
          mimeType: 'audio/webm',
        }),
      })
      const data = await res.json()
      if (data.error) {
        setError(data.error)
      } else {
        setSubmissionId(data.submission_id)
        setPhase('pending')
      }
    } catch (e: any) {
      setError(e?.message || 'Failed to submit')
    }
    setSubmitting(false)
  }

  // ── KARAOKE PHASE ──
  if (phase === 'karaoke') {
    return (
      <div className="flex flex-col items-center gap-4">
        {instructions && (
          <p className="text-sm text-on-surface-variant max-w-md text-center">{instructions}</p>
        )}

        <KaraokeText
          text={text}
          rate={rate}
          onWordTimings={setTtsTimings}
          onComplete={() => {}}
        />

        <div className="flex items-center gap-2 rounded-lg bg-primary/10 px-4 py-2 text-sm text-primary">
          <AlertTriangle className="h-4 w-4 flex-shrink-0" />
          <span>{t('speakingReview.oneTimeOnly')}</span>
        </div>

        <Button
          onClick={() => setPhase('record')}
          className="bg-primary hover:bg-primary/90 text-on-primary"
        >
          {t('speakingReview.readyRecord')} <Mic className="ml-1 h-4 w-4" />
        </Button>
      </div>
    )
  }

  // ── RECORD PHASE ──
  if (phase === 'record') {
    return (
      <div className="flex flex-col items-center gap-4">
        {/* Karaoke text with proper matching */}
        <div className="rounded-2xl bg-white/5 p-6 backdrop-blur-sm border border-white/10 max-w-2xl w-full">
          <div className="text-base leading-loose tracking-wide">
            {sentences.map((sentence, si) => {
              const wordStart = sentenceWordMap[si].start
              const wordEnd = sentenceWordMap[si].end

              // Check if any word in this sentence is the current recording word
              const hasCurrentWord = currentRecordWord >= wordStart && currentRecordWord <= wordEnd

              return (
                <span
                  key={si}
                  className={`inline transition-all duration-300 rounded-lg px-1 py-0.5 ${
                    hasCurrentWord && isRecording ? 'bg-indigo-500/10 border border-indigo-500/20' : ''
                  }`}
                >
                  {expectedWords.slice(wordStart, wordEnd + 1).map((word, wi) => {
                    const globalIdx = wordStart + wi
                    let style = 'text-white/30' // future / not spoken

                    if (spokenWords.has(globalIdx)) {
                      style = 'text-emerald-300 bg-emerald-500/10' // spoken (green)
                    } else if (globalIdx === currentRecordWord && isRecording) {
                      style = 'text-white bg-indigo-500/40 scale-105 font-bold shadow-sm shadow-indigo-500/20' // current (indigo)
                    }

                    return (
                      <span
                        key={globalIdx}
                        className={`inline-block rounded px-1 py-0.5 mx-0.5 transition-all duration-150 ${style}`}
                      >
                        {word}
                      </span>
                    )
                  })}
                  {' '}
                </span>
              )
            })}
          </div>
        </div>

        {/* Mic button — toggle */}
        <button
          onClick={handleRecord}
          disabled={grading}
          className={`flex h-16 w-16 items-center justify-center rounded-full transition-all shadow-lg ${
            isRecording ? 'bg-destructive animate-pulse scale-110' : 'bg-primary hover:bg-primary/90 hover:scale-105'
          }`}
        >
          {grading ? <Loader2 className="h-7 w-7 animate-spin text-on-primary" /> : isRecording ? <MicOff className="h-7 w-7 text-on-primary" /> : <Mic className="h-7 w-7 text-on-primary" />}
        </button>
        <p className="text-xs text-on-surface-variant text-center">
          {isRecording ? 'Mendengarkan... tekan lagi untuk berhenti' : grading ? t('speakingReview.grading') : t('speakingReview.pressToRecord')}
        </p>
        <p className="text-[11px] text-on-surface-variant/60">{isRecording ? 'Atau diam 1 detik lalu tekan stop' : 'Pastikan HTTPS & izin mikrofon Chrome'}</p>

        {transcript && (
          <div className="w-full max-w-xl rounded-xl border border-border bg-surface-container-low p-3">
            <p className="text-xs text-on-surface-variant mb-1">Terdeteksi:</p>
            <p className="text-sm text-on-surface">{transcript}</p>
          </div>
        )}

        {/* Fallback ketik manual jika STT nggak ke-detect */}
        <div className="w-full max-w-xl">
          <p className="text-xs text-on-surface-variant mb-1">Jika tidak terdeteksi, ketik manual:</p>
          <textarea
            value={transcript}
            onChange={e => { setTranscript(e.target.value); transcriptRef.current = e.target.value; setSpokenWords(matchSpokenWords(expectedWords, e.target.value)) }}
            placeholder="Ketik apa yang kamu ucapkan..."
            rows={2}
            className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm text-on-surface placeholder:text-muted focus:outline-none focus:ring-1 focus:ring-primary/30"
          />
          {transcript.trim() && !isRecording && (
            <Button size="sm" className="mt-2 w-full" onClick={() => scoreTranscript(transcript.trim())} disabled={grading}>
              {grading ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : null} Nilai dari teks
            </Button>
          )}
        </div>

        {error && <p className="text-xs text-destructive max-w-md text-center">{error}</p>}
      </div>
    )
  }

  // ── COMPARE PHASE ──
  if (phase === 'compare') {
    return (
      <div className="flex flex-col items-center gap-4">
        <h3 className="text-sm font-semibold text-on-surface">{t('speakingReview.result')}</h3>

        {wordScores && (
          <div className="flex flex-wrap gap-1 justify-center max-w-md">
            {wordScores.map((w, i) => (
              <span key={i} className={`rounded px-2 py-0.5 text-sm font-medium ${
                w.accuracy >= 0.9 ? 'bg-success/20 text-success' :
                w.accuracy >= 0.7 ? 'bg-warning/20 text-warning' :
                'bg-destructive/20 text-destructive'
              }`}>
                {w.word}
              </span>
            ))}
          </div>
        )}

        {overall !== null && (
          <div className="flex items-center gap-2">
            <div className="h-2 w-32 overflow-hidden rounded-full bg-border">
              <div className="h-full bg-gradient-to-r from-primary to-success" style={{ width: `${Math.round(overall * 100)}%` }} />
            </div>
            <span className="text-xs font-bold text-on-surface">{Math.round(overall * 100)}%</span>
          </div>
        )}

        <p className="text-xs text-on-surface-variant flex items-center gap-1">
          <Clock className="h-3 w-3" />
          {t('speakingReview.waitingReview')}
        </p>

        {error && <p className="text-xs text-destructive">{error}</p>}

        <div className="flex gap-2">
          <Button onClick={handleSubmit} disabled={submitting} className="bg-success hover:bg-success/90 text-on-primary">
            {submitting ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Send className="mr-1 h-4 w-4" />}
            {t('speakingReview.submitReview')}
          </Button>
        </div>
      </div>
    )
  }

  // ── PENDING PHASE ──
  if (phase === 'pending') {
    return (
      <div className="flex flex-col items-center gap-4 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-info/20">
          <Clock className="h-7 w-7 text-info" />
        </div>
        <h3 className="text-lg font-bold text-on-surface">{t('speakingReview.waitingReview')}</h3>
        <p className="text-sm text-on-surface-variant max-w-sm">
          {t('speakingReview.submittedMsg')}
        </p>
        <div className="flex items-center gap-2 text-xs text-on-surface-variant/60">
          <Loader2 className="h-3 w-3 animate-spin" /> {t('speakingReview.checkingStatus')}
        </div>
      </div>
    )
  }

  // ── REVIEWED PHASE ──
  if (phase === 'reviewed' && reviewData) {
    return (
      <div className="flex flex-col items-center gap-4">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-success/20">
          <CheckCircle2 className="h-7 w-7 text-success" />
        </div>
        <h3 className="text-lg font-bold text-on-surface">{t('speakingReview.reviewDone')}</h3>

        <div className="w-full max-w-md space-y-2">
          {[
            { label: t('speakingReview.fluency'), score: reviewData.score_fluency },
            { label: t('speakingReview.intonation'), score: reviewData.score_intonation },
            { label: t('speakingReview.pronunciation'), score: reviewData.score_pronunciation },
            { label: t('speakingReview.confidence'), score: reviewData.score_confidence },
            { label: t('speakingReview.comprehension'), score: reviewData.score_comprehension },
          ].map(({ label, score }) => (
            <div key={label} className="flex items-center gap-2">
              <span className="w-28 text-xs text-on-surface-variant">{label}</span>
              <div className="h-2 flex-1 overflow-hidden rounded-full bg-border">
                <div className="h-full bg-gradient-to-r from-primary to-success" style={{ width: `${score ?? 0}%` }} />
              </div>
              <span className="text-xs font-bold text-on-surface w-8 text-right">{score ?? '-'}</span>
            </div>
          ))}
        </div>

        {reviewData.overall_score != null && (
          <p className="text-lg font-bold text-success">Overall: {Math.round(reviewData.overall_score)}%</p>
        )}

        {reviewData.teacher_feedback && (
          <div className="rounded-xl bg-surface-container-low p-3 max-w-md w-full border border-border">
            <p className="text-xs text-on-surface-variant mb-1">{t('speakingReview.teacherFeedback')}</p>
            <p className="text-sm text-on-surface">{reviewData.teacher_feedback}</p>
          </div>
        )}

        <div className="w-full max-w-2xl">
          <ComparisonView
            studentAudioBlob={studentBlob ?? undefined}
            studentAudioUrl={studentAudioUrl ?? undefined}
            passageText={text}
            wordTimings={ttsTimings ?? undefined}
            wordScores={wordScores ?? undefined}
          />
        </div>
      </div>
    )
  }

  return null
}
