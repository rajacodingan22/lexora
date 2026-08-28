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
  externalPlay,
  externalPause,
}: WaveformPlayerProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const wsRef = useRef<any>(null)
  const [playing, setPlaying] = useState(false)
  const [ready, setReady] = useState(false)
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
        setDuration(ws.getDuration())
        onReady?.(ws.getDuration())
      })

      ws.on('audioprocess', () => {
        if (destroyed) return
        setCurrentTime(ws.getCurrentTime())
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

    init()

    return () => {
      destroyed = true
      ws?.destroy()
      wsRef.current = null
    }
  }, [audioUrl, audioBlob, color, height])

  // External play/pause control
  useEffect(() => {
    if (externalPlay && wsRef.current) {
      wsRef.current.play()
    }
  }, [externalPlay])

  useEffect(() => {
    if (externalPause && wsRef.current) {
      wsRef.current.pause()
    }
  }, [externalPause])

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
      <div className="flex justify-between text-[10px] text-white/40">
        <span>{formatTime(currentTime)}</span>
        <span>{formatTime(duration)}</span>
      </div>
    </div>
  )
}
