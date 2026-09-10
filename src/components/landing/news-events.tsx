'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase-client'
import { useI18n } from '@/lib/i18n/client'
import { buttonVariants } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Newspaper, CalendarDays, MapPin, ArrowRight, ArrowUpRight } from 'lucide-react'

const LOCALE_MAP: Record<string, string> = { en: 'en-US', id: 'id-ID', zh: 'zh-CN' }

function formatFeedDate(date: string | null, lang: string): string {
  if (!date) return ''
  return new Intl.DateTimeFormat(LOCALE_MAP[lang] || 'en-US', { dateStyle: 'medium' }).format(new Date(date))
}

interface NewsItem {
  id: string
  title: string
  slug: string
  excerpt: string | null
  category: string | null
  image_url: string | null
  thumbnail_url: string | null
  published_at: string | null
}

interface EventItem {
  id: string
  title: string
  slug: string
  description: string | null
  event_date: string | null
  event_time: string | null
  location: string | null
  event_type: string | null
  image_url: string | null
}

type FeedItem =
  | ({ kind: 'news' } & NewsItem)
  | ({ kind: 'event' } & EventItem)

function FeedCard({ item }: { item: FeedItem }) {
  const { t, lang } = useI18n()
  const isEvent = item.kind === 'event'
  const href = isEvent ? `/event/${item.slug}` : `/berita/${item.slug}`
  const image = isEvent
    ? (item as EventItem).image_url
    : ((item as NewsItem).image_url || (item as NewsItem).thumbnail_url) || null
  const title = item.title
  const date = isEvent ? (item as EventItem).event_date : (item as NewsItem).published_at
  const description = isEvent
    ? (item as EventItem).description
    : ((item as NewsItem).excerpt || '') || null

  return (
    <Link
      href={href}
      className="glass-card group flex h-full min-w-0 flex-col rounded-2xl p-5 transition-all duration-[var(--dur)] hover:-translate-y-1 hover:border-primary/30 hover:shadow-lg hover:shadow-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
    >
      {image && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={image}
          alt={title}
          className="mb-4 aspect-[16/9] w-full rounded-xl object-cover"
        />
      )}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        {isEvent ? (
          <Badge variant="default">
            {(item as EventItem).event_type || t('landing.newsEvents.eventFallback')}
          </Badge>
        ) : (
          <Badge variant="outline">{(item as NewsItem).category || t('landing.newsEvents.categoryFallback')}</Badge>
        )}
        {date && (
          <span className="flex items-center gap-1 text-xs text-muted">
            <CalendarDays className="size-3" aria-hidden="true" />
            {formatFeedDate(date, lang)}
          </span>
        )}
      </div>
      <h3 className="line-clamp-2 font-bold leading-snug text-on-surface transition-colors group-hover:text-primary">
        {title}
      </h3>
      {description && (
        <p className="mt-2 line-clamp-3 flex-1 text-sm leading-relaxed text-on-surface-variant">
          {description}
        </p>
      )}
      <div className="mt-4 flex items-center justify-between text-xs text-muted">
        {isEvent ? (
          <span className="inline-flex items-center gap-1">
            <MapPin className="size-3" aria-hidden="true" />
            {(item as EventItem).location || t('landing.newsEvents.locationFallback')}
          </span>
        ) : (
          <span />
        )}
        <span className="inline-flex items-center gap-1 font-semibold text-primary">
          {isEvent ? t('landing.newsEvents.viewDetail') : t('landing.newsEvents.readMore')}
          <ArrowUpRight className="size-3.5 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" aria-hidden="true" />
        </span>
      </div>
    </Link>
  )
}

export function NewsEventsSection() {
  const { t } = useI18n()
  const [items, setItems] = useState<FeedItem[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true
    const supabase = createClient()
    ;(async () => {
      try {
        const [eventsRes, newsRes] = await Promise.all([
          supabase
            .from('events')
            .select('id, title, slug, description, event_date, event_time, location, event_type, image_url')
            .eq('status', 'published')
            .order('event_date', { ascending: true })
            .limit(2),
          supabase
            .from('news')
            .select('id, title, slug, excerpt, category, image_url, thumbnail_url, published_at')
            .eq('status', 'published')
            .order('published_at', { ascending: false })
            .limit(4),
        ])
        if (!active) return

        const events = ((eventsRes.data as EventItem[]) || []).map((e) => ({ kind: 'event' as const, ...e }))
        const news = ((newsRes.data as NewsItem[]) || []).map((n) => ({ kind: 'news' as const, ...n }))

        // Selang-seling event & berita (zipper), maksimal 4 item.
        // Kalau salah satu kosong, sisanya diisi dari jenis lain.
        const merged: FeedItem[] = []
        const max = Math.max(events.length, news.length)
        for (let i = 0; i < max && merged.length < 4; i++) {
          if (events[i]) merged.push(events[i])
          if (merged.length < 4 && news[i]) merged.push(news[i])
        }
        setItems(merged)
      } catch {
        // DB tidak tersedia — biarkan kosong
      } finally {
        if (active) setLoading(false)
      }
    })()
    return () => {
      active = false
    }
  }, [])

  if (!loading && items.length === 0) return null

  return (
    <section
      id="berita-event"
      className="mx-auto max-w-7xl scroll-mt-24 px-4 py-12 sm:px-6 lg:px-8 lg:py-16"
      aria-label={t('landing.newsEvents.ariaLabel')}
    >
      <div className="mb-10 text-center">
        <span className="inline-flex items-center gap-2 rounded-full border border-border bg-surface-container-low px-3 py-1 text-xs font-bold uppercase tracking-widest text-on-surface-variant">
          <Newspaper className="size-3" aria-hidden="true" /> {t('landing.newsEvents.badge')}
        </span>
        <h2 className="mt-4 text-balance text-3xl font-extrabold tracking-tight text-on-surface sm:text-4xl">
          {t('landing.newsEvents.titlePart1')} <span className="gradient-text">{t('landing.newsEvents.titlePart2')}</span>
        </h2>
      </div>

      {loading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 sm:gap-6">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="animate-pulse rounded-2xl border border-border bg-surface p-5">
              <div className="h-5 w-24 rounded-full bg-surface-container-high" />
              <div className="mt-4 h-4 w-full rounded bg-surface-container-high" />
              <div className="mt-2 h-4 w-2/3 rounded bg-surface-container-high" />
              <div className="mt-4 space-y-2">
                <div className="h-3 w-full rounded bg-surface-container-high" />
                <div className="h-3 w-4/5 rounded bg-surface-container-high" />
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 sm:gap-6 lg:grid-cols-4">
          {items.map((item) => (
            <FeedCard key={`${item.kind}-${item.id}`} item={item} />
          ))}
        </div>
      )}

      <div className="mt-12 text-center">
        <Link href="/event" className={buttonVariants({ variant: 'gradient', size: 'lg' })}>
          {t('landing.newsEvents.viewAll')}
          <ArrowRight className="size-4" aria-hidden="true" />
        </Link>
      </div>
    </section>
  )
}
