'use client'

import Link from 'next/link'
import {
  PlayCircle, CheckCircle2, Users,
  Globe2, Star,
} from 'lucide-react'
import { useAuth } from '@/lib/auth-context'
import { useI18n } from '@/lib/i18n/client'

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface HeroData {
  title: string
  subtitle: string
  ctaText: string
  ctaLink: string
  featurePills: string[]
}

interface HeroSectionProps {
  testimonials?: any[]
  heroData?: HeroData
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export function HeroSection({
  testimonials: _testimonials,
  heroData,
}: HeroSectionProps) {
  const { user } = useAuth()
  const { t } = useI18n()
  const claimHref = user
    ? '/student/dashboard'
    : heroData?.ctaLink ?? '/daftar'

  const stats = [
    { value: '6', label: t('landing.hero.stat.languages'), icon: Globe2 },
    { value: 'Zoom', label: t('landing.hero.stat.interactive'), icon: Users },
    { value: 'Yes', label: t('landing.hero.stat.certified'), icon: Star },
  ]

  return (
    <section className="mx-auto max-w-7xl px-4 pb-16 pt-4 sm:px-6 lg:px-8 lg:pb-24" aria-label={t('landing.hero.ariaLabel')}>
      <div className="mx-auto max-w-3xl text-center">
        <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-border bg-surface-container-lowest/60 px-4 py-1.5 backdrop-blur">
          <span className="relative flex size-2">
            <span className="absolute inline-flex size-full rounded-full bg-accent opacity-75 animate-ping-soft" />
            <span className="relative inline-flex size-2 rounded-full bg-accent" />
          </span>
          <span className="text-xs font-bold uppercase tracking-widest text-on-surface-variant">
            {t('landing.hero.badge')}
          </span>
          
        </div>

        <h1 className="text-balance text-2xl font-black leading-[1.05] tracking-tight text-on-surface sm:text-4xl md:text-5xl lg:text-6xl">
          {heroData?.title ?? t('landing.hero.titleFallback')}{' '}
          <span className="gradient-text">{heroData ? t('landing.hero.titleHighlight') : t('landing.hero.titleHighlightFallback')}</span>
        </h1>

        <p className="mx-auto mt-6 max-w-2xl text-lg leading-relaxed text-on-surface-variant sm:text-xl">
          {heroData?.subtitle ?? t('landing.hero.subtitleFallback')}
        </p>

        <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <Link
            href={claimHref}
            className="btn-gradient w-full rounded-xl px-8 py-3.5 text-center text-base font-bold text-primary-foreground shadow-md sm:w-auto"
          >
            {heroData?.ctaText ?? t('landing.hero.ctaFallback')}
          </Link>
          <Link
            href="/project"
            className="glass-card flex w-full items-center justify-center gap-2 rounded-xl px-8 py-3.5 text-base font-bold text-on-surface transition-all duration-[var(--dur)] hover:bg-surface-hover sm:w-auto"
          >
            <PlayCircle className="size-5 text-primary" aria-hidden="true" />
            {t('landing.hero.tryFree')}
          </Link>
        </div>

        {(heroData?.featurePills?.length ?? 0) > 0 && (
          <div className="mt-10 flex flex-wrap items-center justify-center gap-2 text-xs font-semibold text-on-surface-variant">
            {heroData!.featurePills.map((pill: string) => (
              <span
                key={pill}
                className="flex items-center gap-2 rounded-full border border-border bg-surface-container-low px-3 py-1.5"
              >
                <CheckCircle2 className="size-3.5 text-success" aria-hidden="true" />
                {pill}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Hero stats banner */}
      <div className="mt-16 grid gap-4 sm:grid-cols-3">
        {stats.map(({ value, label, icon: Icon }) => (
          <div
            key={label}
            className="glass-card flex items-center gap-3 rounded-2xl px-5 py-4"
          >
            <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary-soft text-primary">
              <Icon className="size-5" aria-hidden="true" />
            </span>
            <div>
              <div className="text-2xl font-extrabold tracking-tight text-on-surface">
                {value}
              </div>
              <div className="text-xs font-medium text-on-surface-variant">{label}</div>
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}
