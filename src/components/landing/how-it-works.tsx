'use client'

import { Zap } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useI18n } from '@/lib/i18n/client'

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface Step {
  num: string
  title: string
  desc: string
  icon: React.ComponentType<{ className?: string }>
  accent?: boolean
}

interface HowItWorksSectionProps {
  steps: Step[]
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export function HowItWorksSection({ steps }: HowItWorksSectionProps) {
  const { t } = useI18n()

  if (!steps || steps.length === 0) {
    return null
  }

  return (
    <section id="cara-kerja" className="mx-auto max-w-7xl scroll-mt-24 px-4 py-12 sm:px-6 lg:px-8 lg:py-16" aria-label={t('landing.howItWorks.ariaLabel')}>
      <div className="mb-10 text-center">
        <span className="inline-flex items-center gap-2 rounded-full border border-border bg-surface-container-low px-3 py-1 text-xs font-bold uppercase tracking-widest text-on-surface-variant">
          <Zap className="size-3" aria-hidden="true" /> {t('landing.howItWorks.badge')}
        </span>
        <h2 className="mt-4 text-balance text-3xl font-extrabold tracking-tight text-on-surface sm:text-4xl">
          {t('landing.howItWorks.title')}
        </h2>
        <p className="mt-2 text-on-surface-variant">{t('landing.howItWorks.subtitle')}</p>
      </div>

      {steps.length >= 2 && (
        <div className="step-connector relative grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {steps.slice(0, 4).map((s) => {
            const Icon = s.icon
            return (
              <div
                key={s.num}
                className="glass-card relative z-10 rounded-2xl p-6 hover-lift"
              >
                <div className="mb-4 flex items-center justify-between">
                  <span
                    className={cn(
                      'flex size-11 items-center justify-center rounded-xl font-black shadow-md transition-transform duration-[var(--dur)] hover:scale-110',
                      s.accent
                        ? 'bg-gradient-to-br from-accent to-primary text-primary-foreground'
                        : 'bg-gradient-to-br from-secondary to-primary text-primary-foreground'
                    )}
                  >
                    <Icon className="size-5" aria-hidden="true" />
                  </span>
                  <span className="font-mono text-sm font-bold text-on-surface-variant">{s.num}</span>
                </div>
                <h3 className="mb-2 text-lg font-bold text-on-surface">{s.title}</h3>
                <p className="text-sm leading-relaxed text-on-surface-variant">{s.desc}</p>
              </div>
            )
          })}
        </div>
      )}

      {steps.length === 1 && (
        <div className="glass-card relative z-10 mx-auto max-w-md rounded-2xl p-6 hover-lift">
          <div className="mb-4 flex items-center justify-between">
            <span className="flex size-11 items-center justify-center rounded-xl bg-gradient-to-br from-secondary to-primary font-black text-primary-foreground shadow-md">
              <Zap className="size-5" aria-hidden="true" />
            </span>
            <span className="font-mono text-sm font-bold text-on-surface-variant">1</span>
          </div>
          <h3 className="mb-2 text-lg font-bold text-on-surface">{steps[0].title}</h3>
          <p className="text-sm leading-relaxed text-on-surface-variant">{steps[0].desc}</p>
        </div>
      )}
    </section>
  )
}
