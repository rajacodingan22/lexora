'use client'

import Link from 'next/link'
import {
  PlayCircle, CheckCircle2, Users,
  Globe2, Star, ArrowRight, Sparkles, Zap,
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
    { value: '6+', label: t('landing.hero.stat.languages'), icon: Globe2, color: 'from-cyan-400 to-blue-500' },
    { value: '100%', label: t('landing.hero.stat.interactive'), icon: Users, color: 'from-violet-400 to-purple-500' },
    { value: 'Certified', label: t('landing.hero.stat.certified'), icon: Star, color: 'from-amber-400 to-orange-500' },
  ]

  return (
    <section className="relative mx-auto max-w-7xl px-4 pb-16 pt-8 sm:px-6 lg:px-8 lg:pb-32" aria-label={t('landing.hero.ariaLabel')}>
      {/* Animated background elements */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 -left-32 w-96 h-96 bg-primary/20 rounded-full blur-3xl animate-pulse" />
        <div className="absolute bottom-1/4 -right-32 w-96 h-96 bg-accent/20 rounded-full blur-3xl animate-pulse delay-1000" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-gradient-to-r from-primary/10 via-transparent to-accent/10 rounded-full blur-3xl" />
      </div>

      <div className="relative mx-auto max-w-5xl text-center">
        {/* Badge with enhanced styling */}
        <div className="mb-8 inline-flex items-center gap-2.5 rounded-full border border-primary/30 bg-gradient-to-r from-primary/10 via-surface-container-lowest/80 to-accent/10 px-5 py-2 backdrop-blur-xl shadow-lg shadow-primary/10">
          <span className="relative flex size-2.5">
            <span className="absolute inline-flex size-full rounded-full bg-gradient-to-r from-accent to-primary opacity-75 animate-ping-soft" />
            <span className="relative inline-flex size-2.5 rounded-full bg-gradient-to-r from-accent to-primary" />
          </span>
          <Sparkles className="size-3.5 text-accent" aria-hidden="true" />
          <span className="text-xs font-bold uppercase tracking-widest text-on-surface-variant">
            {t('landing.hero.badge')}
          </span>
        </div>

        {/* Main heading with gradient and animation */}
        <h1 className="text-balance text-3xl font-black leading-[1.1] tracking-tight text-on-surface sm:text-5xl md:text-6xl lg:text-7xl">
          <span className="block mb-2">{heroData?.title ?? t('landing.hero.titleFallback')}</span>
          <span className="bg-gradient-to-r from-primary via-accent to-secondary bg-clip-text text-transparent animate-gradient bg-[length:200%_auto]">
            {heroData ? t('landing.hero.titleHighlight') : t('landing.hero.titleHighlightFallback')}
          </span>
        </h1>

        {/* Subtitle */}
        <p className="mx-auto mt-8 max-w-2xl text-lg leading-relaxed text-on-surface-variant sm:text-xl md:text-2xl">
          {heroData?.subtitle ?? t('landing.hero.subtitleFallback')}
        </p>

        {/* CTA Buttons with enhanced styling */}
        <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row sm:gap-6">
          <Link
            href={claimHref}
            className="group relative w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-2xl px-8 py-4 text-base font-bold text-primary-foreground shadow-2xl shadow-primary/30 transition-all duration-300 hover:-translate-y-1 hover:shadow-primary/50 overflow-hidden"
          >
            <span className="absolute inset-0 bg-gradient-to-r from-accent via-primary to-secondary bg-[length:200%_auto] animate-gradient" />
            <Zap className="relative z-10 size-5 fill-current" />
            <span className="relative z-10">{heroData?.ctaText ?? t('landing.hero.ctaFallback')}</span>
            <ArrowRight className="relative z-10 size-5 transition-transform group-hover:translate-x-1" />
          </Link>
          
          <Link
            href="/project"
            className="group w-full sm:w-auto inline-flex items-center justify-center gap-2.5 rounded-2xl border-2 border-border/50 bg-surface-container-lowest/50 px-8 py-4 text-base font-bold text-on-surface backdrop-blur-xl transition-all duration-300 hover:border-primary/50 hover:bg-primary/5 hover:-translate-y-1 hover:shadow-xl hover:shadow-primary/10"
          >
            <div className="flex size-9 items-center justify-center rounded-xl bg-gradient-to-br from-primary/20 to-accent/20 group-hover:from-primary/30 group-hover:to-accent/30 transition-colors">
              <PlayCircle className="size-5 text-primary" aria-hidden="true" />
            </div>
            {t('landing.hero.tryFree')}
          </Link>
        </div>

        {/* Feature pills */}
        {(heroData?.featurePills?.length ?? 0) > 0 && (
          <div className="mt-12 flex flex-wrap items-center justify-center gap-3 text-sm font-semibold text-on-surface-variant">
            {heroData!.featurePills.map((pill: string) => (
              <span
                key={pill}
                className="flex items-center gap-2 rounded-full border border-success/30 bg-success/10 px-4 py-2 backdrop-blur-sm"
              >
                <CheckCircle2 className="size-4 text-success" aria-hidden="true" />
                {pill}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Stats banner with glassmorphism */}
      <div className="relative mt-24 grid gap-6 sm:grid-cols-3">
        {stats.map(({ value, label, icon: Icon, color }) => (
          <div
            key={label}
            className="group relative overflow-hidden rounded-3xl border border-border/50 bg-surface-container-lowest/50 p-6 backdrop-blur-xl transition-all duration-500 hover:-translate-y-2 hover:border-primary/30 hover:shadow-2xl hover:shadow-primary/10"
          >
            <div className={`absolute top-0 right-0 w-32 h-32 bg-gradient-to-br ${color} opacity-10 rounded-full blur-2xl -translate-y-1/2 translate-x-1/2 group-hover:opacity-20 transition-opacity`} />
            <div className="relative flex items-center gap-4">
              <span className={`flex size-14 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br ${color} text-white shadow-lg`}>
                <Icon className="size-7" aria-hidden="true" />
              </span>
              <div>
                <div className="text-3xl font-black tracking-tight text-on-surface">
                  {value}
                </div>
                <div className="text-sm font-medium text-on-surface-variant">{label}</div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}
