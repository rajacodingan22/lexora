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
    <section className="mx-auto max-w-7xl px-4 pb-20 sm:px-6 lg:px-8 lg:pb-24" aria-label={t('landing.languages.ariaLabel')}>
      <div className="mb-12 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-3xl font-extrabold tracking-tight text-on-surface sm:text-4xl">
            {t('landing.languages.titlePrefix')} <span className="gradient-text">{t('landing.languages.titleHighlight')}</span>{t('landing.languages.titleSuffix')}
          </h2>
          <p className="mt-2 text-on-surface-variant">{t('landing.languages.subtitle')}</p>
        </div>
        <Link
          href="/project"
          className="inline-flex items-center gap-1 self-start text-sm font-semibold text-primary hover:underline sm:self-auto"
        >
          {t('landing.languages.viewAll')} &rarr;
        </Link>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
        {languages.map((lang) => (
          <Link
            key={lang.code}
            href={`/project?lang=${encodeURIComponent(lang.code)}`}
            className="glass-card group flex flex-col items-center gap-2 rounded-2xl p-5 hover-lift"
          >
            <div className="flex size-14 items-center justify-center rounded-xl bg-gradient-to-br from-primary-soft to-accent-soft">
              <span className={`fi fi-${FLAG_MAP[lang.code] || 'xx'} text-3xl`} role="img" aria-label={t('landing.languages.flagAria', { name: lang.name })} />
            </div>
            <div className="text-center">
              <div className="font-bold text-on-surface">{lang.name}</div>
            </div>
          </Link>
        ))}
      </div>
    </section>
  )
}
