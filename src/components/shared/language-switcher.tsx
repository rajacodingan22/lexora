'use client'

import { useEffect, useRef, useState } from 'react'
import { Globe, Check } from 'lucide-react'
import { LANGS, type Lang } from '@/lib/i18n/config'
import { useI18n } from '@/lib/i18n/client'
import { cn } from '@/lib/utils'

interface LanguageSwitcherProps {
  className?: string
  align?: 'left' | 'right'
  variant?: 'default' | 'compact'
}

export function LanguageSwitcher({ className, align = 'right', variant = 'default' }: LanguageSwitcherProps) {
  const { lang, setLang, t } = useI18n()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

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

  const current = LANGS.find((l) => l.code === lang) ?? LANGS[0]

  return (
    <div ref={ref} className={cn('relative inline-block', className)}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={t('lang.switch')}
        className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm font-medium text-on-surface-variant transition-colors duration-[var(--dur-fast)] hover:bg-surface-hover hover:text-on-surface"
      >
        <Globe className="size-4" aria-hidden="true" />
        {variant === 'default' && <span className="hidden sm:inline">{current.native}</span>}
      </button>

      {open && (
        <div
          role="menu"
          aria-label={t('lang.label')}
          className={cn(
            'absolute top-full z-50 mt-2 min-w-[11rem] overflow-hidden rounded-xl border border-border bg-surface-container-lowest p-1 shadow-lg animate-fade-in',
            align === 'right' ? 'right-0' : 'left-0'
          )}
        >
          {LANGS.map((l) => (
            <button
              key={l.code}
              type="button"
              role="menuitemradio"
              aria-checked={l.code === lang}
              onClick={() => {
                setLang(l.code as Lang)
                setOpen(false)
              }}
              className={cn(
                'flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2 text-left text-sm transition-colors hover:bg-surface-hover',
                l.code === lang ? 'font-semibold text-primary' : 'text-on-surface'
              )}
            >
              <span>{l.native}</span>
              {l.code === lang && <Check className="size-4" aria-hidden="true" />}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
