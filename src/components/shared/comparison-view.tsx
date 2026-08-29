'use client'

import { useState, useCallback, useRef, useEffect } from 'react'
import { Play, Pause } from 'lucide-react'
import { useI18n } from '@/lib/i18n/client'
import dynamic from 'next/dynamic'

const WaveformPlayer = dynamic(() => import('./waveform-player').then(m => ({ default: m.WaveformPlayer })), { ssr: false })

interface WordTiming {
  word: string
  start: number
  end: number
}

interface WordScore {
  word: string
  accuracy: number
}

interface ComparisonViewProps {
  studentAudioUrl?: string
  studentAudioBlob?: Blob
  ttsAudioUrl?: string
  passageText?: string
  wordTimings?: WordTiming[]
  wordScores?: WordScore[]
}

export function ComparisonView({
  studentAudioUrl,
  studentAudioBlob,
  ttsAudioUrl,
  passageText,
  wordTimings,
  wordScores,
}: ComparisonViewProps) {
  const { t } = useI18n()
  const [activeAudio, setActiveAudio] = useState<'native' | 'student' | null>(null)
  const [currentTime, setCurrentTime] = useState(0)
  const [syncPlay, setSyncPlay] = useState(false)
  const [syncPause, setSyncPause] = useState(false)

  const words = passageText?.split(/\s+/).filter(Boolean) ?? []

  // Map word scores for quick lookup
  const scoreMap = useRef<Map<string, number>>(new Map())
  useEffect(() => {
    scoreMap.current.clear()
    wordScores?.forEach(ws => scoreMap.current.set(ws.word.toLowerCase(), ws.accuracy))
  }, [wordScores])

  // Estimate word timings from the full text if not provided
  const timings = wordTimings ?? (() => {
    if (!passageText) return []
    const totalChars = words.reduce((s, w) => s + w.length, 0)
    let acc = 0
    return words.map(word => {
      const start = (acc / totalChars) * 10
      acc += word.length
      const end = (acc / totalChars) * 10
      return { word, start, end }
    })
  })()

  // Find current word index based on time
  function getCurrentWordIndex(time: number): number {
    for (let i = 0; i < timings.length; i++) {
      if (time >= timings[i].start && time < timings[i].end) return i
      if (time < timings[i].start) return i - 1
    }
    return timings.length - 1
  }

  const currentWordIndex = getCurrentWordIndex(currentTime)

  // Handle native audio time updates
  const handleNativeTimeUpdate = useCallback((time: number) => {
    if (activeAudio === 'native' || activeAudio === null) {
      setCurrentTime(time)
      if (activeAudio === null) setActiveAudio('native')
    }
  }, [activeAudio])

  // Handle student audio time updates
  const handleStudentTimeUpdate = useCallback((time: number) => {
    if (activeAudio === 'student' || activeAudio === null) {
      setCurrentTime(time)
      if (activeAudio === null) setActiveAudio('student')
    }
  }, [activeAudio])

  // Sync play/pause
  function handleSyncToggle() {
    if (syncPlay) {
      setSyncPause(true)
      setSyncPlay(false)
      setTimeout(() => setSyncPause(false), 100)
    } else {
      setSyncPause(false)
      setSyncPlay(true)
      setActiveAudio('native')
      setTimeout(() => setSyncPlay(false), 100)
    }
  }

  function getWordHighlight(index: number) {
    if (index === currentWordIndex && (activeAudio === 'native' || activeAudio === 'student')) {
      return 'text-white bg-indigo-500/40 scale-105 font-bold'
    }
    if (index < currentWordIndex) {
      const word = words[index]
      const accuracy = scoreMap.current.get(word?.toLowerCase() ?? '')
      if (accuracy !== undefined) {
        if (accuracy >= 0.9) return 'text-success bg-success/10'
        if (accuracy >= 0.7) return 'text-warning bg-warning/10'
        return 'text-destructive bg-destructive/10 line-through'
      }
      return 'text-on-surface-variant/60'
    }
    return 'text-on-surface-variant/30'
  }

  const hasStudent = !!(studentAudioUrl || studentAudioBlob)

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-semibold text-on-surface">{t('speakingReview.comparison')}</h4>
        {hasStudent && (ttsAudioUrl || passageText) && (
          <button
            onClick={handleSyncToggle}
            className="flex items-center gap-1.5 rounded-lg bg-surface-container-low px-3 py-1.5 text-xs font-medium text-on-surface hover:bg-surface-container-high transition-colors border border-border"
          >
            {syncPlay ? <Pause className="h-3 w-3" /> : <Play className="h-3 w-3" />}
            {syncPlay ? t('speakingReview.pauseAll') : t('speakingReview.playTogether')}
          </button>
        )}
      </div>

      {/* Synced text display */}
      {passageText && words.length > 0 && (
        <div className="rounded-2xl bg-surface-container-low p-4 border border-border">
          <p className="text-sm leading-loose tracking-wide">
            {words.map((word, i) => (
              <span
                key={i}
                className={`inline-block rounded px-1 py-0.5 mx-0.5 transition-all duration-150 ${getWordHighlight(i)}`}
              >
                {word}
              </span>
            ))}
          </p>
        </div>
      )}

      {/* Waveforms */}
      <div className="grid gap-3 sm:grid-cols-2">
        {hasStudent && (
          <WaveformPlayer
            audioUrl={studentAudioUrl}
            audioBlob={studentAudioBlob}
            label={t('speakingReview.yourVoice')}
            color="#10b981"
            onTimeUpdate={handleStudentTimeUpdate}
            externalPlay={syncPlay}
            externalPause={syncPause}
          />
        )}
        {(ttsAudioUrl || passageText) && (
          <WaveformPlayer
            audioUrl={ttsAudioUrl}
            label={t('speakingReview.nativeSpeaker')}
            color="#6366f1"
            onTimeUpdate={handleNativeTimeUpdate}
            externalPlay={syncPlay}
            externalPause={syncPause}
          />
        )}
      </div>
    </div>
  )
}
