'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { BookOpen, FileText, Users, ArrowRight, Sparkles } from 'lucide-react'
import { createClient } from '@/lib/supabase-client'
import { useI18n } from '@/lib/i18n/client'
import { Flag } from '@/components/ui/flag'
import { Button } from '@/components/ui/button'

interface CoursePreview {
  id: string
  title: { id: string; en: string }
  description: { id: string; en: string } | null
  image_url: string | null
  price: number
  meeting_count: number
  project_count: number
  is_try_class: boolean
  mode: string
  language?: { code: string; flag_emoji: string } | null
  level?: { code: string } | null
  teachers: { id: string; display_name: string; photo_url: string | null }[]
  batches: { id: string; name: string; start_date: string; capacity: number; current_students: number }[]
}

const LOCALE_MAP: Record<string, string> = { en: 'en-US', id: 'id-ID', zh: 'zh-CN' }

type TFunc = (key: string, vars?: Record<string, string | number>) => string

function formatPrice(n: number, lang: string): string {
  return 'Rp ' + new Intl.NumberFormat(LOCALE_MAP[lang] || 'en-US').format(n)
}

function nextBatchLabel(batches: CoursePreview['batches'], t: TFunc): { label: string; full: boolean } {
  const future = batches
    .filter((b) => new Date(b.start_date).getTime() > Date.now() && b.current_students < b.capacity)
    .sort((a, b) => new Date(a.start_date).getTime() - new Date(b.start_date).getTime())
  if (future.length === 0) {
    return { label: t('landing.courses.waitingBatch'), full: true }
  }
  const b = future[0]
  const sisa = b.capacity - b.current_students
  const batchLabel = b.name ? (b.name.toLowerCase().includes('batch') ? b.name : `${t('landing.courses.batchPrefix')} ${b.name}`) : t('landing.courses.batchPrefix')
  return { label: t('landing.courses.batchLabel', { batch: batchLabel, count: sisa }), full: false }
}

export function CoursesSection() {
  const { t, lang } = useI18n()
  const supabase = createClient()
  const [courses, setCourses] = useState<CoursePreview[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    async function fetchCourses() {
      const baseSelect = `
          id, title, description, image_url, price, meeting_count, project_count, is_try_class,
          mode,
          language:languages(code, flag_emoji),
          level:level_id(code),
          teacher_assignments:course_teachers(
            teacher:teachers(
              user:users(id, display_name, photo_url)
            )
          )
        `
      const common = (q: any) =>
        q
          .eq('status', 'active')
          .eq('is_visible_marketplace', true)
          .limit(8)

      let courseRes = await common(supabase.from('courses').select(baseSelect).eq('is_featured', true))
      if (!courseRes.data || courseRes.data.length === 0) {
        courseRes = await common(
          supabase.from('courses').select(baseSelect).order('is_try_class', { ascending: false }).order('created_at', { ascending: true })
        )
      }
      const courseIds = (courseRes.data || []).map((c: any) => c.id)
      const batchRes = courseIds.length
        ? await supabase
            .from('batches')
            .select('id, course_id, name, start_date, capacity, current_students')
            .eq('status', 'active')
            .in('course_id', courseIds)
            .order('start_date', { ascending: true })
        : { data: [] }

      if (!cancelled) {
        setCourses((courseRes.data || []).map((c: any) => ({
          id: c.id,
          title: c.title || { id: t('landing.courses.titleFallback'), en: t('landing.courses.titleFallback') },
          description: c.description,
          image_url: c.image_url,
          price: Number(c.price) || 0,
          meeting_count: c.meeting_count ?? 0,
          project_count: c.project_count ?? 0,
          is_try_class: !!c.is_try_class,
          mode: c.mode,
          language: c.language,
          level: c.level,
          teachers: (c.teacher_assignments || [])
            .map((t: any) => t.teacher?.user)
            .filter(Boolean)
            .map((u: any) => ({ id: u.id, display_name: u.display_name || t('landing.courses.teacherFallback'), photo_url: u.photo_url })),
          batches: (batchRes.data || []).filter((b: any) => b.course_id === c.id),
        })))
        setLoading(false)
      }
    }
    fetchCourses().catch(() => {
      if (!cancelled) setLoading(false)
    })

    const channel = supabase
      .channel('landing-course-slots')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'batches' },
        () => {
          fetchCourses()
        }
      )
      .subscribe()

    return () => {
      cancelled = true
      supabase.removeChannel(channel)
    }
  }, [supabase, t])

  if (!loading && courses.length === 0) {
    return null
  }

  return (
    <section id="kelas" className="mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8 lg:py-24" aria-label={t('landing.courses.ariaLabel')}>
      <div className="mb-12 text-center">
        <span className="inline-flex items-center gap-2 rounded-full border border-border bg-surface-container-low px-3 py-1 text-xs font-bold uppercase tracking-widest text-on-surface-variant">
          <BookOpen className="size-3" aria-hidden="true" /> {t('landing.courses.badge')}
        </span>
        <h2 className="mt-4 text-balance text-3xl font-extrabold tracking-tight text-on-surface sm:text-4xl">
          {t('landing.courses.titlePart1')} <span className="gradient-text">{t('landing.courses.titlePart2')}</span>
        </h2>
        <p className="mx-auto mt-3 max-w-2xl text-base text-on-surface-variant sm:text-lg">
          {t('landing.courses.subtitle')}
        </p>
      </div>

      {loading ? (
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-96 animate-pulse rounded-2xl border border-border bg-surface" />
          ))}
        </div>
      ) : (
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {courses.slice(0, 3).map((course) => {
            const nb = nextBatchLabel(course.batches, t)
            const isFull = nb.full
            const courseLang = course.language
            const title = lang === 'en' ? (course.title.en || course.title.id) : (course.title.id || course.title.en)
            const desc = course.description
              ? (lang === 'en' ? (course.description.en || course.description.id) : (course.description.id || course.description.en))
              : ''
            return (
              <Link
                key={course.id}
                href="/project"
                className="group relative flex flex-col overflow-hidden rounded-2xl border border-border bg-surface transition-all duration-300 hover:-translate-y-1 hover:border-primary/40 hover:shadow-xl hover:shadow-primary/5"
              >
                <div className="relative h-36 shrink-0 overflow-hidden">
                  {course.image_url ? (
                    <img
                      src={course.image_url}
                      alt={title}
                      className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-indigo-500/15 via-purple-500/10 to-emerald-500/10">
                      {courseLang?.flag_emoji ? (
                        <Flag emoji={courseLang.flag_emoji} className="h-14 w-auto drop-shadow-md" />
                      ) : (
                        <span className="text-5xl">📚</span>
                      )}
                    </div>
                  )}
                  <div className="absolute inset-0 bg-gradient-to-t from-surface via-surface/10 to-transparent" />
                  <div className="absolute inset-x-3 top-3 flex items-start justify-between gap-2">
                    {course.is_try_class ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-white shadow-md">
                        <Sparkles className="h-3 w-3" /> {t('landing.courses.trialBadge')}
                      </span>
                    ) : (
                      <span />
                    )}
                    <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-background/80 px-2.5 py-1 text-[10px] font-semibold text-on-surface backdrop-blur">
                      {course.mode === 'online' ? t('landing.courses.mode.online') : t('landing.courses.mode.offline')}
                    </span>
                  </div>
                </div>

                <div className="flex flex-1 flex-col p-5">
                  <div className="flex items-start justify-between gap-3">
                    <h3 className="line-clamp-1 text-base font-bold text-on-surface transition-colors group-hover:text-primary">
                      {title}
                    </h3>
                    {course.level?.code && (
                      <span className="mt-0.5 shrink-0 rounded-md border border-border bg-background px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-on-surface-variant">
                        {course.level.code}
                      </span>
                    )}
                  </div>

                  {desc && (
                    <p className="mt-2 line-clamp-2 text-sm leading-relaxed text-on-surface-variant">
                      {desc}
                    </p>
                  )}

                  {course.teachers.length > 0 && (
                    <div className="mt-3 flex min-w-0 items-center gap-2">
                      <div className="flex shrink-0 -space-x-2">
                        {course.teachers.slice(0, 3).map((t) =>
                          t.photo_url ? (
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
                          ? t('landing.courses.moreTeachers', { count: course.teachers.length - 1 })
                          : t('landing.courses.classTeacher')}
                      </p>
                    </div>
                  )}

                  <div className="mt-4 flex flex-wrap gap-2">
                    <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background px-2.5 py-1 text-xs text-on-surface-variant">
                      <BookOpen className="h-3.5 w-3.5 text-indigo-400" /> {t('landing.courses.meetingCount', { count: course.meeting_count })}
                    </span>
                    <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background px-2.5 py-1 text-xs text-on-surface-variant">
                      <FileText className="h-3.5 w-3.5 text-indigo-400" /> {t('landing.courses.projectCount', { count: course.project_count })}
                    </span>
                  </div>

                  <div className="mt-2.5 flex items-center gap-1.5 text-xs">
                    <Users className={isFull ? 'h-4 w-4 text-orange-400' : 'h-4 w-4 text-indigo-400'} />
                    <span className={isFull ? 'font-medium text-orange-400' : 'text-on-surface-variant'}>
                      {nb.label}
                    </span>
                  </div>

                  <div className="mt-auto flex flex-wrap items-center justify-between gap-x-3 gap-y-3 border-t border-border/70 pt-4">
                    <div className="min-w-0">
                      {course.is_try_class ? (
                        <span className="text-2xl font-bold text-emerald-400">{t('landing.courses.free')}</span>
                      ) : (
                        <span className="text-2xl font-bold text-on-surface">{formatPrice(course.price, lang)}</span>
                      )}
                    </div>
                    <span className="inline-flex shrink-0 items-center gap-1.5 text-sm font-semibold text-primary">
                      {t('landing.courses.viewDetail')} <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                    </span>
                  </div>
                </div>
              </Link>
            )
          })}
        </div>
      )}

      <div className="mt-12 text-center">
        <Link href="/project">
          <Button size="lg" variant="outline" className="px-8">
            {t('landing.courses.viewAll')} <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
        </Link>
      </div>
    </section>
  )
}
