'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { Volume2, Pause, Play, Square } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useI18n } from '@/lib/i18n/client'

const LANGUAGES = [
  { labelKey: 'ui2.sr.langEnglish', value: 'en-US' },
  { labelKey: 'ui2.sr.langJapanese', value: 'ja-JP' },
  { labelKey: 'ui2.sr.langKorean', value: 'ko-KR' },
  { labelKey: 'ui2.sr.langArabic', value: 'ar-SA' },
  { labelKey: 'ui2.sr.langPersian', value: 'fa-IR' },
  { labelKey: 'ui2.sr.langIndonesian', value: 'id-ID' },
  { labelKey: 'ui2.sr.langTurkish', value: 'tr-TR' },
  { labelKey: 'ui2.sr.langChinese', value: 'zh-CN' },
]

export function ScreenReader({ message }: { message: string | null }) {
  const { t } = useI18n()
  const regionRef = useRef<HTMLDivElement>(null)
  const prevRef = useRef<string | null>(null)
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null)
  const [hasMain, setHasMain] = useState(false)
  const [speaking, setSpeaking] = useState(false)
  const [paused, setPaused] = useState(false)
  const [lang, setLang] = useState('en-US')

  useEffect(() => {
    setHasMain(!!document.querySelector('main'))
  }, [])

  useEffect(() => {
    if (message && message !== prevRef.current) {
      prevRef.current = message
      if (regionRef.current) {
        regionRef.current.textContent = ''
        requestAnimationFrame(() => {
          if (regionRef.current) {
            regionRef.current.textContent = message
          }
        })
      }
    }
  }, [message])

  const stopSpeaking = useCallback(() => {
    window.speechSynthesis.cancel()
    setSpeaking(false)
    setPaused(false)
    utteranceRef.current = null
  }, [])

  const handleReadAloud = () => {
    const main = document.querySelector('main')
    if (!main) return
    const text = main.innerText
    if (!text) return

    if (utteranceRef.current) {
      stopSpeaking()
    }

    const utterance = new SpeechSynthesisUtterance(text)
    utterance.lang = lang
    utteranceRef.current = utterance

    utterance.onstart = () => setSpeaking(true)
    utterance.onend = () => {
      setSpeaking(false)
      setPaused(false)
      utteranceRef.current = null
    }
    utterance.onerror = () => {
      setSpeaking(false)
      setPaused(false)
      utteranceRef.current = null
    }
    utterance.onpause = () => setPaused(true)
    utterance.onresume = () => setPaused(false)

    window.speechSynthesis.cancel()
    window.speechSynthesis.speak(utterance)
  }

  const handlePause = () => {
    window.speechSynthesis.pause()
  }

  const handleResume = () => {
    window.speechSynthesis.resume()
  }

  useEffect(() => {
    return () => {
      if (utteranceRef.current) {
        window.speechSynthesis.cancel()
      }
    }
  }, [])

  return (
    <>
      <div
        ref={regionRef}
        aria-live="polite"
        aria-atomic="true"
        className="sr-only"
      />

      {hasMain && (
        <div className="fixed bottom-[11.5rem] left-6 z-50 flex items-center gap-2 rounded-2xl border border-border bg-background p-2 shadow-lg">
          {!speaking ? (
            <button
              onClick={handleReadAloud}
              className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              aria-label={t('ui2.sr.readPageAria')}
            >
              <Volume2 className="h-4 w-4" />
              {t('ui2.sr.readAloud')}
            </button>
          ) : (
            <div className="flex items-center gap-1">
              <button
                onClick={paused ? handleResume : handlePause}
                className={cn(
                  'flex items-center justify-center rounded-lg p-2 text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                  'bg-surface-container-high text-on-surface-variant hover:bg-surface-container-highest',
                )}
                aria-label={paused ? t('ui2.sr.resume') : t('ui2.sr.pause')}
              >
                {paused ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />}
              </button>
              <button
                onClick={stopSpeaking}
                className="flex items-center justify-center rounded-lg p-2 text-xs bg-surface-container-high text-on-surface-variant hover:bg-surface-container-highest transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                aria-label={t('ui2.sr.stop')}
              >
                <Square className="h-4 w-4" />
              </button>
            </div>
          )}
          <select
            value={lang}
            onChange={(e) => setLang(e.target.value)}
            className="rounded-lg bg-surface-container-high px-2 py-1.5 text-xs text-on-surface border-none outline-none focus-visible:ring-2 focus-visible:ring-ring cursor-pointer"
            aria-label={t('ui2.sr.selectLang')}
          >
            {LANGUAGES.map((l) => (
              <option key={l.value} value={l.value}>{t(l.labelKey)}</option>
            ))}
          </select>
        </div>
      )}
    </>
  )
}
