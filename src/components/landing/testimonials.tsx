'use client'

import { Star } from 'lucide-react'
import type { Testimonial } from '@/types'
import { useI18n } from '@/lib/i18n/client'

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

interface TestimonialsSectionProps {
  testimonials: Testimonial[]
}

export function TestimonialsSection({ testimonials }: TestimonialsSectionProps) {
  const { t: tr, lang } = useI18n()

  if (!testimonials || testimonials.length === 0) {
    return null
  }

  return (
    <section id="testimoni" className="mx-auto max-w-7xl px-4 pb-20 sm:px-6 lg:px-8 lg:pb-24" aria-label={tr('landing.testimonials.ariaLabel')}>
      <div className="mb-12 text-center">
        <span className="inline-flex items-center gap-1.5 rounded-full border border-warning/30 bg-warning-soft px-3 py-1 text-xs font-bold uppercase tracking-widest text-warning">
          <Star className="size-3 fill-current" aria-hidden="true" /> {tr('landing.testimonials.badge')}
        </span>
        <h2 className="mt-4 text-balance text-3xl font-extrabold tracking-tight text-on-surface sm:text-4xl">
          {tr('landing.testimonials.titlePart1')} <span className="gradient-text">{tr('landing.testimonials.titleHighlight')}</span>{tr('landing.testimonials.titleSuffix')}
        </h2>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        {testimonials.map((t) => {
          /* Support both CMS format and hardcoded fallback format */
          const name = (t as any).student_name ?? (t as any).name ?? t.name ?? ''
          const raw = (t as any).content ?? (t as any).text ?? ''
          const text = typeof raw === 'object' ? (lang === 'en' ? (raw.en || raw.id) : (raw.id || raw.en)) : raw
          const role = (t as any).role ?? t.role ?? ''
          const photo = (t as any).student_photo ?? t.avatar_url ?? ''
          const initials = (t as any).initials ?? name.split(' ').map((n: string) => n[0]).join('').toUpperCase().slice(0, 2)
          const rating = Math.min(Math.max(Number(t.rating) || 5, 1), 5)

          return (
            <article key={name} className="glass-card flex flex-col rounded-2xl p-6">
              <div className="mb-3 flex gap-0.5 text-warning" aria-label={tr('landing.testimonials.ratingAria', { rating })}>
                {Array.from({ length: 5 }).map((_, i) => (
                  <Star key={i} className={`size-4 ${i < rating ? 'fill-current' : ''}`} aria-hidden="true" />
                ))}
              </div>
              <p className="flex-1 text-base leading-relaxed text-on-surface">
                &ldquo;{text}&rdquo;
              </p>
              <div className="mt-6 flex items-center gap-3">
                {photo ? (
                  <img
                    src={photo}
                    alt={name}
                    className="size-10 rounded-full object-cover"
                    loading="lazy"
                  />
                ) : (
                  <div
                    className="flex size-10 items-center justify-center rounded-full bg-gradient-to-br from-accent to-primary text-sm font-bold text-primary-foreground"
                    aria-hidden="true"
                  >
                    {initials}
                  </div>
                )}
                <div>
                  <div className="text-sm font-bold text-on-surface">{name}</div>
                  {role && <div className="text-xs text-on-surface-variant">{role}</div>}
                </div>
              </div>
            </article>
          )
        })}
      </div>
    </section>
  )
}
