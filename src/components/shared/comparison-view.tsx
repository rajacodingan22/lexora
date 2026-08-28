'use client'

import { useState } from 'react'
import { Play, Pause } from 'lucide-react'
import dynamic from 'next/dynamic'

const WaveformPlayer = dynamic(() => import('./waveform-player').then(m => ({ default: m.WaveformPlayer })), { ssr: false })

interface ComparisonViewProps {
  studentAudioUrl?: string
  studentAudioBlob?: Blob
  ttsAudioUrl?: string
}

export function ComparisonView({ studentAudioUrl, studentAudioBlob, ttsAudioUrl }: ComparisonViewProps) {
  const [syncPlay, setSyncPlay] = useState(false)
  const [syncPause, setSyncPause] = useState(false)

  function handleSyncToggle() {
    if (syncPlay) {
      setSyncPause(true)
      setSyncPlay(false)
      setTimeout(() => setSyncPause(false), 100)
    } else {
      setSyncPause(false)
      setSyncPlay(true)
      setTimeout(() => setSyncPlay(false), 100)
    }
  }

  const hasStudent = !!(studentAudioUrl || studentAudioBlob)
  const hasTts = !!ttsAudioUrl

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-semibold text-white">Perbandingan A/B</h4>
        {hasStudent && hasTts && (
          <button
            onClick={handleSyncToggle}
            className="flex items-center gap-1.5 rounded-lg bg-white/10 px-3 py-1.5 text-xs font-medium text-white hover:bg-white/20 transition-colors"
          >
            {syncPlay ? <Pause className="h-3 w-3" /> : <Play className="h-3 w-3" />}
            {syncPlay ? 'Jeda Semua' : 'Putar Bersamaan'}
          </button>
        )}
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {hasStudent && (
          <WaveformPlayer
            audioUrl={studentAudioUrl}
            audioBlob={studentAudioBlob}
            label="Suara Kamu"
            color="#10b981"
            externalPlay={syncPlay}
            externalPause={syncPause}
          />
        )}
        {hasTts && (
          <WaveformPlayer
            audioUrl={ttsAudioUrl}
            label="Native Speaker"
            color="#6366f1"
            externalPlay={syncPlay}
            externalPause={syncPause}
          />
        )}
      </div>
    </div>
  )
}
