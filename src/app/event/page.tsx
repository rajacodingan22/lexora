'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { Navbar } from '@/components/layout/navbar'
import { Footer } from '@/components/layout/footer'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Calendar, MapPin, Clock, ArrowRight, ChevronRight, Loader2 } from 'lucide-react'
import { createClient } from '@/lib/supabase-client'
import { useI18n } from '@/lib/i18n/client'

interface EventItem {
  id: string
  title: string
  slug: string
  description: string | null
  content: string | null
  image_url: string | null
  event_date: string | null
  event_time: string | null
  location: string | null
  event_type: string | null
  registration_link: string | null
  status: string
  created_at: string
}

const LOCALE_MAP: Record<string, string> = { en: 'en-US', id: 'id-ID', zh: 'zh-CN' }

function formatDate(dateStr: string | null, locale: string): string {
  if (!dateStr) return ''
  try {
    return new Intl.DateTimeFormat(LOCALE_MAP[locale] || 'en-US', { dateStyle: 'medium' }).format(new Date(dateStr))
  } catch {
    return dateStr
  }
}

function formatDateLocale(dateStr: string, locale: string): string {
  try {
    return new Intl.DateTimeFormat(LOCALE_MAP[locale] || 'en-US', { dateStyle: 'medium' }).format(new Date(dateStr))
  } catch {
    return dateStr
  }
}

export default function EventPage() {
  const supabase = createClient()
  const { t, lang } = useI18n()
  const [events, setEvents] = useState<EventItem[]>([])
  const [newsItems, setNewsItems] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<'upcoming' | 'all'>('upcoming')

  useEffect(() => {
    async function fetchEvents() {
      try {
        let query = supabase
          .from('events')
          .select('*')
          .eq('status', 'published')
          .order('event_date', { ascending: true })

        if (filter === 'upcoming') {
          query = query.gte('event_date', new Date().toISOString().split('T')[0])
        }

        const { data, error: fetchError } = await query

        if (fetchError) throw fetchError

        setEvents((data as EventItem[]) || [])
      } catch (err) {
        console.error('Failed to fetch events from DB', err)
      } finally {
        setLoading(false)
      }
    }
    fetchEvents()
  }, [supabase, filter])

  useEffect(() => {
    async function fetchNews() {
      try {
        const { data } = await supabase
          .from('news')
          .select('*')
          .eq('status', 'published')
          .order('created_at', { ascending: false })
        if (data && data.length > 0) {
          setNewsItems(data.map((item: any) => ({
            slug: item.slug,
            title: item.title,
            image_url: item.image_url,
            date: item.publish_date || item.created_at,
            excerpt: item.excerpt || item.content?.substring(0, 150) || '',
            category: item.category || t('public.event.categoryFallback'),
          })))
        } else {
          setNewsItems([])
        }
      } catch {
        setNewsItems([])
      }
    }
    fetchNews()
  }, [supabase, t])

  const displayEvents = events.map((e) => ({
    slug: e.slug,
    title: e.title,
    date: formatDate(e.event_date, lang),
    time: e.event_time || '',
    location: e.location || '',
    type: e.event_type || 'Event',
    description: e.description || '',
  }))

  return (
    <>
      <Navbar />
      <main className="min-h-screen">
        <section className="border-b border-border py-16">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="mb-10 text-center">
              <h1 className="text-4xl font-bold text-on-surface">{t('public.event.titleA')} <span className="gradient-text">{t('public.event.titleB')}</span></h1>
              <p className="mt-2 text-lg text-on-surface-variant">
                {t('public.event.subtitle')}
              </p>
            </div>

            <div className="mb-8 flex items-center justify-center gap-3">
              <Button
                variant={filter === 'upcoming' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setFilter('upcoming')}
              >
                {t('public.event.upcoming')}
              </Button>
              <Button
                variant={filter === 'all' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setFilter('all')}
              >
                {t('public.event.allEvents')}
              </Button>
            </div>

            {loading ? (
              <div className="flex items-center justify-center py-20">
                <Loader2 className="h-8 w-8 animate-spin text-indigo-400" />
              </div>
            ) : displayEvents.length === 0 ? (
              <div className="py-20 text-center">
                <p className="text-on-surface-variant">{t('public.event.empty')}</p>
              </div>
            ) : (
              <div className="mx-auto grid max-w-5xl gap-6 md:grid-cols-2 lg:grid-cols-3">
                {displayEvents.map((item) => (
                  <Link key={item.slug} href={`/event/${item.slug}`}>
                    <Card className="flex h-full flex-col cursor-pointer transition-all hover:border-indigo-500/30 hover:shadow-md">
                      <CardContent className="flex flex-1 flex-col p-5">
                        <div className="mb-3 flex items-center gap-2">
                          <Badge variant="default">{item.type}</Badge>
                          {item.date && (
                            <span className="flex items-center gap-1 text-xs text-muted">
                              <Calendar className="h-3 w-3" />
                              {item.date}
                            </span>
                          )}
                        </div>
                        <h3 className="font-semibold text-on-surface transition-colors">{item.title}</h3>
                        <p className="mt-2 flex-1 text-sm text-on-surface-variant line-clamp-3">{item.description}</p>
                        <div className="mt-4 flex flex-wrap items-center gap-3 text-xs text-muted">
                          {item.time && (
                            <span className="flex items-center gap-1">
                              <Clock className="h-3 w-3" />
                              {item.time}
                            </span>
                          )}
                          {item.location && (
                            <span className="flex items-center gap-1">
                              <MapPin className="h-3 w-3" />
                              {item.location}
                            </span>
                          )}
                        </div>
                        <span className="mt-4 inline-flex items-center gap-1 text-sm text-indigo-400 hover:text-indigo-300">
                          {t('public.event.viewDetails')} <ArrowRight className="h-4 w-4" />
                        </span>
                      </CardContent>
                    </Card>
                  </Link>
                ))}
              </div>
            )}

            {newsItems.length > 0 && (
              <div className="mt-16">
                <div className="mb-8 text-center">
                  <h2 className="text-3xl font-extrabold tracking-tight text-on-surface sm:text-4xl">
                    {t('public.event.newsTitleA')} <span className="gradient-text">{t('public.event.newsTitleB')}</span>
                  </h2>
                </div>
                <div className="mx-auto grid max-w-5xl gap-6 md:grid-cols-2 lg:grid-cols-3">
                  {newsItems.map((item) => (
                    <Link key={item.slug} href={`/berita/${item.slug}`}>
                      <Card className="group flex h-full flex-col cursor-pointer overflow-hidden transition-all hover:border-indigo-500/30 hover:shadow-md">
                        {item.image_url && (
                          <div className="aspect-video overflow-hidden">
                            <img src={item.image_url} alt={item.title} className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105" />
                          </div>
                        )}
                        <CardContent className="flex flex-1 flex-col p-5">
                          <div className="mb-3 flex items-center justify-between">
                            <Badge variant="default">{item.category}</Badge>
                            <span className="flex items-center gap-1 text-xs text-muted">
                              <Calendar className="h-3 w-3" />
                              {item.date ? formatDateLocale(item.date, lang) : ''}
                            </span>
                          </div>
                          <h3 className="font-semibold text-on-surface transition-colors group-hover:text-indigo-400">{item.title}</h3>
                          <p className="mt-2 flex-1 text-sm text-on-surface-variant line-clamp-3">{item.excerpt}</p>
                          <span className="mt-4 inline-flex items-center gap-1 text-sm text-indigo-400 hover:text-indigo-300">
                            {t('public.event.readMore')} <ChevronRight className="h-4 w-4" />
                          </span>
                        </CardContent>
                      </Card>
                    </Link>
                  ))}
                </div>
              </div>
            )}
          </div>
        </section>
      </main>
      <Footer />
    </>
  )
}
