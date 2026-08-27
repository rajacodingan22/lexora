'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Navbar } from '@/components/layout/navbar'
import { Footer } from '@/components/layout/footer'
import { useI18n } from '@/lib/i18n/client'
import { createClient } from '@/lib/supabase-client'
import { Badge } from '@/components/ui/badge'
import { Flag } from '@/components/ui/flag'
import {
  Loader2, GraduationCap, Users, CalendarDays, ArrowRight,
  Award,
} from 'lucide-react'

const LOCALE_MAP: Record<string, string> = { en: 'en-US', id: 'id-ID', zh: 'zh-CN' }

interface AlumniBatch {
  id: string
  name: string
  start_date: string
  end_date: string
  capacity: number
  current_students: number
  course: {
    id: string
    title: { id: string; en: string }
    language?: { code: string; flag_emoji: string } | null
    level?: { code: string } | null
  } | null
  graduates?: { user_id: string }[]
}

function getTitle(t: { id?: string; en?: string } | string | null | undefined): string {
  if (!t) return ''
  if (typeof t === 'string') return t
  return t.id || t.en || ''
}

function normalizeBatch(raw: any): AlumniBatch {
  const course = Array.isArray(raw.course) ? raw.course[0] : raw.course
  return {
    id: raw.id,
    name: raw.name,
    start_date: raw.start_date,
    end_date: raw.end_date,
    capacity: raw.capacity,
    current_students: raw.current_students,
    course: course
      ? {
          id: course.id,
          title: course.title,
          language: Array.isArray(course.language) ? course.language[0] : course.language,
          level: Array.isArray(course.level) ? course.level[0] : course.level,
        }
      : null,
    graduates: raw.graduates,
  }
}

export default function AlumniPage() {
  const { t, lang } = useI18n()
  const supabase = createClient()
  const locale = LOCALE_MAP[lang] || 'en-US'
  const [batches, setBatches] = useState<AlumniBatch[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    async function fetchAlumni() {
      const { data } = await supabase
        .from('batches')
        .select(`
          id, name, start_date, end_date, capacity, current_students,
          course:courses(
            id, title,
            language:languages(code, flag_emoji),
            level:level_id(code)
          )
        `)
        .eq('status', 'completed')
        .order('end_date', { ascending: false })
        .limit(100)
      if (!cancelled) {
        setBatches((data as unknown as AlumniBatch[] || []).map(normalizeBatch))
        setLoading(false)
      }
    }
    fetchAlumni().catch(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [supabase])

  function formatDate(d: string | null | undefined): string {
    if (!d) return '—'
    return new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(d))
  }

  return (
    <div className="flex min-h-dvh flex-col bg-background">
      <Navbar />
      <main className="flex-1">
        <section className="relative overflow-hidden">
          <div className="absolute inset-0 -z-10 bg-gradient-to-b from-indigo-500/10 via-transparent to-transparent" />
          <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8 lg:py-20">
            <div className="mx-auto max-w-2xl text-center">
              <span className="inline-flex items-center gap-2 rounded-full border border-indigo-500/30 bg-indigo-500/10 px-3 py-1 text-xs font-bold uppercase tracking-widest text-indigo-400">
                <GraduationCap className="size-3" /> {t('public.alumni.badge')}
              </span>
              <h1 className="mt-4 text-balance text-3xl font-extrabold tracking-tight text-on-surface sm:text-4xl">
                {t('public.alumni.title')}
              </h1>
              <p className="mt-4 text-on-surface-variant">
                {t('public.alumni.subtitle')}
              </p>
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-7xl px-4 pb-20 sm:px-6 lg:px-8">
          {loading ? (
            <div className="flex items-center justify-center py-20 text-muted">
              <Loader2 className="mr-2 h-5 w-5 animate-spin" /> {t('public.alumni.loading')}
            </div>
          ) : batches.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <Award className="h-14 w-14 text-muted mb-4" />
              <p className="text-on-surface-variant">{t('public.alumni.empty')}</p>
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {batches.map((b) => {
                const title = getTitle(b.course?.title)
                const gradCount = b.graduates?.length ?? 0
                return (
                  <Link
                    key={b.id}
                    href={`/alumni/${b.id}`}
                    className="group rounded-2xl border border-border bg-surface-container-lowest p-5 transition-all duration-300 hover:border-indigo-500/40 hover:shadow-lg hover:shadow-indigo-500/5"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <h3 className="font-semibold text-on-surface group-hover:text-indigo-400 transition-colors">
                          {b.name}
                        </h3>
                        <p className="mt-0.5 line-clamp-1 text-sm text-on-surface-variant">{title}</p>
                      </div>
                      {b.course?.language?.flag_emoji && (
                        <Flag emoji={b.course.language.flag_emoji} alt={b.course.language.code} />
                      )}
                    </div>

                    <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-on-surface-variant">
                      <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface-container-lowest px-2 py-0.5">
                        <CalendarDays className="size-3.5 text-indigo-400" />
                        {formatDate(b.end_date)}
                      </span>
                      <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface-container-lowest px-2 py-0.5">
                        <Users className="size-3.5 text-emerald-400" />
                        {t('public.alumni.graduateCount', { count: gradCount || b.current_students })}
                      </span>
                      {b.course?.level?.code && (
                        <Badge variant="outline" className="text-[10px]">{b.course.level.code}</Badge>
                      )}
                    </div>

                    <div className="mt-4 flex items-center gap-1 text-sm font-medium text-indigo-400">
                      {t('public.alumni.viewBatch')}
                      <ArrowRight className="size-4 transition-transform group-hover:translate-x-1" />
                    </div>
                  </Link>
                )
              })}
            </div>
          )}
        </section>
      </main>
      <Footer />
    </div>
  )
}
