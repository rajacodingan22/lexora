'use client'

import Link from 'next/link'
import { useI18n } from '@/lib/i18n/client'

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface Language {
  name: string
  code: string
}

interface LanguagesSectionProps {
  languages: Language[]
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

const FLAG_MAP: Record<string, string> = {
  en: 'gb',
  ja: 'jp',
  ko: 'kr',
  ar: 'sa',
  fa: 'ir',
  id: 'id',
  tr: 'tr',
  zh: 'cn',
}

export function LanguagesSection({ languages }: LanguagesSectionProps) {
  const { t } = useI18n()

  if (!languages || languages.length === 0) {
    return null
  }

  return (
    <section className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8 lg:py-16" aria-label={t('landing.languages.ariaLabel')}>
      <div className="mb-10 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <h2 className="text-balance text-3xl font-extrabold tracking-tight text-on-surface sm:text-4xl">
            {t('landing.languages.titlePrefix')} <span className="gradient-text">{t('landing.languages.titleHighlight')}</span>{t('landing.languages.titleSuffix')}
          </h2>
          <p className="mt-2 max-w-2xl text-on-surface-variant">{t('landing.languages.subtitle')}</p>
        </div>
        <Link
          href="/project"
          className="inline-flex shrink-0 items-center gap-1 self-start rounded-lg text-sm font-semibold text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 focus-visible:ring-offset-2 focus-visible:ring-offset-background sm:self-auto"
        >
          {t('landing.languages.viewAll')} <span aria-hidden="true">&rarr;</span>
        </Link>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 md:grid-cols-4 lg:grid-cols-6">
        {languages.map((lang) => (
          <Link
            key={lang.code}
            href={`/project?lang=${encodeURIComponent(lang.code)}`}
            className="glass-card group flex min-w-0 flex-col items-center gap-2.5 rounded-2xl p-5 transition-all duration-[var(--dur)] hover:-translate-y-1 hover:border-primary/30 hover:shadow-lg hover:shadow-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          >
            <div className="flex size-14 items-center justify-center rounded-xl bg-gradient-to-br from-primary-soft to-accent-soft transition-transform duration-[var(--dur)] group-hover:scale-105">
              <span className={`fi fi-${FLAG_MAP[lang.code] || 'xx'} text-3xl`} role="img" aria-label={t('landing.languages.flagAria', { name: lang.name })} />
            </div>
            <div className="min-w-0 text-center">
              <div className="truncate font-bold text-on-surface">{lang.name}</div>
            </div>
          </Link>
        ))}
      </div>
    </section>
  )
}
