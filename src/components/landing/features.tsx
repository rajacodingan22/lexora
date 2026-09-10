'use client'

import { PlayCircle, GraduationCap, BookOpen } from 'lucide-react'
import { useI18n } from '@/lib/i18n/client'

interface FeatureCard {
  icon: React.ComponentType<{ className?: string }>
  titleKey: string
  descKey: string
}

const featureCards: FeatureCard[] = [
  { icon: PlayCircle, titleKey: 'landing.features.card.tryClass.title', descKey: 'landing.features.card.tryClass.desc' },
  { icon: GraduationCap, titleKey: 'landing.features.card.certification.title', descKey: 'landing.features.card.certification.desc' },
]

export function FeaturesSection() {
  const { t } = useI18n()

  if (featureCards.length === 0) {
    return null
  }

  return (
    <section id="fitur" className="mx-auto max-w-7xl scroll-mt-24 px-4 py-12 sm:px-6 lg:px-8 lg:py-16" aria-label={t('landing.features.ariaLabel')}>
      <div className="mb-10 text-center">
        <span className="inline-flex items-center gap-2 rounded-full border border-border bg-surface-container-low px-3 py-1 text-xs font-bold uppercase tracking-widest text-on-surface-variant">
          <BookOpen className="size-3" aria-hidden="true" /> {t('landing.features.badge')}
        </span>
        <h2 className="mt-4 text-balance text-3xl font-extrabold tracking-tight text-on-surface sm:text-4xl">
          {t('landing.features.titlePart1')}
          <br />
          <span className="gradient-text">{t('landing.features.titlePart2')}</span>
        </h2>
      </div>

      <div className="grid gap-4 sm:gap-5 md:grid-cols-2">
        {featureCards.map(({ icon: Icon, titleKey, descKey }) => (
          <div key={titleKey} className="glass-card rounded-2xl p-6 transition-all duration-[var(--dur)] hover:-translate-y-1 hover:border-primary/30 hover:shadow-lg hover:shadow-primary/10 sm:p-8">
            <span className="flex size-11 items-center justify-center rounded-xl bg-primary-soft text-primary">
              <Icon className="size-5" aria-hidden="true" />
            </span>
            <h3 className="mt-4 text-xl font-extrabold tracking-tight text-on-surface">{t(titleKey)}</h3>
            <p className="mt-2 max-w-md text-sm leading-relaxed text-on-surface-variant">{t(descKey)}</p>
          </div>
        ))}
      </div>
    </section>
  )
}
