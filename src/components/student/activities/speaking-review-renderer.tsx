'use client'

import { useEffect, useState, useRef, useCallback, useMemo } from 'react'
import { Button } from '@/components/ui/button'
import { CheckCircle2, Loader2, Mic, AlertTriangle, Clock, Send } from 'lucide-react'
import { useI18n } from '@/lib/i18n/client'
import type { RendererProps } from './activity-renderer'
import type { ActivityResult } from '@/lib/learning'
import dynamic from 'next/dynamic'

const ComparisonView = dynamic(() => import('@/components/shared/comparison-view').then(m => ({ default: m.ComparisonView })), { ssr: false })
const KaraokeText = dynamic(() => import('@/components/shared/karaoke-text').then(m => ({ default: m.KaraokeText })), { ssr: false })

type Phase = 'karaoke' | 'record' | 'compare' | 'pending' | 'reviewed' | 'comparison'

/**
 * Greedy sequential matching: walk expected words and transcript words.
 * If they match (case-insensitive), mark as spoken.
 * If not, advance expected pointer (word was skipped).
 * Returns Set of spoken word indices.
 */
function matchSpokenWords(expected: string[], transcript: string): Set<number> {
  const spoken = new Set<number>()
  const transcriptWords = transcript.toLowerCase().split(/\s+/).filter(Boolean)
  let ei = 0
  let ti = 0

  while (ei < expected.length && ti < transcriptWords.length) {
    const expNorm = expected[ei].toLowerCase().replace(/[^a-z0-9]/g, '')
    const trNorm = transcriptWords[ti].replace(/[^a-z0-9]/g, '')
    if (expNorm && expNorm === trNorm) {
      spoken.add(ei)
      ei++
      ti++
    } else {
      ei++
    }
  }

  return spoken
}

/**
 * Find the last matched index from interim text (partial recognition).
 * Uses the same greedy approach but stops at the last match.
 */
function findCurrentWordIndex(expected: string[], finalTranscript: string, interim: string): number {
  const combined = (finalTranscript + ' ' + interim).trim()
  if (!combined) return -1
  const transcriptWords = combined.toLowerCase().split(/\s+/).filter(Boolean)
  let lastMatched = -1
  let ei = 0
  let ti = 0

  while (ei < expected.length && ti < transcriptWords.length) {
    const expNorm = expected[ei].toLowerCase().replace(/[^a-z0-9]/g, '')
    const trNorm = transcriptWords[ti].replace(/[^a-z0-9]/g, '')
    if (expNorm && expNorm === trNorm) {
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

  // Cleanup audio URLs
  useEffect(() => {
    return () => {
      if (studentAudioUrl) URL.revokeObjectURL(studentAudioUrl)
    }
  }, [studentAudioUrl])

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
    if (isRecording) return

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

    // Start MediaRecorder
    chunksRef.current = []
    const mimeType = MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : 'audio/mp4'
    const recorder = new MediaRecorder(stream, { mimeType })
    recorder.ondataavailable = (e: any) => { if (e.data.size > 0) chunksRef.current.push(e.data) }
    recorder.onstop = () => {
      const blob = new Blob(chunksRef.current, { type: mimeType })
      setStudentBlob(blob)
      setStudentAudioUrl(URL.createObjectURL(blob))
      stream.getTracks().forEach(t => t.stop())
    }
    recorder.start()
    mediaRecorderRef.current = recorder

    // Start speech recognition
    setIsRecording(true)
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

    const finalChunks: string[] = []

    recognition.onresult = (event: any) => {
      let interim = ''
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const t = event.results[i][0].transcript
        if (event.results[i].isFinal) {
          finalChunks.push(t)
        } else {
          interim += t
        }
      }

      const fullFinal = finalChunks.join(' ')
      if (fullFinal) setTranscript(fullFinal)

      // Recompute spoken words from final transcript
      const newSpoken = matchSpokenWords(expectedWords, fullFinal)
      setSpokenWords(newSpoken)

      // Find current word from interim (partial) text
      const curIdx = findCurrentWordIndex(expectedWords, fullFinal, interim)
      setCurrentRecordWord(curIdx)
    }

    recognition.onerror = (e: any) => {
      setError(e?.error || 'Recognition failed')
      setIsRecording(false)
      recorder.stop()
      stream.getTracks().forEach(t => t.stop())
    }

    recognition.onend = () => {
      const fullTranscript = finalChunks.join(' ')
      if (fullTranscript.trim().length > 0) {
        setTranscript(fullTranscript)
        setSpokenWords(matchSpokenWords(expectedWords, fullTranscript))
        setCurrentRecordWord(-1)
        setIsRecording(false)
        recorder.stop()
        scoreTranscript(fullTranscript)
      } else {
        setIsRecording(false)
        setSpokenWords(new Set())
        setCurrentRecordWord(-1)
        recorder.stop()
        stream.getTracks().forEach(t => t.stop())
        setError('Tidak ada suara terdeteksi. Coba lagi.')
      }
    }

    recognition.start()
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

        {/* Mic button */}
        <button
          onClick={handleRecord}
          disabled={grading}
          className={`flex h-16 w-16 items-center justify-center rounded-full transition-all shadow-lg ${
            isRecording ? 'bg-destructive animate-pulse scale-110' : 'bg-primary hover:bg-primary/90 hover:scale-105'
          }`}
        >
          {grading ? <Loader2 className="h-7 w-7 animate-spin text-on-primary" /> : <Mic className="h-7 w-7 text-on-primary" />}
        </button>
        <p className="text-xs text-on-surface-variant">
          {isRecording ? t('speakingReview.listening') : grading ? t('speakingReview.grading') : t('speakingReview.pressToRecord')}
        </p>

        {error && <p className="text-xs text-destructive">{error}</p>}
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
