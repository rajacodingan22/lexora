'use client'

import { Suspense, useEffect, useState, useCallback } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { Navbar } from '@/components/layout/navbar'
import { Footer } from '@/components/layout/footer'
import { Button } from '@/components/ui/button'
import { Flag } from '@/components/ui/flag'
import {
  Loader2, BookOpen, FileText, Users, Sparkles,
  CheckCircle2, Hourglass, ArrowRight, Wallet, GraduationCap,
} from 'lucide-react'
import { createClient } from '@/lib/supabase-client'
import { useAuth } from '@/lib/auth-context'
import { useI18n } from '@/lib/i18n/client'

interface TeacherBrief {
  id: string
  display_name: string
  photo_url: string | null
}

interface BatchBrief {
  id: string
  course_id: string
  name: string | null
  start_date: string
  capacity: number
  current_students: number
  status: string
}

interface LanguageBrief {
  code: string
  name: { id: string; en: string }
  flag_emoji: string
}

interface LevelBrief {
  code: string
  name: { id: string; en: string }
}

interface CourseRow {
  id: string
  title: { id: string; en: string } | null
  description: { id: string; en: string } | null
  image_url: string | null
  price: number | null
  meeting_count: number | null
  project_count: number | null
  is_try_class: boolean | null
  starts_at: string | null
  max_students: number | null
  mode: string | null
  language: LanguageBrief | null
  level: LevelBrief | null
  teacher_assignments: Array<{
    teacher: { user: TeacherBrief } | null
  } | null>
}

interface BatchRow {
  id: string
  course_id: string
  name: string | null
  start_date: string
  capacity: number
  current_students: number
  status: string
}

interface EnrollmentRow {
  course_id: string
  status: string
  batch: { name: string } | null
}

interface ClassCard {
  id: string
  title: { id: string; en: string }
  description: { id: string; en: string } | null
  image_url: string | null
  price: number
  meeting_count: number
  project_count: number
  is_try_class: boolean
  starts_at: string | null
  max_students: number | null
  mode: string | null
  language?: LanguageBrief | null
  level?: LevelBrief | null
  teachers: TeacherBrief[]
  batches: BatchBrief[]
}

type EnrollState =
  | { type: 'none' }
  | { type: 'active'; batchName?: string }
  | { type: 'pending' }
  | { type: 'waiting' }

function formatPrice(n: number): string {
  return 'Rp ' + new Intl.NumberFormat('id-ID').format(n)
}

function nextBatchLabel(batches: BatchBrief[], t: (key: string, vars?: Record<string, string | number>) => string): { label: string; full: boolean } {
  const future = batches
    .filter((b) => new Date(b.start_date).getTime() > Date.now() && b.current_students < b.capacity)
    .sort((a, b) => new Date(a.start_date).getTime() - new Date(b.start_date).getTime())
  if (future.length === 0) {
    return { label: t('public.project.waitingNextBatch'), full: true }
  }
  const b = future[0]
  const sisa = b.capacity - b.current_students
  const batchLabel = b.name ? (b.name.toLowerCase().includes('batch') ? b.name : `Batch ${b.name}`) : 'Batch'
  return { label: t('public.project.slotsLeft', { batch: batchLabel, slots: sisa }), full: false }
}

function ProjectPageContent() {
  const supabase = createClient()
  const router = useRouter()
  const searchParams = useSearchParams()
  const languageFilter = searchParams.get('lang')
  const { user, loading: authLoading } = useAuth()
  const { t } = useI18n()
  const [classes, setClasses] = useState<ClassCard[]>([])
  const [loading, setLoading] = useState(true)
  const [myState, setMyState] = useState<Record<string, EnrollState>>({})

  const fetchData = useCallback(async () => {
    try {
      let courseQuery = supabase
        .from('courses')
        .select(`
          id, title, description, image_url, price, meeting_count, project_count, is_try_class,
          starts_at, max_students, mode,
          language:languages(code, name, flag_emoji),
          level:level_id(code, name),
          teacher_assignments:course_teachers(
            teacher:teachers(
              user:users(id, display_name, photo_url)
            )
          )
        `)
        .eq('status', 'active')
        .eq('is_visible_marketplace', true)

      if (languageFilter) {
        courseQuery = courseQuery.eq('language_code', languageFilter)
      }

      const courseRes = await courseQuery
        .order('is_try_class', { ascending: false })
        .order('starts_at', { ascending: true })

      const courseRows = (courseRes.data || []) as unknown as CourseRow[]
      const courseIds = courseRows.map((c) => c.id)
      const batchRes = courseIds.length
        ? await supabase
            .from('batches')
            .select('id, course_id, name, start_date, capacity, current_students, status')
            .eq('status', 'active')
            .in('course_id', courseIds)
            .order('start_date', { ascending: true })
        : { data: [] as BatchRow[] }
      const batchRows = (batchRes.data || []) as BatchRow[]

      const cards: ClassCard[] = courseRows.map((c) => ({
        id: c.id,
        title: c.title || { id: t('public.project.fallbackTitle'), en: t('public.project.fallbackTitle') },
        description: c.description,
        image_url: c.image_url,
        price: Number(c.price) || 0,
        meeting_count: c.meeting_count ?? 0,
        project_count: c.project_count ?? 0,
        is_try_class: !!c.is_try_class,
        starts_at: c.starts_at,
        max_students: c.max_students,
        mode: c.mode,
        language: c.language,
        level: c.level,
        teachers: (c.teacher_assignments || [])
          .map((t) => t?.teacher?.user)
          .filter((u): u is TeacherBrief => !!u)
          .map((u) => ({ id: u.id, display_name: u.display_name || t('public.project.teacherFallback'), photo_url: u.photo_url })),
        batches: batchRows.filter((b) => b.course_id === c.id),
      }))
      setClasses(cards)

      if (user?.id) {
        const [enrRes, waitRes] = await Promise.all([
          supabase
            .from('enrollments')
            .select('course_id, status, batch:batches(name)')
            .eq('user_id', user.id)
            .in('status', ['active', 'pending']),
          supabase
            .from('waiting_list')
            .select('course_id, status')
            .eq('user_id', user.id)
            .eq('status', 'waiting'),
        ])
        const stateMap: Record<string, EnrollState> = {}
        for (const e of (enrRes.data || []) as unknown as EnrollmentRow[]) {
          stateMap[e.course_id] = e.status === 'active'
            ? { type: 'active', batchName: e.batch?.name }
            : { type: 'pending' }
        }
        for (const w of waitRes.data || []) {
          if (!stateMap[w.course_id]) stateMap[w.course_id] = { type: 'waiting' }
        }
        setMyState(stateMap)
      }
    } catch (err) {
      console.error('Failed to fetch classes', err)
    } finally {
      setLoading(false)
    }
  }, [supabase, user, t, languageFilter])

  useEffect(() => {
    const load = async () => {
      await fetchData()
    }
    void load()
  }, [fetchData])

  async function handleJoin(course: ClassCard) {
    if (!user) {
      router.push('/daftar?next=/project')
      return
    }
    // Beli/daftar kelas dilakukan di dalam dashboard, bukan di halaman publik
    router.push(`/student/kursus/${course.id}`)
  }

  async function handleClaimTrial(course: ClassCard) {
    if (!user) {
      router.push('/daftar?next=/project')
      return
    }
    router.push(`/student/kursus/${course.id}`)
  }

  function renderAction(course: ClassCard) {
    const state = myState[course.id]
    if (state?.type === 'active') {
      return (
        <Link href="/student/kursus">
          <Button variant="outline" className="w-full">
            <CheckCircle2 className="mr-2 h-4 w-4 text-emerald-500" /> {t('public.project.active')}
          </Button>
        </Link>
      )
    }
    if (state?.type === 'pending') {
      return (
        <Link href="/student/pembayaran">
          <Button variant="outline" className="w-full">
            <Wallet className="mr-2 h-4 w-4 text-amber-500" /> {t('public.project.payNow')}
          </Button>
        </Link>
      )
    }
    if (state?.type === 'waiting') {
      return (
        <Button variant="outline" className="w-full" disabled>
          <Hourglass className="mr-2 h-4 w-4 text-orange-500" /> {t('public.project.waitingBatch')}
        </Button>
      )
    }
    if (course.is_try_class) {
      return (
        <Button className="w-full" onClick={() => handleClaimTrial(course)}>
          <Sparkles className="mr-2 h-4 w-4" /> {t('public.project.claimFree')}
        </Button>
      )
    }
    return (
      <Button className="w-full" onClick={() => handleJoin(course)}>
        {user ? t('public.project.enrollPay') : t('public.project.joinClass')} <ArrowRight className="ml-2 h-4 w-4" />
      </Button>
    )
  }

  const priceLabel = (c: ClassCard) =>
    c.is_try_class ? (
      <span className="text-2xl font-bold text-emerald-400">{t('public.project.free')}</span>
    ) : (
      <span className="text-2xl font-bold text-on-surface">{formatPrice(c.price)}</span>
    )

  return (
    <>
      <Navbar />
      <main className="min-h-screen">
        <section className="border-b border-border py-16">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="mb-12 text-center">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/20 bg-primary/5 px-3 py-1 text-xs font-semibold uppercase tracking-widest text-primary">
                <GraduationCap className="h-3.5 w-3.5" /> {t('public.project.flagBadge')}
              </span>
              <h1 className="mt-4 text-3xl font-black tracking-tight text-on-surface sm:text-4xl lg:text-5xl">
                {t('public.project.title')}
              </h1>
              <p className="mx-auto mt-3 max-w-2xl text-base text-on-surface-variant sm:text-lg">
                {t('public.project.subtitle')}
              </p>
            </div>

            {loading || authLoading ? (
              <div className="flex items-center justify-center py-20">
                <Loader2 className="h-8 w-8 animate-spin text-indigo-400" />
              </div>
            ) : classes.length === 0 ? (
              <div className="py-20 text-center">
                <p className="text-on-surface-variant">{t('public.project.empty')}</p>
              </div>
            ) : (
              <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                {classes.map((course) => {
                  const nb = nextBatchLabel(course.batches, t)
                  const isFull = nb.full
                  const lang = course.language
                  return (
                    <div
                      key={course.id}
                      className="group relative flex flex-col overflow-hidden rounded-2xl border border-border bg-surface transition-all duration-300 hover:-translate-y-1 hover:border-primary/40 hover:shadow-xl hover:shadow-primary/5"
                    >
                      <div className="relative h-36 shrink-0 overflow-hidden">
                        {course.image_url ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={course.image_url}
                            alt={course.title.id || course.title.en}
                            className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                          />
                        ) : (
                          <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-indigo-500/15 via-purple-500/10 to-emerald-500/10">
                            {lang?.flag_emoji ? (
                              <Flag emoji={lang.flag_emoji} className="h-14 w-auto drop-shadow-md" />
                            ) : (
                              <span className="text-5xl">📚</span>
                            )}
                          </div>
                        )}
                        <div className="absolute inset-0 bg-gradient-to-t from-surface via-surface/10 to-transparent" />
                        <div className="absolute inset-x-3 top-3 flex items-start justify-between gap-2">
                          {course.is_try_class ? (
                            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-white shadow-md">
                              <Sparkles className="h-3 w-3" /> {t('public.project.trialFree')}
                            </span>
                          ) : (
                            <span />
                          )}
                          <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-background/80 px-2.5 py-1 text-[10px] font-semibold text-on-surface backdrop-blur">
                            {course.mode === 'online' ? 'Online' : 'Offline'}
                          </span>
                        </div>
                      </div>

                      <div className="flex flex-1 flex-col p-5">
                        <div className="flex items-start justify-between gap-3">
                          <h3 className="line-clamp-1 text-base font-bold text-on-surface transition-colors group-hover:text-primary">
                            {course.title.id || course.title.en}
                          </h3>
                          {course.level?.code && (
                            <span className="mt-0.5 shrink-0 rounded-md border border-border bg-background px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-on-surface-variant">
                              {course.level.code}
                            </span>
                          )}
                        </div>

                        {course.description?.id && (
                          <p className="mt-2 line-clamp-2 text-sm leading-relaxed text-on-surface-variant">
                            {course.description.id}
                          </p>
                        )}

                        {course.teachers.length > 0 && (
                          <div className="mt-3 flex min-w-0 items-center gap-2">
                            <div className="flex shrink-0 -space-x-2">
                              {course.teachers.slice(0, 3).map((t) =>
                                t.photo_url ? (
                                  // eslint-disable-next-line @next/next/no-img-element
                                  <img key={t.id} src={t.photo_url} alt=""
                                    onError={(e) => { e.currentTarget.style.display = 'none' }}
                                    className="h-7 w-7 rounded-full border-2 border-surface object-cover" />
                                ) : (
                                  <div key={t.id}
                                    className="flex h-7 w-7 items-center justify-center rounded-full border-2 border-surface bg-gradient-to-br from-indigo-500 to-purple-500 text-[10px] font-bold text-white">
                                    {t.display_name.slice(0, 2).toUpperCase()}
                                  </div>
                                )
                              )}
                            </div>
                            <p className="min-w-0 truncate text-xs text-on-surface-variant">
                              <span className="font-medium text-on-surface">{course.teachers[0].display_name}</span>
                              {course.teachers.length > 1
                                ? ' ' + t('public.project.teacherCount', { count: course.teachers.length - 1 })
                                : ' ' + t('public.project.classTeacher')}
                            </p>
                          </div>
                        )}

                        <div className="mt-4 flex flex-wrap gap-2">
                          <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background px-2.5 py-1 text-xs text-on-surface-variant">
                            <BookOpen className="h-3.5 w-3.5 text-indigo-400" /> {t('public.project.meetingCount', { count: course.meeting_count })}
                          </span>
                          <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background px-2.5 py-1 text-xs text-on-surface-variant">
                            <FileText className="h-3.5 w-3.5 text-indigo-400" /> {t('public.project.projectCount', { count: course.project_count })}
                          </span>
                        </div>

                        <div className="mt-2.5 flex items-center gap-1.5 text-xs">
                          <Users className={isFull ? 'h-4 w-4 text-orange-400' : 'h-4 w-4 text-indigo-400'} />
                          <span className={isFull ? 'font-medium text-orange-400' : 'text-on-surface-variant'}>
                            {nb.label}
                          </span>
                        </div>

                        <div className="mt-auto flex flex-wrap items-center justify-between gap-x-3 gap-y-3 border-t border-border/70 pt-4">
                          <div className="min-w-0">{priceLabel(course)}</div>
                          <div className="shrink-0">{renderAction(course)}</div>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}

            {!loading && !authLoading && !user && (
              <div className="relative mx-auto mt-14 max-w-2xl overflow-hidden rounded-2xl border border-primary/20 bg-gradient-to-br from-primary/10 via-background to-emerald-500/10 p-8 text-center">
                <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-primary via-indigo-400 to-emerald-400" />
                <GraduationCap className="mx-auto mb-3 h-9 w-9 text-primary" />
                <h2 className="text-xl font-bold text-on-surface">{t('public.project.hasTrialCoupon')}</h2>
                <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-on-surface-variant">
                  {t('public.project.trialInfoBefore')}{' '}
                  <span className="font-medium text-primary">{t('public.project.claimReward')}</span>
                  {t('public.project.trialInfoAfter')}
                </p>
                <Link href="/daftar" className="mt-5 inline-block">
                  <Button>
                    {t('public.project.registerNow')} <ArrowRight className="ml-2 h-4 w-4" />
                  </Button>
                </Link>
              </div>
            )}
          </div>
        </section>
      </main>
      <Footer />
    </>
  )
}

export default function ProjectPage() {
  return (
    <Suspense
      fallback={(
        <div className="flex min-h-[60vh] items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-indigo-400" />
        </div>
      )}
    >
      <ProjectPageContent />
    </Suspense>
  )
}
