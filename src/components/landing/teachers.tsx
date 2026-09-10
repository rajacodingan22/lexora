'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase-client'
import { GraduationCap, Briefcase } from 'lucide-react'
import { useI18n } from '@/lib/i18n/client'

interface TeacherCard {
  user_id: string
  headline: string | null
  bio: string | null
  experience_years: number | null
  user: {
    display_name: string | null
    photo_url: string | null
  } | null
}

function initials(name: string | null): string {
  return (
    name
      ?.split(' ')
      .map((n) => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2) || '?'
  )
}

function Avatar({ teacher }: { teacher: TeacherCard }) {
  const { t } = useI18n()
  const name = teacher.user?.display_name ?? null
  if (teacher.user?.photo_url) {
    return (
      <img
        src={teacher.user.photo_url}
        alt={name || t('landing.teachers.avatarAlt')}
        className="aspect-square w-full rounded-2xl object-cover transition-transform duration-500 group-hover:scale-105"
      />
    )
  }
  return (
    <div className="flex aspect-square w-full items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-600 text-4xl font-extrabold text-white">
      {initials(name)}
    </div>
  )
}

export function TeachersSection() {
  const { t } = useI18n()
  const [teachers, setTeachers] = useState<TeacherCard[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true
    const supabase = createClient()
    ;(async () => {
      try {
        const { data } = await supabase
          .from('teachers')
          .select(
            'user_id, headline, bio, experience_years, created_at, user:users!user_id(display_name, photo_url)'
          )
          .eq('status', 'active')
          .eq('marketplace_visible', true)
          .order('created_at', { ascending: false })
          .limit(4)
        if (!active) return
        setTeachers((data as unknown as TeacherCard[]) || [])
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

  if (!loading && teachers.length === 0) return null

  return (
    <section
      id="pengajar"
      className="mx-auto max-w-7xl scroll-mt-24 px-4 py-12 sm:px-6 lg:px-8 lg:py-16"
      aria-label={t('landing.teachers.ariaLabel')}
    >
      <div className="mb-10 text-center">
        <span className="inline-flex items-center gap-2 rounded-full border border-border bg-surface-container-low px-3 py-1 text-xs font-bold uppercase tracking-widest text-on-surface-variant">
          <GraduationCap className="size-3" aria-hidden="true" /> {t('landing.teachers.badge')}
        </span>
        <h2 className="mt-4 text-balance text-3xl font-extrabold tracking-tight text-on-surface sm:text-4xl">
          {t('landing.teachers.titlePart1')} <span className="gradient-text">{t('landing.teachers.titleHighlight')}</span>
        </h2>
      </div>

      {loading ? (
        <div className="grid grid-cols-2 gap-4 sm:gap-6 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="animate-pulse rounded-2xl border border-border bg-surface p-3">
              <div className="aspect-square w-full rounded-xl bg-surface-container-high" />
              <div className="mt-3 h-4 w-3/4 rounded bg-surface-container-high" />
              <div className="mt-2 h-3 w-1/2 rounded bg-surface-container-high" />
            </div>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:gap-6 lg:grid-cols-4">
          {teachers.map((teacher) => (
            <Link
              key={teacher.user_id}
              href={`/guru/${teacher.user_id}`}
              className="group min-w-0 rounded-2xl p-3 transition-all duration-200 hover:bg-surface-container-low focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            >
              <div className="overflow-hidden rounded-2xl border border-border shadow-sm">
                <Avatar teacher={teacher} />
              </div>
              <h3 className="mt-3 truncate font-bold text-on-surface transition-colors group-hover:text-primary">
                {teacher.user?.display_name || t('landing.teachers.nameFallback')}
              </h3>
              <p className="mt-0.5 truncate text-sm text-on-surface-variant">
                {teacher.headline || t('landing.teachers.headlineFallback')}
              </p>
              {teacher.experience_years != null && (
                <p className="mt-1.5 inline-flex items-center gap-1 text-xs font-medium text-muted">
                  <Briefcase className="size-3" aria-hidden="true" />
                  {t('landing.teachers.experience', { years: teacher.experience_years })}
                </p>
              )}
            </Link>
          ))}
        </div>
      )}
    </section>
  )
}
