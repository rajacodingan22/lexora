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

  // Initialize wavesurfer (WebAudio dulu; kalau decode gagal mis. webm di Safari,
  // fallback sekali ke MediaElement yang tidak perlu decode)
  useEffect(() => {
    if (!containerRef.current) return
    let ws: any = null
    let destroyed = false
    let fellBack = false

    async function init() {
      const WaveSurfer = (await import('wavesurfer.js')).default
      if (destroyed || !containerRef.current) return

      const container = containerRef.current
      if (!container) return
      const create = (backend: 'WebAudio' | 'MediaElement') => WaveSurfer.create({
        container,
        waveColor: color + '60',
        progressColor: color,
        cursorColor: color,
        barWidth: 2,
        barGap: 1,
        barRadius: 2,
        height,
        normalize: true,
        backend,
      })

      const attach = (instance: any) => {
        ws = instance
        wsRef.current = instance
      }

      const wire = (instance: any) => {
        instance.on('ready', () => {
          if (destroyed) return
          setReady(true)
          setLoading(false)
          setError(null)
          setDuration(instance.getDuration())
          onReadyRef.current?.(instance.getDuration())
        })

        instance.on('loading', (percent: number) => {
          if (destroyed) return
          if (percent < 100) setLoading(true)
        })

        instance.on('error', (err: unknown) => {
          if (destroyed) return
          // Fallback sekali ke MediaElement (tanpa decode — untuk Safari/webm)
          if (!fellBack && (audioUrl || audioBlob)) {
            fellBack = true
            try {
              const fb = create('MediaElement')
              try { instance.destroy() } catch {}
              attach(fb)
              wire(fb)
              if (audioUrl) fb.load(audioUrl)
              else if (audioBlob) fb.loadBlob(audioBlob)
              return
            } catch (e) {
              console.error('WaveformPlayer fallback error:', e)
            }
          }
          const message = err instanceof Error ? err.message : 'Failed to load audio'
          setLoading(false)
          setError(message)
          onErrorRef.current?.(message)
        })

        instance.on('audioprocess', () => {
          if (destroyed) return
          const t = instance.getCurrentTime()
          setCurrentTime(t)
          onTimeUpdateRef.current?.(t)
        })

        instance.on('play', () => !destroyed && setPlaying(true))
        instance.on('pause', () => !destroyed && setPlaying(false))
        instance.on('finish', () => {
          if (destroyed) return
          setPlaying(false)
          setCurrentTime(0)
        })
      }

      ws = create('WebAudio')
      attach(ws)
      wire(ws)

      if (audioUrl) {
        ws.load(audioUrl)
      } else if (audioBlob) {
        ws.loadBlob(audioBlob)
      }
    }

    init().catch(err => console.error('WaveformPlayer init error:', err))

    return () => {
      destroyed = true
      ws?.destroy()
      wsRef.current = null
    }
  }, [audioUrl, audioBlob, color, height])

  // External play/pause control (dengan resume AudioContext + catch autoplay-block)
  useEffect(() => {
    if (!externalPlay || !wsRef.current || !ready) return
    const ws = wsRef.current
    ;(async () => {
      try {
        const ctx = (ws as any).getAudioContext?.() || (ws as any).audioContext
        if (ctx?.state === 'suspended') await ctx.resume()
        await ws.play()
      } catch (e) {
        console.error('WaveformPlayer external play blocked:', e)
      }
    })()
  }, [externalPlay, ready])

  useEffect(() => {
    if (externalPause && wsRef.current && ready) {
      try {
        const r = wsRef.current.pause()
        if (r instanceof Promise) r.catch((e: unknown) => console.error('WaveformPlayer pause error:', e))
      } catch (e) {
        console.error('WaveformPlayer pause error:', e)
      }
    }
  }, [externalPause, ready])

  const togglePlay = useCallback(() => {
    const ws = wsRef.current
    if (!ws) return
    ;(async () => {
      try {
        const ctx = (ws as any).getAudioContext?.() || (ws as any).audioContext
        if (ctx?.state === 'suspended') await ctx.resume()
        await ws.playPause()
      } catch (e) {
        console.error('WaveformPlayer play blocked (autoplay policy?):', e)
      }
    })()
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
