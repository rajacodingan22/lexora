'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { Navbar } from '@/components/layout/navbar'
import { Footer } from '@/components/layout/footer'
import { useI18n } from '@/lib/i18n/client'
import { createClient } from '@/lib/supabase-client'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Flag } from '@/components/ui/flag'
import {
  Loader2, GraduationCap, CalendarDays, Users, ArrowLeft,
  FileText, X,
} from 'lucide-react'
import { BadgeHexagon } from '@/components/shared/badge-hexagon'

const LOCALE_MAP: Record<string, string> = { en: 'en-US', id: 'id-ID', zh: 'zh-CN' }

interface AlumniStudent {
  user_id: string
  status: string
  user?: {
    id: string
    display_name: string
    photo_url: string | null
    email: string | null
  } | null
}

interface AlumniBatchDetail {
  id: string
  name: string
  code: string | null
  start_date: string
  end_date: string
  capacity: number
  current_students: number
  course: {
    id: string
    title: { id: string; en: string }
    description?: { id: string; en: string } | null
    language?: { code: string; flag_emoji: string } | null
    level?: { code: string } | null
  } | null
}

interface BadgeRow {
  id: string
  user_id: string
  badge_type: string
  title: string
  description: string | null
  earned_at: string
  course_id: string | null
  batch_id: string | null
}

interface CertRow {
  id: string
  user_id: string
  certificate_code: string | null
  certificate_url: string | null
  pdf_url: string | null
  issue_date: string
  source: string
}

function getTitle(t: { id?: string; en?: string } | string | null | undefined): string {
  if (!t) return ''
  if (typeof t === 'string') return t
  return t.id || t.en || ''
}

function isImageUrl(url: string | null | undefined): boolean {
  if (!url) return false
  return /\.(jpe?g|png|gif|webp|svg|avif|bmp)(\?.*)?$/i.test(url)
}

export default function AlumniBatchPage() {
  const params = useParams<{ id: string }>()
  const { t, lang } = useI18n()
  const supabase = createClient()
  const locale = LOCALE_MAP[lang] || 'en-US'

  const [batch, setBatch] = useState<AlumniBatchDetail | null>(null)
  const [students, setStudents] = useState<AlumniStudent[]>([])
  const [badgesMap, setBadgesMap] = useState<Record<string, BadgeRow[]>>({})
  const [certsMap, setCertsMap] = useState<Record<string, CertRow[]>>({})
  const [loading, setLoading] = useState(true)
  const [preview, setPreview] = useState<{ url: string; isImage: boolean } | null>(null)

  useEffect(() => {
    let cancelled = false
    async function fetchDetail() {
      const { data: batchData } = await supabase
        .from('batches')
        .select(`
          id, name, code, start_date, end_date, capacity, current_students,
          course:courses(
            id, title, description,
            language:languages(code, flag_emoji),
            level:level_id(code)
          )
        `)
        .eq('id', params.id)
        .single()

      if (cancelled) return
      if (!batchData) { setLoading(false); return }

      const course = Array.isArray(batchData.course) ? batchData.course[0] : batchData.course
      setBatch({
        ...batchData,
        course: course ? {
          id: course.id,
          title: course.title,
          description: course.description,
          language: Array.isArray(course.language) ? course.language[0] : course.language,
          level: Array.isArray(course.level) ? course.level[0] : course.level,
        } : null,
      } as AlumniBatchDetail)

      const { data: enrollData } = await supabase
        .from('enrollments')
        .select('user_id, status, user:users(id, display_name, photo_url, email)')
        .eq('batch_id', params.id)
        .eq('status', 'active')
        .order('enrolled_at', { ascending: true })

      const list = ((enrollData as unknown as AlumniStudent[]) || []).map((e) => ({
        ...e,
        user: Array.isArray(e.user) ? e.user[0] : e.user,
      }))
      setStudents(list)

      const userIds = list.map((e) => e.user_id)

      if (userIds.length > 0) {
        const [badgeRes, certRes] = await Promise.all([
          supabase
            .from('student_badges')
            .select('*')
            .in('user_id', userIds)
            .order('earned_at', { ascending: true }),
          supabase
            .from('certificates')
            .select('id, user_id, certificate_code, certificate_url, pdf_url, issue_date, source')
            .eq('batch_id', params.id),
        ])

        const bMap: Record<string, BadgeRow[]> = {}
        for (const b of (badgeRes.data as BadgeRow[] || [])) {
          if (!bMap[b.user_id]) bMap[b.user_id] = []
          bMap[b.user_id].push(b)
        }
        setBadgesMap(bMap)

        const cMap: Record<string, CertRow[]> = {}
        for (const c of (certRes.data as CertRow[] || [])) {
          if (!cMap[c.user_id]) cMap[c.user_id] = []
          cMap[c.user_id].push(c)
        }
        setCertsMap(cMap)
      }

      if (!cancelled) setLoading(false)
    }
    fetchDetail().catch(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [params.id, supabase])

  function formatDate(d: string | null | undefined): string {
    if (!d) return '—'
    return new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(d))
  }

  const badgeOrder = ['graduation', 'top_scorer', 'perfect_attendance', 'milestone']

  if (loading) {
    return (
      <div className="flex min-h-dvh flex-col bg-background">
        <Navbar />
        <main className="flex flex-1 items-center justify-center text-muted">
          <Loader2 className="mr-2 h-5 w-5 animate-spin" /> {t('public.alumni.loading')}
        </main>
        <Footer />
      </div>
    )
  }

  if (!batch) {
    return (
      <div className="flex min-h-dvh flex-col bg-background">
        <Navbar />
        <main className="flex flex-1 flex-col items-center justify-center gap-4 text-center">
          <p className="text-on-surface-variant">{t('public.alumni.notFound')}</p>
          <Link href="/alumni"><Button variant="outline"><ArrowLeft className="mr-1 h-4 w-4" /> {t('public.alumni.backToList')}</Button></Link>
        </main>
        <Footer />
      </div>
    )
  }

  return (
    <div className="flex min-h-dvh flex-col bg-background">
      <Navbar />
      <main className="flex-1">
        <section className="relative overflow-hidden border-b border-border">
          <div className="absolute inset-0 -z-10 bg-gradient-to-b from-indigo-500/10 via-transparent to-transparent" />
          <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
            <Link href="/alumni" className="inline-flex items-center gap-1.5 text-sm font-medium text-on-surface-variant hover:text-indigo-400 transition-colors">
              <ArrowLeft className="size-4" /> {t('public.alumni.backToList')}
            </Link>
            <div className="mt-4 flex flex-wrap items-center justify-between gap-4">
              <div>
                <div className="flex items-center gap-2">
                  {batch.course?.language?.flag_emoji && (
                    <Flag emoji={batch.course.language.flag_emoji} alt={batch.course.language.code} />
                  )}
                  <h1 className="text-2xl font-extrabold tracking-tight text-on-surface sm:text-3xl">
                    {batch.name}
                  </h1>
                </div>
                <p className="mt-1 text-on-surface-variant">
                  {getTitle(batch.course?.title)}
                  {batch.course?.level?.code && <> · <Badge variant="outline" className="text-[10px] align-middle">{batch.course.level.code}</Badge></>}
                </p>
              </div>
              <div className="flex flex-wrap gap-2 text-xs text-on-surface-variant">
                <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface-container-lowest px-3 py-1.5">
                  <CalendarDays className="size-3.5 text-indigo-400" />
                  {formatDate(batch.start_date)} — {formatDate(batch.end_date)}
                </span>
                <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface-container-lowest px-3 py-1.5">
                  <Users className="size-3.5 text-emerald-400" />
                  {t('public.alumni.graduateCount', { count: students.length })}
                </span>
              </div>
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
          <h2 className="mb-6 text-lg font-bold text-on-surface">{t('public.alumni.studentsTitle')}</h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {students.map((s) => {
              const badges = badgesMap[s.user_id] || []
              const certs = certsMap[s.user_id] || []
              return (
                <div key={s.user_id} className="rounded-2xl border border-border bg-surface-container-lowest p-5 transition-all duration-300 hover:border-indigo-500/30 hover:shadow-lg hover:shadow-indigo-500/5">
                  <div className="flex items-center gap-3">
                    <div className="relative">
                      {s.user?.photo_url ? (
                        <img src={s.user.photo_url} alt="" className="size-12 rounded-full object-cover ring-2 ring-indigo-500/30" />
                      ) : (
                        <div className="flex size-12 items-center justify-center rounded-full bg-gradient-to-br from-indigo-500/20 to-purple-500/20 ring-2 ring-indigo-500/30">
                          <GraduationCap className="size-5 text-indigo-400" />
                        </div>
                      )}
                    </div>
                    <div className="min-w-0">
                      <p className="font-semibold text-on-surface truncate">{s.user?.display_name || t('public.alumni.anonymous')}</p>
                      <p className="text-xs text-muted truncate">{s.user?.email || ''}</p>
                    </div>
                  </div>

                  <div className="mt-4 flex flex-wrap items-center gap-2">
                    {badges.length === 0 ? (
                      <span className="text-xs text-muted">{t('public.alumni.noBadges')}</span>
                    ) : (
                      [...badges].sort((a, b) => badgeOrder.indexOf(a.badge_type) - badgeOrder.indexOf(b.badge_type)).map((b) => (
                        <BadgeHexagon key={b.id} type={b.badge_type} title={b.title} photoUrl={s.user?.photo_url} size={52} />
                      ))
                    )}
                  </div>

                  <div className="mt-4 space-y-2 border-t border-border/60 pt-3">
                    {certs.length === 0 ? (
                      <p className="text-xs text-muted">{t('public.alumni.noCerts')}</p>
                    ) : certs.map((c) => {
                      const certImage = isImageUrl(c.pdf_url) ? c.pdf_url : (isImageUrl(c.certificate_url) ? c.certificate_url : null)
                      const certLink = c.pdf_url || c.certificate_url
                      return (
                        <div key={c.id} className="overflow-hidden rounded-xl border border-border/60 bg-surface-container-low">
                          {certLink ? (
                            <button
                              type="button"
                              onClick={() => setPreview({ url: certLink, isImage: !!certImage })}
                              className="group/cert block w-full text-left"
                            >
                              {certImage ? (
                                <img src={certImage} alt={t('public.alumni.certLabel')} loading="lazy" className="h-28 w-full object-cover object-top transition-opacity group-hover/cert:opacity-90" />
                              ) : (
                                <div className="flex h-28 items-center justify-center bg-gradient-to-br from-indigo-500/10 to-purple-500/10">
                                  <FileText className="size-8 text-indigo-400" />
                                </div>
                              )}
                              <div className="flex items-center justify-between gap-2 px-3 py-2">
                                <span className="flex items-center gap-1.5 text-xs text-on-surface-variant min-w-0">
                                  <FileText className="size-3.5 shrink-0 text-indigo-400" />
                                  <span className="truncate">{t('public.alumni.certLabel')}{c.certificate_code ? ` · ${c.certificate_code}` : ''}</span>
                                </span>
                                <span className="shrink-0 text-xs font-medium text-indigo-400 group-hover/cert:underline">
                                  {t('public.alumni.viewCert')}
                                </span>
                              </div>
                            </button>
                          ) : (
                            <div className="flex items-center gap-1.5 px-3 py-2 text-xs text-on-surface-variant">
                              <FileText className="size-3.5 shrink-0 text-indigo-400" />
                              <span className="truncate">{t('public.alumni.certLabel')}{c.certificate_code ? ` · ${c.certificate_code}` : ''}</span>
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </div>
              )
            })}
            {students.length === 0 && (
              <div className="col-span-full flex flex-col items-center justify-center py-16 text-center">
                <Users className="mb-3 h-12 w-12 text-muted" />
                <p className="text-on-surface-variant">{t('public.alumni.noStudents')}</p>
              </div>
            )}
          </div>
        </section>
      </main>
      <Footer />

      {preview && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
          onClick={() => setPreview(null)}
        >
          <div
            className="relative w-full max-w-3xl overflow-hidden rounded-2xl bg-surface shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-border px-4 py-3">
              <p className="truncate text-sm font-medium text-on-surface">
                {t('public.alumni.certLabel')}
              </p>
              <Button variant="ghost" size="sm" onClick={() => setPreview(null)}>
                <X className="size-4" />
              </Button>
            </div>
            <div className="flex max-h-[75vh] items-center justify-center overflow-auto bg-black/40 p-4">
              {preview.isImage ? (
                <img src={preview.url} alt={t('public.alumni.certLabel')} className="max-h-full w-auto rounded-lg object-contain" />
              ) : (
                <iframe src={preview.url} title={t('public.alumni.certLabel')} className="h-[70vh] w-full rounded-lg bg-white" />
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
