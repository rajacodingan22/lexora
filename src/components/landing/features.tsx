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
    <section id="fitur" className="mx-auto max-w-7xl px-4 pb-20 sm:px-6 lg:px-8 lg:pb-24" aria-label={t('landing.features.ariaLabel')}>
      <div className="mb-12 text-center">
        <span className="inline-flex items-center gap-2 rounded-full border border-border bg-surface-container-low px-3 py-1 text-xs font-bold uppercase tracking-widest text-on-surface-variant">
          <BookOpen className="size-3" aria-hidden="true" /> {t('landing.features.badge')}
        </span>
        <h2 className="mt-4 text-balance text-3xl font-extrabold tracking-tight text-on-surface sm:text-4xl">
          {t('landing.features.titlePart1')}
          <br />
          <span className="gradient-text">{t('landing.features.titlePart2')}</span>
        </h2>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {featureCards.map(({ icon: Icon, titleKey, descKey }) => (
          <div key={titleKey} className="glass-card rounded-2xl p-8 hover-lift">
            <span className="flex size-11 items-center justify-center rounded-xl bg-primary-soft text-primary">
              <Icon className="size-5" aria-hidden="true" />
            </span>
            <h3 className="mt-4 text-xl font-extrabold text-on-surface">{t(titleKey)}</h3>
            <p className="mt-2 text-sm leading-relaxed text-on-surface-variant">{t(descKey)}</p>
          </div>
        ))}
      </div>
    </section>
  )
}
