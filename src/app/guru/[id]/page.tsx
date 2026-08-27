'use client'

import { useState, useEffect, use } from 'react'
import Link from 'next/link'
import { Navbar } from '@/components/layout/navbar'
import { Footer } from '@/components/layout/footer'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { createClient } from '@/lib/supabase-client'
import { useI18n } from '@/lib/i18n/client'
import { cn, pickName } from '@/lib/utils'
import { Flag } from '@/components/ui/flag'
import { ArrowLeft, Award, Briefcase, Clock, GraduationCap, Calendar, MessageSquare, Check, X } from 'lucide-react'
import type { User, Teacher, TeacherLanguage, Program } from '@/types'

interface ScheduleSlot {
  day: string
  slots: { start: string; end: string; available: boolean }[]
}

const DAYS = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu']
const DAY_KEYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']
const LOCALE_MAP: Record<string, string> = { en: 'en-US', id: 'id-ID', zh: 'zh-CN' }

export default function TeacherDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const { t, lang } = useI18n()
  const [teacher, setTeacher] = useState<(Teacher & { user: User; languages: (TeacherLanguage & { language: { code: string; name: { id: string; en: string }; native_name: string; flag_emoji: string } })[]; programs: Program[] }) | null>(null)
  const [schedule, setSchedule] = useState<ScheduleSlot[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedDay, setSelectedDay] = useState(0)
  const supabase = createClient()

  useEffect(() => {
    async function load() {
      setLoading(true)

      const [teacherRes] = await Promise.all([
        supabase
          .from('teachers')
          .select(`
            *,
            user:users!user_id(id, display_name, photo_url, bio, role, status),
            languages:teacher_languages(
              *,
              language:languages(*)
            )
          `)
          .eq('user_id', id)
          .single(),
      ])

      if (teacherRes.error) { setLoading(false); return }

      const tData = teacherRes.data as any
      let programs: Program[] = []

      const { data: tprogs } = await supabase
        .from('teacher_programs')
        .select('program:programs(*)')
        .eq('teacher_id', tData.id)

      if (tprogs) {
        programs = tprogs.map((tp: any) => tp.program).filter(Boolean)
      }

      setTeacher({
        ...tData,
        user: tData.user,
        languages: tData.languages || [],
        programs,
      })

      if (tData.availability?.schedule) {
        const raw: Record<string, string[]> = tData.availability.schedule
        const days = DAYS.map((day, idx) => ({
          day,
          slots: (raw[idx.toString()] || raw[day.toLowerCase()] || []).map((t: string) => ({
            start: t.split('-')[0],
            end: t.split('-')[1] || t,
            available: true,
          })),
        }))
        setSchedule(days)
      }

      setLoading(false)
    }
    load()
  }, [id])

  if (loading) {
    return (
      <>
        <Navbar />
        <main className="min-h-screen">
          <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
            <div className="animate-pulse space-y-6">
              <div className="h-8 w-32 rounded bg-surface-container-high" />
              <div className="flex gap-6">
                <div className="h-24 w-24 rounded-full bg-surface-container-high" />
                <div className="flex-1 space-y-3">
                  <div className="h-6 w-48 rounded bg-surface-container-high" />
                  <div className="h-4 w-72 rounded bg-surface-container-high" />
                  <div className="h-4 w-56 rounded bg-surface-container-high" />
                </div>
              </div>
              <div className="grid gap-6 sm:grid-cols-2">
                <div className="h-48 rounded-xl bg-surface-container-high" />
                <div className="h-48 rounded-xl bg-surface-container-high" />
              </div>
            </div>
          </div>
        </main>
        <Footer />
      </>
    )
  }

  if (!teacher) {
    return (
      <>
        <Navbar />
        <main className="min-h-screen">
          <div className="mx-auto max-w-7xl px-4 py-20 text-center sm:px-6 lg:px-8">
            <h1 className="text-2xl font-bold text-on-surface">{t('landing.guruDetail.notFound')}</h1>
            <p className="mt-2 text-on-surface-variant">{t('landing.guruDetail.notFoundDesc')}</p>
            <Link href="/guru">
              <Button variant="outline" className="mt-6">
                <ArrowLeft className="h-4 w-4" />
                {t('landing.guruDetail.back')}
              </Button>
            </Link>
          </div>
        </main>
        <Footer />
      </>
    )
  }

  const u = teacher.user
  const initials = u.display_name?.split(' ').map(n => n[0]).join('').toUpperCase() || '?'

  return (
    <>
      <Navbar />
      <main className="min-h-screen">
        <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
          <Link href="/guru" className="mb-6 inline-flex items-center gap-1.5 text-sm text-on-surface-variant hover:text-indigo-400 transition-colors">
            <ArrowLeft className="h-4 w-4" />
            {t('landing.guruDetail.backToList')}
          </Link>

          <div className="rounded-2xl border border-border bg-surface p-6 sm:p-8">
            <div className="flex flex-col gap-6 sm:flex-row sm:items-start sm:gap-6">
              <div className="shrink-0">
                {u.photo_url ? (
                  <img src={u.photo_url} alt={u.display_name || ''} className="h-24 w-24 rounded-full object-cover ring-2 ring-border sm:h-28 sm:w-28" />
                ) : (
                  <div className="flex h-24 w-24 items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 to-indigo-600 text-3xl font-bold text-white sm:h-28 sm:w-28">
                    {initials}
                  </div>
                )}
              </div>

              <div className="min-w-0 flex-1">
                <h1 className="text-2xl font-bold text-on-surface sm:text-3xl">{u.display_name}</h1>
                {teacher.headline && <p className="mt-1 text-on-surface-variant">{teacher.headline}</p>}

                <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-on-surface-variant">
                  <span className="flex items-center gap-1.5">
                    <Briefcase className="h-4 w-4 text-muted" />
                    {t('landing.guruDetail.experienceYears', { years: teacher.experience_years || 0 })}
                  </span>
                  {teacher.hourly_rate && (
                    <span className="flex items-center gap-1.5">
                      <Clock className="h-4 w-4 text-muted" />
                      {t('landing.guruDetail.hourlyRate', { rate: teacher.hourly_rate.toLocaleString(LOCALE_MAP[lang] || 'en-US') })}
                    </span>
                  )}
                </div>

                <div className="mt-4 flex flex-wrap gap-2">
                  {teacher.languages?.map((tl) => (
                    <Badge key={tl.language_code} variant="outline" className="gap-1">
                      {tl.language?.flag_emoji ? <Flag emoji={tl.language.flag_emoji} className="h-3.5" /> : null} {tl.language?.native_name || tl.language_code}
                      {tl.is_native && <span className="text-indigo-400">{t('landing.guruDetail.native')}</span>}
                    </Badge>
                  ))}
                </div>
              </div>
            </div>
          </div>

          <div className="mt-6 grid gap-6 lg:grid-cols-3">
            <div className="space-y-6 lg:col-span-2">
              <div className="rounded-xl border border-border bg-surface p-6">
                <h2 className="mb-3 text-lg font-semibold text-on-surface">{t('landing.guruDetail.biography')}</h2>
                <p className="text-sm text-on-surface-variant leading-relaxed whitespace-pre-line">
                  {teacher.bio || t('landing.guruDetail.noBiography')}
                </p>
              </div>

              <div className="rounded-xl border border-border bg-surface p-6">
                <h2 className="mb-4 text-lg font-semibold text-on-surface">{t('landing.guruDetail.certifications')}</h2>
                {teacher.certifications?.length ? (
                  <ul className="space-y-3">
                    {teacher.certifications.map((cert: string, i: number) => (
                      <li key={i} className="flex items-start gap-3">
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-indigo-500/20">
                          <Award className="h-4 w-4 text-indigo-400" />
                        </div>
                        <div>
                          <p className="text-sm font-medium text-on-surface">{cert}</p>
                        </div>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-muted">{t('landing.guruDetail.noCertifications')}</p>
                )}
              </div>

              <div className="rounded-xl border border-border bg-surface p-6">
                <h2 className="mb-4 text-lg font-semibold text-on-surface">{t('landing.guruDetail.taughtPrograms')}</h2>
                {teacher.programs?.length ? (
                  <div className="grid gap-3 sm:grid-cols-2">
                    {teacher.programs.map((p) => (
                      <div key={p.id} className="rounded-lg border border-border bg-surface-container-low p-4">
                        <div className="flex items-center gap-2">
                          <GraduationCap className="h-4 w-4 text-indigo-400" />
                          <h3 className="font-medium text-on-surface text-sm">{pickName(lang, p.name)}</h3>
                        </div>
                        {p.description?.id && (
                          <p className="mt-1 text-xs text-on-surface-variant line-clamp-2">{p.description.id}</p>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted">{t('landing.guruDetail.noPrograms')}</p>
                )}
              </div>
            </div>

            <div className="space-y-6">
              <div className="rounded-xl border border-border bg-surface p-6">
                <h2 className="mb-3 text-lg font-semibold text-on-surface">{t('landing.guruDetail.availability')}</h2>
                <div className="flex items-center gap-3">
                  <span className={cn(
                    'inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-medium',
                    teacher.availability?.status !== 'busy'
                      ? 'bg-emerald-500/20 text-emerald-400'
                      : 'bg-amber-500/20 text-amber-400'
                  )}>
                    <span className={cn('h-2 w-2 rounded-full', teacher.availability?.status !== 'busy' ? 'bg-emerald-400' : 'bg-amber-400')} />
                    {teacher.availability?.status !== 'busy' ? t('landing.guruDetail.available') : t('landing.guruDetail.busy')}
                  </span>
                </div>
              </div>

              {schedule.length > 0 && (
                <div className="rounded-xl border border-border bg-surface p-6">
                  <h2 className="mb-3 text-lg font-semibold text-on-surface">{t('landing.guruDetail.schedule')}</h2>
                  <div className="flex gap-1 overflow-x-auto pb-2">
                    {schedule.map((d, idx) => (
                      <button
                        key={d.day}
                        onClick={() => setSelectedDay(idx)}
                        className={cn(
                          'shrink-0 rounded-lg px-3 py-2 text-center text-xs transition-colors',
                          selectedDay === idx
                            ? 'bg-indigo-500/20 text-indigo-400'
                            : 'text-muted hover:bg-surface-container-high'
                        )}
                      >
                        <div className="font-medium">{t('landing.guruDetail.day.' + DAY_KEYS[idx])}</div>
                      </button>
                    ))}
                  </div>
                  <div className="mt-3 space-y-2">
                    {schedule[selectedDay]?.slots.length ? (
                      schedule[selectedDay].slots.map((slot, i) => (
                        <div
                          key={i}
                          className={cn(
                            'flex items-center justify-between rounded-lg border px-3 py-2 text-sm',
                            slot.available
                              ? 'border-emerald-500/20 bg-emerald-500/5'
                              : 'border-border bg-surface-container-low opacity-50'
                          )}
                        >
                          <span className="text-on-surface">
                            {slot.start} - {slot.end}
                          </span>
                          {slot.available ? (
                            <Check className="h-4 w-4 text-emerald-400" />
                          ) : (
                            <X className="h-4 w-4 text-muted" />
                          )}
                        </div>
                      ))
                    ) : (
                      <p className="text-center text-sm text-muted py-4">{t('landing.guruDetail.noSchedule')}</p>
                    )}
                  </div>
                </div>
              )}

              <div className="rounded-xl border border-border bg-surface p-6 text-center">
                <Calendar className="mx-auto mb-3 h-8 w-8 text-indigo-400" />
                <h3 className="font-semibold text-on-surface">{t('landing.guruDetail.wantToLearn')}</h3>
                <p className="mt-1 text-sm text-on-surface-variant">
                  {t('landing.guruDetail.contactDesc')}
                </p>
                <Button className="mt-4 w-full">
                  <MessageSquare className="h-4 w-4" />
                  {t('landing.guruDetail.contactCta')}
                </Button>
              </div>
            </div>
          </div>
        </div>
      </main>
      <Footer />
    </>
  )
}
