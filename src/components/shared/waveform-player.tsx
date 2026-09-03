'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { Play, Pause } from 'lucide-react'

interface WaveformPlayerProps {
  audioUrl?: string
  audioBlob?: Blob
  label: string
  color?: string
  height?: number
  onReady?: (duration: number) => void
  onTimeUpdate?: (time: number) => void
  onError?: (message: string) => void
  errorText?: string
  externalPlay?: boolean
  externalPause?: boolean
}

export function WaveformPlayer({
  audioUrl,
  audioBlob,
  label,
  color = '#6366f1',
  height = 64,
  onReady,
  onTimeUpdate,
  onError,
  errorText,
  externalPlay,
  externalPause,
}: WaveformPlayerProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const wsRef = useRef<any>(null)
  const onErrorRef = useRef(onError)
  onErrorRef.current = onError
  const onReadyRef = useRef(onReady)
  onReadyRef.current = onReady
  const onTimeUpdateRef = useRef(onTimeUpdate)
  onTimeUpdateRef.current = onTimeUpdate
  const [playing, setPlaying] = useState(false)
  const [ready, setReady] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)

  // Initialize wavesurfer
  useEffect(() => {
    if (!containerRef.current) return
    let ws: any = null
    let destroyed = false

    async function init() {
      const WaveSurfer = (await import('wavesurfer.js')).default
      if (destroyed || !containerRef.current) return

      ws = WaveSurfer.create({
        container: containerRef.current,
        waveColor: color + '60',
        progressColor: color,
        cursorColor: color,
        barWidth: 2,
        barGap: 1,
        barRadius: 2,
        height,
        normalize: true,
        backend: 'WebAudio',
      })

      if (audioUrl) {
        ws.load(audioUrl)
      } else if (audioBlob) {
        ws.loadBlob(audioBlob)
      }

      ws.on('ready', () => {
        if (destroyed) return
        setReady(true)
        setLoading(false)
        setError(null)
        setDuration(ws.getDuration())
        onReadyRef.current?.(ws.getDuration())
      })

      ws.on('loading', (percent: number) => {
        if (destroyed) return
        if (percent < 100) setLoading(true)
      })

      ws.on('error', (err: unknown) => {
        if (destroyed) return
        const message = err instanceof Error ? err.message : 'Failed to load audio'
        setLoading(false)
        setError(message)
        onErrorRef.current?.(message)
      })

      ws.on('audioprocess', () => {
        if (destroyed) return
        const t = ws.getCurrentTime()
        setCurrentTime(t)
        onTimeUpdateRef.current?.(t)
      })

      ws.on('play', () => !destroyed && setPlaying(true))
      ws.on('pause', () => !destroyed && setPlaying(false))
      ws.on('finish', () => {
        if (destroyed) return
        setPlaying(false)
        setCurrentTime(0)
      })

      wsRef.current = ws
    }

    init().catch(err => console.error('WaveformPlayer init error:', err))

    return () => {
      destroyed = true
      ws?.destroy()
      wsRef.current = null
    }
  }, [audioUrl, audioBlob, color, height])

  // External play/pause control
  useEffect(() => {
    if (externalPlay && wsRef.current && ready) {
      wsRef.current.play()
    }
  }, [externalPlay, ready])

  useEffect(() => {
    if (externalPause && wsRef.current && ready) {
      wsRef.current.pause()
    }
  }, [externalPause, ready])

  const togglePlay = useCallback(() => {
    wsRef.current?.playPause()
  }, [])

  const formatTime = (s: number) => {
    const m = Math.floor(s / 60)
    const sec = Math.floor(s % 60)
    return `${m}:${sec.toString().padStart(2, '0')}`
  }

  return (
    <div className="space-y-1">
      <p className="text-xs font-medium text-white/60">{label}</p>
      <div className="flex items-center gap-2">
        <button
          onClick={togglePlay}
          disabled={!ready}
          className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20 disabled:opacity-30 transition-colors"
        >
          {playing ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
        </button>
        <div ref={containerRef} className="flex-1 overflow-hidden rounded-lg bg-white/5" />
      </div>
      {error ? (
        <p className="text-[10px] text-red-400">{errorText ?? error}</p>
      ) : (
        <div className="flex justify-between text-[10px] text-white/40">
          <span>{loading ? '...' : formatTime(currentTime)}</span>
          <span>{loading ? '...' : formatTime(duration)}</span>
        </div>
      )}
    </div>
  )
}
