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
  // Solo (A/B) pulses: play one track, pause the other
  const [soloNative, setSoloNative] = useState(false)
  const [soloStudent, setSoloStudent] = useState(false)
  const [stopNative, setStopNative] = useState(false)
  const [stopStudent, setStopStudent] = useState(false)
  // Stable ref so time-update callbacks keep identity (prevents wavesurfer destroy loop)
  const activeAudioRef = useRef<'native' | 'student' | null>(null)
  useEffect(() => {
    activeAudioRef.current = activeAudio
  }, [activeAudio])

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

  // Handle native audio time updates (stable identity via ref — no wavesurfer recreate)
  const handleNativeTimeUpdate = useCallback((time: number) => {
    if (activeAudioRef.current === 'native' || activeAudioRef.current === null) {
      setCurrentTime(time)
      if (activeAudioRef.current === null) {
        activeAudioRef.current = 'native'
        setActiveAudio('native')
      }
    }
  }, [])

  // Handle student audio time updates (stable identity via ref)
  const handleStudentTimeUpdate = useCallback((time: number) => {
    if (activeAudioRef.current === 'student' || activeAudioRef.current === null) {
      setCurrentTime(time)
      if (activeAudioRef.current === null) {
        activeAudioRef.current = 'student'
        setActiveAudio('student')
      }
    }
  }, [])

  // Sync play/pause (both together)
  function handleSyncToggle() {
    if (syncPlay) {
      setSyncPause(true)
      setSyncPlay(false)
      setTimeout(() => setSyncPause(false), 100)
    } else {
      setSyncPause(false)
      setSyncPlay(true)
      activeAudioRef.current = 'native'
      setActiveAudio('native')
      setTimeout(() => setSyncPlay(false), 100)
    }
  }

  // Solo play: play one track, pause the other (true A/B)
  function pulse(setter: (v: boolean) => void) {
    setter(true)
    setTimeout(() => setter(false), 100)
  }
  function handleSoloPlay(track: 'native' | 'student') {
    setSyncPlay(false)
    setSyncPause(false)
    activeAudioRef.current = track
    setActiveAudio(track)
    if (track === 'native') {
      pulse(setSoloNative)
      pulse(setStopStudent)
    } else {
      pulse(setSoloStudent)
      pulse(setStopNative)
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
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <h4 className="text-sm font-semibold text-on-surface">{t('speakingReview.comparison')}</h4>
        <div className="flex items-center gap-1.5 flex-wrap">
          {hasStudent && (
            <button
              onClick={() => handleSoloPlay('student')}
              className="flex items-center gap-1.5 rounded-lg bg-emerald-500/10 px-3 py-1.5 text-xs font-medium text-emerald-400 hover:bg-emerald-500/20 transition-colors border border-emerald-500/20"
            >
              <Play className="h-3 w-3" />
              {t('speakingReview.playMine')}
            </button>
          )}
          {(ttsAudioUrl || passageText) && (
            <button
              onClick={() => handleSoloPlay('native')}
              className="flex items-center gap-1.5 rounded-lg bg-indigo-500/10 px-3 py-1.5 text-xs font-medium text-indigo-400 hover:bg-indigo-500/20 transition-colors border border-indigo-500/20"
            >
              <Play className="h-3 w-3" />
              {t('speakingReview.playNative')}
            </button>
          )}
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
            externalPlay={syncPlay || soloStudent}
            externalPause={syncPause || stopStudent}
            errorText={t('speakingReview.audioLoadError')}
          />
        )}
        {(ttsAudioUrl || passageText) && (
          <WaveformPlayer
            audioUrl={ttsAudioUrl}
            label={t('speakingReview.nativeSpeaker')}
            color="#6366f1"
            onTimeUpdate={handleNativeTimeUpdate}
            externalPlay={syncPlay || soloNative}
            externalPause={syncPause || stopNative}
            errorText={t('speakingReview.audioLoadError')}
          />
        )}
      </div>
    </div>
  )
}
