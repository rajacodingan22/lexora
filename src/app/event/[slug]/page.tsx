'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { Navbar } from '@/components/layout/navbar'
import { Footer } from '@/components/layout/footer'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ArrowLeft, Calendar, Clock, MapPin, ExternalLink, Loader2 } from 'lucide-react'
import { createClient } from '@/lib/supabase-client'
import { useI18n } from '@/lib/i18n/client'

interface EventDetail {
  slug: string
  title: string
  date: string
  time: string
  location: string
  type: string
  description: string
  content: string
  registration_link: string
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

export default function EventDetailPage() {
  const supabase = createClient()
  const { t, lang } = useI18n()
  const params = useParams()
  const slug = params.slug as string
  const [mounted, setMounted] = useState(false)
  const [event, setEvent] = useState<EventDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)

  useEffect(() => { setMounted(true) }, [])

  useEffect(() => {
    async function fetchEvent() {
      setLoading(true)
      try {
        const { data, error: fetchError } = await supabase
          .from('events')
          .select('*')
          .eq('slug', slug)
          .eq('status', 'published')
          .single()

        if (fetchError) {
          if (fetchError.code === 'PGRST116') {
            setNotFound(true)
          } else {
            throw fetchError
          }
        } else if (data) {
          setEvent({
            slug: data.slug,
            title: data.title,
            date: formatDate(data.event_date, lang),
            time: data.event_time || '',
            location: data.location || '',
            type: data.event_type || 'Event',
            description: data.description || '',
            content: data.content || '',
            registration_link: data.registration_link || '',
          })
        } else {
          setNotFound(true)
        }
      } catch (err) {
        console.error('Failed to fetch event', err)
        setNotFound(true)
      } finally {
        setLoading(false)
      }
    }
    if (mounted) {
      fetchEvent()
    }
  }, [slug, supabase, mounted, lang])

  if (!mounted || loading) {
    return (
      <>
        <Navbar />
        <main className="flex min-h-[calc(100vh-4rem)] items-center justify-center px-4">
          <Loader2 className="h-8 w-8 animate-spin text-indigo-400" />
        </main>
        <Footer />
      </>
    )
  }

  if (notFound || !event) {
    return (
      <>
        <Navbar />
        <main className="flex min-h-[calc(100vh-4rem)] items-center justify-center px-4 py-12">
          <div className="text-center">
            <h1 className="text-2xl font-bold text-on-surface">{t('public.eventDetail.notFoundTitle')}</h1>
            <p className="mt-2 text-on-surface-variant">{t('public.eventDetail.notFoundDesc')}</p>
            <Link href="/event"><Button variant="outline" className="mt-6">{t('public.eventDetail.backToEvent')}</Button></Link>
          </div>
        </main>
        <Footer />
      </>
    )
  }

  return (
    <>
      <Navbar />
      <main className="min-h-screen">
        <section className="py-16">
          <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
            <Link
              href="/event"
              className="mb-8 inline-flex items-center gap-1 text-sm text-indigo-400 hover:text-indigo-300 transition-colors"
            >
              <ArrowLeft className="h-4 w-4" /> {t('public.eventDetail.backToEvent')}
            </Link>

            <div className="mb-6 flex flex-wrap items-center gap-3">
              <Badge variant="default">{event.type}</Badge>
              {event.date && (
                <span className="flex items-center gap-1 text-sm text-muted">
                  <Calendar className="h-4 w-4" />
                  {event.date}
                </span>
              )}
            </div>

            <h1 className="text-3xl font-bold text-on-surface leading-tight mb-6">
              {event.title}
            </h1>

            <div className="mb-8 flex flex-wrap gap-4">
              {event.time && (
                <div className="flex items-center gap-2 rounded-lg border border-border bg-surface px-4 py-2 text-sm text-on-surface-variant">
                  <Clock className="h-4 w-4 text-indigo-400" />
                  {event.time}
                </div>
              )}
              {event.location && (
                <div className="flex items-center gap-2 rounded-lg border border-border bg-surface px-4 py-2 text-sm text-on-surface-variant">
                  <MapPin className="h-4 w-4 text-indigo-400" />
                  {event.location}
                </div>
              )}
            </div>

            {event.description && (
              <p className="mb-6 text-lg text-on-surface-variant">
                {event.description}
              </p>
            )}

            {event.content && (
              <div className="prose prose-invert max-w-none">
                <div className="rounded-xl border border-border bg-surface p-6 sm:p-8">
                  {event.content.split('\n\n').map((paragraph, i) => (
                    <p key={i} className="mb-4 last:mb-0 text-on-surface leading-relaxed whitespace-pre-line">
                      {paragraph}
                    </p>
                  ))}
                </div>
              </div>
            )}

            {event.registration_link && (
              <div className="mt-10 text-center">
                <a
                  href={event.registration_link}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <Button>
                    <ExternalLink className="h-4 w-4" /> {t('public.eventDetail.registerNow')}
                  </Button>
                </a>
              </div>
            )}

            <div className="mt-6 text-center">
              <Link href="/event">
                <Button variant="outline">
                  <ArrowLeft className="h-4 w-4" /> {t('public.eventDetail.moreEvents')}
                </Button>
              </Link>
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </>
  )
}
