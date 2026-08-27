'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { Accessibility, Sun, Moon, Contrast, Type, Eye, X, Palette, Sparkles } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useI18n } from '@/lib/i18n/client'

type Theme = 'dark' | 'light' | 'high-contrast'
type FontSize = 'sm' | 'normal' | 'lg' | 'xl'
type LineSpacing = 'normal' | 'relaxed' | 'wide'

const STORAGE_KEYS = {
  theme: 'a11y-theme',
  fontSize: 'a11y-font-size',
  lineSpacing: 'a11y-line-spacing',
  dyslexia: 'a11y-dyslexia',
  reducedMotion: 'a11y-reduced-motion',
  colorBlind: 'a11y-color-blind',
} as const

function setDataAttr(name: string, value: string) {
  document.documentElement.setAttribute(name, value)
}

function getStored<T extends string>(key: string, fallback: T): T {
  if (typeof window === 'undefined') return fallback
  return (localStorage.getItem(key) ?? fallback) as T
}

function isStoredTrue(key: string): boolean {
  if (typeof window === 'undefined') return false
  return localStorage.getItem(key) === 'true'
}

export function AccessibilityToggle() {
  const { t } = useI18n()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  const [theme, setThemeState] = useState<Theme>('dark')
  const [fontSize, setFontSizeState] = useState<FontSize>('normal')
  const [lineSpacing, setLineSpacingState] = useState<LineSpacing>('normal')
  const [dyslexia, setDyslexiaState] = useState(false)
  const [reducedMotion, setReducedMotionState] = useState(false)
  const [colorBlind, setColorBlindState] = useState(false)

  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDocClick)
    document.addEventListener('keydown', onEsc)
    return () => {
      document.removeEventListener('mousedown', onDocClick)
      document.removeEventListener('keydown', onEsc)
    }
  }, [])

  const syncAll = useCallback(() => {
    const t = getStored<Theme>(STORAGE_KEYS.theme, 'dark')
    const f = getStored<FontSize>(STORAGE_KEYS.fontSize, 'normal')
    const l = getStored<LineSpacing>(STORAGE_KEYS.lineSpacing, 'normal')
    const d = isStoredTrue(STORAGE_KEYS.dyslexia)
    const r = isStoredTrue(STORAGE_KEYS.reducedMotion)
    const c = isStoredTrue(STORAGE_KEYS.colorBlind)

    setThemeState(t)
    setFontSizeState(f)
    setLineSpacingState(l)
    setDyslexiaState(d)
    setReducedMotionState(r)
    setColorBlindState(c)

    setDataAttr('data-theme', t)
    setDataAttr('data-font-size', f)
    setDataAttr('data-line-spacing', l)
    setDataAttr('data-dyslexia', String(d))
    setDataAttr('data-reduced-motion', String(r))
    setDataAttr('data-color-blind', String(c))
  }, [])

  useEffect(() => {
    syncAll()
  }, [syncAll])

  const setTheme = (t: Theme) => {
    setThemeState(t); localStorage.setItem(STORAGE_KEYS.theme, t); setDataAttr('data-theme', t)
  }
  const setFontSize = (f: FontSize) => {
    setFontSizeState(f); localStorage.setItem(STORAGE_KEYS.fontSize, f); setDataAttr('data-font-size', f)
  }
  const setLineSpacing = (l: LineSpacing) => {
    setLineSpacingState(l); localStorage.setItem(STORAGE_KEYS.lineSpacing, l); setDataAttr('data-line-spacing', l)
  }
  const toggleDyslexia = () => {
    const next = !dyslexia; setDyslexiaState(next); localStorage.setItem(STORAGE_KEYS.dyslexia, String(next)); setDataAttr('data-dyslexia', String(next))
  }
  const toggleReducedMotion = () => {
    const next = !reducedMotion; setReducedMotionState(next); localStorage.setItem(STORAGE_KEYS.reducedMotion, String(next)); setDataAttr('data-reduced-motion', String(next))
  }
  const toggleColorBlind = () => {
    const next = !colorBlind; setColorBlindState(next); localStorage.setItem(STORAGE_KEYS.colorBlind, String(next)); setDataAttr('data-color-blind', String(next))
  }

  const themeOptions: { value: Theme; label: string }[] = [
    { value: 'dark', label: t('ui2.a11y.themeDark') },
    { value: 'light', label: t('ui2.a11y.themeLight') },
    { value: 'high-contrast', label: t('ui2.a11y.themeContrast') },
  ]

  const fontOptions: { value: FontSize; label: string }[] = [
    { value: 'sm', label: '14' },
    { value: 'normal', label: '16' },
    { value: 'lg', label: '18' },
    { value: 'xl', label: '20' },
  ]

  const spacingOptions: { value: LineSpacing; label: string }[] = [
    { value: 'normal', label: '1.5' },
    { value: 'relaxed', label: '1.8' },
    { value: 'wide', label: '2.0' },
  ]

  return (
    <div ref={ref} className="relative inline-flex">
      <button
        onClick={() => setOpen(!open)}
        aria-label={open ? t('ui2.a11y.closeSettings') : t('ui2.a11y.openSettings')}
        aria-expanded={open}
        aria-controls="accessibility-panel"
        aria-haspopup="menu"
        className="flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-surface-container-low text-on-surface-variant transition-colors hover:bg-surface-hover hover:text-on-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {open ? <X className="size-4" aria-hidden="true" /> : <Accessibility className="size-4" aria-hidden="true" />}
      </button>

      {open && (
        <div
          id="accessibility-panel"
          role="region"
          aria-label={t('ui2.a11y.panelLabel')}
          className="absolute right-0 top-full z-50 mt-2 w-[min(20rem,calc(100vw-3rem))] animate-fade-in rounded-2xl border border-border bg-surface-container-lowest p-5 shadow-2xl max-h-[70vh] overflow-y-auto"
        >
          <div className="mb-4 flex items-center gap-2">
            <span className="flex size-8 items-center justify-center rounded-lg bg-primary-soft text-primary">
              <Accessibility className="size-4" aria-hidden="true" />
            </span>
            <div>
              <p className="text-sm font-bold text-on-surface">{t('ui2.a11y.title')}</p>
              <p className="text-[10px] font-medium uppercase tracking-wider text-on-surface-variant">
                {t('ui2.a11y.prefsSaved')}
              </p>
            </div>
          </div>

          <div className="space-y-5">
            <section>
              <p className="mb-2 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-on-surface-variant">
                <Contrast className="size-3" aria-hidden="true" /> {t('ui2.a11y.theme')}
              </p>
              <div className="grid grid-cols-3 gap-1.5">
                {themeOptions.map(({ value, label }) => {
                  const Icon = value === 'dark' ? Moon : value === 'light' ? Sun : Contrast
                  return (
                    <button
                      key={value}
                      onClick={() => setTheme(value)}
                      aria-pressed={theme === value}
                      className={cn(
                        'flex flex-col items-center gap-1 rounded-lg px-2 py-2 text-[10px] font-bold uppercase transition-all duration-[var(--dur-fast)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                        theme === value
                          ? 'bg-primary text-primary-foreground shadow-sm'
                          : 'bg-surface-container-high text-on-surface-variant hover:bg-surface-container-highest hover:text-on-surface'
                      )}
                    >
                      <Icon className="size-3.5" aria-hidden="true" /> {label.split(' ')[0]}
                    </button>
                  )
                })}
              </div>
            </section>

            <section>
              <p className="mb-2 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-on-surface-variant">
                <Type className="size-3" aria-hidden="true" /> {t('ui2.a11y.fontSize')}
              </p>
              <div className="grid grid-cols-4 gap-1.5">
                {fontOptions.map(({ value, label }) => (
                  <button
                    key={value}
                    onClick={() => setFontSize(value)}
                    aria-pressed={fontSize === value}
                    className={cn(
                      'rounded-lg py-2 text-center text-xs font-bold transition-all duration-[var(--dur-fast)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                      fontSize === value
                        ? 'bg-primary text-primary-foreground shadow-sm'
                        : 'bg-surface-container-high text-on-surface-variant hover:bg-surface-container-highest'
                    )}
                  >
                    {label}px
                  </button>
                ))}
              </div>
            </section>

            <section>
              <p className="mb-2 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-on-surface-variant">
                <Eye className="size-3" aria-hidden="true" /> {t('ui2.a11y.spacing')}
              </p>
              <div className="grid grid-cols-3 gap-1.5">
                {spacingOptions.map(({ value, label }) => (
                  <button
                    key={value}
                    onClick={() => setLineSpacing(value)}
                    aria-pressed={lineSpacing === value}
                    className={cn(
                      'rounded-lg py-2 text-xs font-bold transition-all duration-[var(--dur-fast)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                      lineSpacing === value
                        ? 'bg-primary text-primary-foreground shadow-sm'
                        : 'bg-surface-container-high text-on-surface-variant hover:bg-surface-container-highest'
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </section>

            <div className="divider-soft" />

            <section className="space-y-2">
              {[
                { key: 'ui2.a11y.toggleDyslexia', icon: Type, value: dyslexia, onChange: toggleDyslexia },
                { key: 'ui2.a11y.toggleReducedMotion', icon: Sparkles, value: reducedMotion, onChange: toggleReducedMotion },
                { key: 'ui2.a11y.toggleColorBlind', icon: Palette, value: colorBlind, onChange: toggleColorBlind },
              ].map(({ key, icon: Icon, value, onChange }) => {
                const label = t(key)
                return (
                  <div key={key} className="flex items-center justify-between rounded-lg bg-surface-container-high px-3 py-2.5">
                    <div className="flex items-center gap-2">
                      <Icon className="size-4 text-on-surface-variant" aria-hidden="true" />
                      <span className="text-xs font-medium text-on-surface">{label}</span>
                    </div>
                    <button
                      onClick={onChange}
                      className={cn(
                        'relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                        value ? 'bg-primary' : 'bg-surface-container-highest'
                      )}
                      role="switch"
                      aria-checked={value}
                      aria-label={t('ui2.a11y.toggleAction', { label })}
                    >
                      <span
                        className={cn(
                          'inline-block size-3.5 transform rounded-full bg-on-surface shadow-sm transition-transform',
                          value ? 'translate-x-5' : 'translate-x-0.5'
                        )}
                      />
                    </button>
                  </div>
                )
              })}
            </section>

            <p className="border-t border-border pt-3 text-center text-[10px] text-on-surface-variant">
              {t('ui2.a11y.savedFooter')}
            </p>
          </div>
        </div>
      )}
    </div>
  )
}