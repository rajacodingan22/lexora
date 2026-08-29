'use client'

import { useEffect, useState, useRef, useCallback, useMemo } from 'react'
import { Volume2, Loader2 } from 'lucide-react'
import { useI18n } from '@/lib/i18n/client'

interface KaraokeTextProps {
  text: string
  rate?: number
  onComplete?: () => void
  onWordTimings?: (timings: { word: string; start: number; end: number }[]) => void
  onSentenceTimings?: (timings: { sentence: string; start: number; end: number; wordStart: number; wordEnd: number }[]) => void
}

export function KaraokeText({ text, rate = 0.9, onComplete, onWordTimings, onSentenceTimings }: KaraokeTextProps) {
  const { t } = useI18n()
  const [currentWordIndex, setCurrentWordIndex] = useState(-1)
  const [currentSentenceIndex, setCurrentSentenceIndex] = useState(-1)
  const [completedWords, setCompletedWords] = useState<Set<number>>(new Set())
  const [completedSentences, setCompletedSentences] = useState<Set<number>>(new Set())
  const [isPlaying, setIsPlaying] = useState(false)
  const [isFinished, setIsFinished] = useState(false)
  const [loading, setLoading] = useState(false)

  const words = useMemo(() => text.split(/\s+/).filter(Boolean), [text])

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

  const timingsRef = useRef<{ word: string; start: number; end: number }[]>([])
  const startTimeRef = useRef<number>(0)
  const rafRef = useRef<number>(0)
  const finishedRef = useRef(false)
  const synthRef = useRef<SpeechSynthesisUtterance | null>(null)

  function calcTimings(totalDuration: number) {
    const totalChars = words.reduce((s, w) => s + w.length, 0)
    let acc = 0
    return words.map((word) => {
      const start = (acc / totalChars) * totalDuration
      acc += word.length
      const end = (acc / totalChars) * totalDuration
      return { word, start, end }
    })
  }

  function calcSentenceTimings(totalDuration: number) {
    const totalChars = text.replace(/\s+/g, ' ').length
    let acc = 0
    return sentences.map((sentence, i) => {
      const start = (acc / totalChars) * totalDuration
      acc += sentence.length
      const end = (acc / totalChars) * totalDuration
      const ws = sentenceWordMap[i]
      return { sentence, start, end, wordStart: ws.start, wordEnd: ws.end }
    })
  }

  const tick = useCallback(() => {
    if (finishedRef.current) return
    const elapsed = (performance.now() - startTimeRef.current) / 1000
    const timings = timingsRef.current
    if (!timings.length) {
      rafRef.current = requestAnimationFrame(tick)
      return
    }

    let idx = -1
    for (let i = 0; i < timings.length; i++) {
      if (elapsed >= timings[i].start && elapsed < timings[i].end) {
        idx = i
        break
      } else if (elapsed >= timings[i].end) {
        idx = i + 1
      }
    }
    if (idx >= timings.length) idx = timings.length - 1

    if (idx >= 0) {
      setCurrentWordIndex(idx)
      setCompletedWords(prev => {
        if (prev.size === idx) return prev
        const next = new Set(prev)
        for (let i = 0; i < idx; i++) next.add(i)
        return next
      })

      for (let si = 0; si < sentenceWordMap.length; si++) {
        const sm = sentenceWordMap[si]
        if (idx >= sm.start && idx <= sm.end) {
          setCurrentSentenceIndex(prev => {
            if (prev === si) return si
            setCompletedSentences(p => {
              const next = new Set(p)
              for (let i = 0; i < si; i++) next.add(i)
              return next
            })
            return si
          })
          break
        }
      }
    }

    rafRef.current = requestAnimationFrame(tick)
  }, [words.length, sentenceWordMap])

  const play = useCallback(() => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return
    const synth = window.speechSynthesis
    synth.cancel()

    finishedRef.current = false
    setIsPlaying(true)
    setIsFinished(false)
    setCurrentWordIndex(-1)
    setCurrentSentenceIndex(-1)
    setCompletedWords(new Set())
    setCompletedSentences(new Set())

    // Estimate total duration: ~0.35s per word at rate 0.9, adjusted by rate
    const estimatedDuration = (words.length * 0.35) / (rate || 0.9)

    // Pre-calculate timings BEFORE TTS starts so tick() has data during playback
    const preTimings = calcTimings(estimatedDuration)
    timingsRef.current = preTimings

    const u = new SpeechSynthesisUtterance(text)
    u.lang = 'en-US'
    u.rate = rate

    const voices = synth.getVoices()
    const en = voices.filter(v => v.lang?.toLowerCase().startsWith('en'))
    const google = en.find(v => /google us english/i.test(v.name))
    const ms = en.find(v => /microsoft (aria|zira|jenny)/i.test(v.name))
    const us = en.find(v => /en-us/i.test(v.lang))
    const voice = google || ms || us || en[0]
    if (voice) { u.voice = voice; u.lang = voice.lang }

    u.onstart = () => {
      setLoading(false)
      startTimeRef.current = performance.now()
      rafRef.current = requestAnimationFrame(tick)
    }

    u.onend = () => {
      finishedRef.current = true
      setIsPlaying(false)
      setIsFinished(true)
      cancelAnimationFrame(rafRef.current)

      const elapsed = (performance.now() - startTimeRef.current) / 1000

      // Recalculate with REAL duration (replace estimated timings)
      const realTimings = calcTimings(elapsed)
      timingsRef.current = realTimings
      onWordTimings?.(realTimings)

      const sentTimings = calcSentenceTimings(elapsed)
      onSentenceTimings?.(sentTimings)

      // TTS baca SEMUA words — mark all as completed
      setCompletedWords(new Set(words.map((_, i) => i)))
      setCompletedSentences(new Set(sentences.map((_, i) => i)))

      onComplete?.()
    }

    u.onerror = () => {
      finishedRef.current = true
      setIsPlaying(false)
      setIsFinished(true)
      cancelAnimationFrame(rafRef.current)
      onComplete?.()
    }

    synthRef.current = u
    setLoading(true)
    synth.speak(u)
  }, [text, rate, words, sentences, sentenceWordMap, tick, onComplete, onWordTimings, onSentenceTimings])

  useEffect(() => {
    return () => {
      cancelAnimationFrame(rafRef.current)
      window.speechSynthesis?.cancel()
    }
  }, [])

  function getWordStyle(index: number) {
    if (index === currentWordIndex && isPlaying) {
      return 'text-white bg-indigo-500/40 scale-105 font-bold shadow-sm shadow-indigo-500/20'
    }
    if (completedWords.has(index)) {
      return 'text-emerald-300 bg-emerald-500/10'
    }
    return 'text-white/30'
  }

  return (
    <div className="space-y-4">
      <div className="rounded-2xl bg-white/5 p-6 backdrop-blur-sm border border-white/10">
        <div className="text-base leading-loose tracking-wide">
          {sentences.map((sentence, si) => {
            const wordStart = sentenceWordMap[si].start
            const wordEnd = sentenceWordMap[si].end
            const isCurrentSentence = si === currentSentenceIndex && isPlaying

            return (
              <span
                key={si}
                className={`inline transition-all duration-300 rounded-lg px-1 py-0.5 ${
                  isCurrentSentence ? 'bg-indigo-500/10 border border-indigo-500/20' : ''
                }`}
              >
                {words.slice(wordStart, wordEnd + 1).map((word, wi) => {
                  const globalIdx = wordStart + wi
                  return (
                    <span
                      key={globalIdx}
                      className={`inline-block rounded px-1 py-0.5 mx-0.5 transition-all duration-200 ${getWordStyle(globalIdx)}`}
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

      {!isPlaying && !isFinished && (
        <button
          onClick={play}
          disabled={loading}
          className="flex items-center gap-2 mx-auto rounded-full bg-indigo-500 px-6 py-3 text-sm font-medium text-white hover:bg-indigo-400 transition-colors shadow-lg"
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Volume2 className="h-4 w-4" />}
          {loading ? t('speakingReview.loading') : t('speakingReview.listenFollow')}
        </button>
      )}

      {isPlaying && (
        <div className="flex items-center justify-center gap-2 text-sm text-indigo-300">
          <div className="h-2 w-2 rounded-full bg-indigo-400 animate-pulse" />
          {currentSentenceIndex >= 0
            ? t('speakingReview.sentenceProgress', { current: String(currentSentenceIndex + 1), total: String(sentences.length) })
            : t('speakingReview.starting')
          }
        </div>
      )}

      {isFinished && (
        <div className="text-center text-sm text-emerald-300">
          t('speakingReview.ttsDone')
        </div>
      )}
    </div>
  )
}
