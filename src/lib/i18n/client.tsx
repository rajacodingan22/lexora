'use client'

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { DEFAULT_LANG, isLang, LANG_COOKIE, type Lang } from './config'
import { getMessages } from './registry'
import { makeT, type Messages, type TranslateVars } from './translate'

interface I18nContextValue {
  lang: Lang
  setLang: (lang: Lang) => void
  t: (key: string, vars?: TranslateVars) => string
  messages: Messages
}

const I18nContext = createContext<I18nContextValue | null>(null)

function readInitialLang(): Lang {
  if (typeof window === 'undefined') return DEFAULT_LANG
  try {
    const match = document.cookie
      .split(';')
      .map((c) => c.trim())
      .find((c) => c.startsWith(`${LANG_COOKIE}=`))
    if (match) {
      const stored = match.slice(LANG_COOKIE.length + 1)
      if (isLang(stored)) return stored
    }
  } catch {
    /* ignore */
  }
  return DEFAULT_LANG
}

export function LanguageProvider({ children, initialLang }: { children: React.ReactNode; initialLang?: Lang }) {
  const [lang, setLangState] = useState<Lang>(initialLang ?? DEFAULT_LANG)
  const router = useRouter()

  useEffect(() => {
    if (initialLang && initialLang !== lang) setLangState(initialLang)
  }, [initialLang])

  useEffect(() => {
    if (lang !== initialLang) return
    const cookieLang = readInitialLang()
    if (cookieLang !== lang) setLangState(cookieLang)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    document.documentElement.lang = lang
    try {
      window.localStorage.setItem('lexora_lang', lang)
      document.cookie = `${LANG_COOKIE}=${lang}; path=/; max-age=31536000; samesite=lax`
    } catch {
      /* ignore */
    }
  }, [lang, initialLang])

  const setLang = useCallback(
    (next: Lang) => {
      setLangState(next)
      try {
        document.cookie = `${LANG_COOKIE}=${next}; path=/; max-age=31536000; samesite=lax`
        window.localStorage.setItem('lexora_lang', next)
      } catch {
        /* ignore */
      }
      router.refresh()
    },
    [router]
  )

  const value = useMemo<I18nContextValue>(() => {
    const messages = getMessages(lang)
    const fallback = getMessages(DEFAULT_LANG)
    const t = makeT(messages, fallback)
    return { lang, setLang, t, messages }
  }, [lang, setLang])

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}

export function useI18n(): I18nContextValue {
  const ctx = useContext(I18nContext)
  if (!ctx) {
    throw new Error('useI18n must be used within <LanguageProvider>')
  }
  return ctx
}
