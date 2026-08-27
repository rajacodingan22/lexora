'use client'

import { useState, useEffect, useCallback } from 'react'
import { Navbar } from '@/components/layout/navbar'
import { Footer } from '@/components/layout/footer'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { createClient } from '@/lib/supabase-client'
import { useI18n } from '@/lib/i18n/client'
import { Search, X, Globe, Award, Briefcase, Clock, ChevronLeft, ChevronRight, ExternalLink, GraduationCap } from 'lucide-react'
import { cn, pickName } from '@/lib/utils'
import { Flag } from '@/components/ui/flag'
import type { User, Teacher, TeacherLanguage, LanguageLevel, Program } from '@/types'

const ITEMS_PER_PAGE = 8
const LOCALE_MAP: Record<string, string> = { en: 'en-US', id: 'id-ID', zh: 'zh-CN' }
const EXPERIENCE_RANGES = [
  { key: '0to2', min: 0, max: 2 },
  { key: '2to5', min: 2, max: 5 },
  { key: '5to10', min: 5, max: 10 },
  { key: '10plus', min: 10, max: Infinity },
]

interface TeacherWithExtras extends Teacher {
  user: User
  languages: (TeacherLanguage & { language: { code: string; name: { id: string; en: string }; native_name: string; flag_emoji: string } })[]
  programs: Program[]
}

function TeacherCard({ teacher, onDetail }: { teacher: TeacherWithExtras; onDetail: (t: TeacherWithExtras) => void }) {
  const { t } = useI18n()
  const u = teacher.user
  const initials = u.display_name?.split(' ').map(n => n[0]).join('').toUpperCase() || '?'
  const isAvailable = teacher.availability?.status !== 'busy'

  return (
    <div
      onClick={() => onDetail(teacher)}
      className="group cursor-pointer rounded-xl border border-border bg-surface p-5 transition-all duration-200 hover:border-indigo-500/30 hover:shadow-lg hover:shadow-indigo-500/5"
    >
      <div className="flex items-start gap-4">
        <div className="relative shrink-0">
          {u.photo_url ? (
            <img src={u.photo_url} alt={u.display_name || ''} className="h-16 w-16 rounded-full object-cover ring-2 ring-border" />
          ) : (
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 to-indigo-600 text-lg font-bold text-white">
              {initials}
            </div>
          )}
          <span className={cn(
            'absolute -bottom-0.5 -right-0.5 h-4 w-4 rounded-full border-2 border-surface',
            isAvailable ? 'bg-emerald-400' : 'bg-muted'
          )} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="truncate font-semibold text-on-surface group-hover:text-indigo-400 transition-colors">{u.display_name}</h3>
            {teacher.headline && <span className="hidden sm:inline text-xs text-muted">· {teacher.headline}</span>}
          </div>

          <div className="mt-1.5 flex items-center gap-3 text-xs text-on-surface-variant">
            <span className="flex items-center gap-1">
              <Briefcase className="h-3 w-3 text-muted" />
              {t('landing.guru.yearsShort', { years: teacher.experience_years || 0 })}
            </span>
          </div>

          {teacher.bio && (
            <p className="mt-2 line-clamp-2 text-sm text-on-surface-variant leading-relaxed">
              {teacher.bio}
            </p>
          )}

          <div className="mt-3 flex flex-wrap gap-1.5">
            {teacher.languages?.map((tl) => (
              <Badge key={tl.language_code} variant="outline" className="gap-1">
                <Globe className="h-3 w-3" />
                {tl.language?.flag_emoji ? <Flag emoji={tl.language.flag_emoji} className="h-3.5" /> : null} {tl.language?.native_name || tl.language_code}
              </Badge>
            ))}
            {teacher.certifications?.slice(0, 2).map((cert: string, i: number) => (
              <Badge key={i} variant="default" className="gap-1">
                <Award className="h-3 w-3" />
                {cert.length > 20 ? cert.slice(0, 20) + '...' : cert}
              </Badge>
            ))}
            {teacher.certifications?.length > 2 && (
              <Badge variant="outline">+{teacher.certifications.length - 2}</Badge>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function SkeletonCard() {
  return (
    <div className="animate-pulse rounded-xl border border-border bg-surface p-5">
      <div className="flex items-start gap-4">
        <div className="h-16 w-16 shrink-0 rounded-full bg-surface-container-high" />
        <div className="min-w-0 flex-1 space-y-3">
          <div className="h-4 w-40 rounded bg-surface-container-high" />
          <div className="h-3 w-56 rounded bg-surface-container-high" />
          <div className="space-y-2">
            <div className="h-3 w-full rounded bg-surface-container-high" />
            <div className="h-3 w-3/4 rounded bg-surface-container-high" />
          </div>
          <div className="flex gap-2">
            <div className="h-5 w-16 rounded-full bg-surface-container-high" />
            <div className="h-5 w-20 rounded-full bg-surface-container-high" />
            <div className="h-5 w-14 rounded-full bg-surface-container-high" />
          </div>
        </div>
      </div>
    </div>
  )
}

function DetailModal({ teacher, onClose }: { teacher: TeacherWithExtras; onClose: () => void }) {
  const { t, lang } = useI18n()
  const u = teacher.user
  const initials = u.display_name?.split(' ').map(n => n[0]).join('').toUpperCase() || '?'

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto pt-10 pb-20">
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 mx-4 w-full max-w-3xl rounded-2xl border border-border bg-surface shadow-2xl animate-slide-up">
        <button onClick={onClose} className="absolute right-4 top-4 z-10 rounded-lg p-2 text-muted hover:bg-surface-container-high hover:text-on-surface transition-colors">
          <X className="h-5 w-5" />
        </button>

        <div className="p-6 sm:p-8">
          <div className="flex flex-col sm:flex-row items-start gap-5">
            {u.photo_url ? (
              <img src={u.photo_url} alt={u.display_name || ''} className="h-20 w-20 shrink-0 rounded-full object-cover ring-2 ring-border" />
            ) : (
              <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 to-indigo-600 text-2xl font-bold text-white">
                {initials}
              </div>
            )}
            <div className="min-w-0 flex-1">
              <h2 className="text-2xl font-bold text-on-surface">{u.display_name}</h2>
              {teacher.headline && <p className="text-on-surface-variant">{teacher.headline}</p>}
              <div className="mt-2 flex flex-wrap items-center gap-4 text-sm text-on-surface-variant">
                <span className="flex items-center gap-1.5">
                  <Briefcase className="h-4 w-4 text-muted" />
                  {t('landing.guru.experienceYears', { years: teacher.experience_years || 0 })}
                </span>
                {teacher.hourly_rate && (
                  <span className="flex items-center gap-1.5">
                    <Clock className="h-4 w-4 text-muted" />
                    {t('landing.guru.hourlyRate', { rate: teacher.hourly_rate.toLocaleString(LOCALE_MAP[lang] || 'en-US') })}
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="mt-6 grid gap-6 sm:grid-cols-2">
            <div>
              <h3 className="mb-2 font-semibold text-on-surface">{t('landing.guru.biography')}</h3>
              <p className="text-sm text-on-surface-variant leading-relaxed whitespace-pre-line">
                {teacher.bio || t('landing.guru.noBiography')}
              </p>
            </div>
            <div className="space-y-4">
              <div>
                <h3 className="mb-2 font-semibold text-on-surface">{t('landing.guru.certifications')}</h3>
                {teacher.certifications?.length ? (
                  <ul className="space-y-1">
                    {teacher.certifications.map((cert: string, i: number) => (
                      <li key={i} className="flex items-start gap-2 text-sm text-on-surface-variant">
                        <Award className="mt-0.5 h-4 w-4 shrink-0 text-indigo-400" />
                        {cert}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-muted">{t('landing.guru.noCertifications')}</p>
                )}
              </div>
              <div>
                <h3 className="mb-2 font-semibold text-on-surface">{t('landing.guru.taughtLanguages')}</h3>
                <div className="flex flex-wrap gap-2">
                  {teacher.languages?.map((tl) => (
                    <Badge key={tl.language_code} variant="outline" className="gap-1">
                      {tl.language?.flag_emoji ? <Flag emoji={tl.language.flag_emoji} className="h-3.5" /> : null} {tl.language?.native_name || tl.language_code}
                      {tl.is_native && <span className="text-indigo-400">{t('landing.guru.native')}</span>}
                    </Badge>
                  ))}
                </div>
              </div>
              {teacher.programs?.length ? (
                <div>
                  <h3 className="mb-2 font-semibold text-on-surface">{t('landing.guru.program')}</h3>
                  <div className="flex flex-wrap gap-2">
                    {teacher.programs.map((p) => (
                      <Badge key={p.id} variant="default">
                        <GraduationCap className="mr-1 h-3 w-3" />
                        {pickName(lang, p.name)}
                      </Badge>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          </div>

          <div className="mt-6 border-t border-border pt-6">
            <h3 className="mb-3 font-semibold text-on-surface">{t('landing.guru.scheduleAvailability')}</h3>
            <div className="flex items-center gap-3">
              <span className={cn(
                'inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-medium',
                teacher.availability?.status !== 'busy'
                  ? 'bg-emerald-500/20 text-emerald-400'
                  : 'bg-amber-500/20 text-amber-400'
              )}>
                <span className={cn('h-2 w-2 rounded-full', teacher.availability?.status !== 'busy' ? 'bg-emerald-400' : 'bg-amber-400')} />
                {teacher.availability?.status !== 'busy' ? t('landing.guru.available') : t('landing.guru.busy')}
              </span>
            </div>
          </div>

          <div className="mt-6 flex flex-wrap gap-3">
            <Button onClick={() => window.location.href = `/guru/${teacher.user_id}`}>
              <ExternalLink className="h-4 w-4" />
              {t('landing.guru.viewFullProfile')}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function GuruPage() {
  const { t, lang } = useI18n()
  const [teachers, setTeachers] = useState<TeacherWithExtras[]>([])
  const [allTeachers, setAllTeachers] = useState<TeacherWithExtras[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [selectedTeacher, setSelectedTeacher] = useState<TeacherWithExtras | null>(null)
  const [languages, setLanguages] = useState<{ code: string; native_name: string; flag_emoji: string }[]>([])
  const [programs, setPrograms] = useState<Program[]>([])
  const [levels, setLevels] = useState<LanguageLevel[]>([])

  const [filterLanguage, setFilterLanguage] = useState('')
  const [filterProgram, setFilterProgram] = useState('')
  const [filterLevel, setFilterLevel] = useState('')
  const [filterExperience, setFilterExperience] = useState('')
  const [filterAvailability, setFilterAvailability] = useState('')

  const supabase = createClient()

  useEffect(() => {
    async function load() {
      setLoading(true)

      const [teachersRes, langsRes, progsRes, levelsRes] = await Promise.all([
        supabase
          .from('teachers')
          .select(`
            id, user_id, headline, bio, experience_years, certifications,
            hourly_rate, availability, status,
            created_at, updated_at, highest_education, institution, major,
            teaching_mode, max_students, application_id,
            user:users(id, display_name, photo_url, bio, role, status),
            teacher_languages(
              *,
              language:languages(*)
            )
          `)
          .eq('status', 'active')
          .eq('marketplace_visible', true),

        supabase.from('languages').select('code, native_name, flag_emoji').eq('is_active', true).order('sort_order'),
        supabase.from('programs').select('*').eq('is_active', true).order('display_order'),
        supabase.from('language_levels').select('*').eq('is_active', true).order('sort_order'),
      ])

      let data: TeacherWithExtras[] = []
      if (teachersRes.data) {
        data = teachersRes.data
          .filter((t: any) => (t as any).user?.role === 'teacher' && (t as any).user?.status === 'active')
          .map((t: any) => ({
            ...t,
            user: t.user as User,
            languages: (t.teacher_languages || []) as TeacherWithExtras['languages'],
            programs: [],
          })) as unknown as TeacherWithExtras[]
      }

      if (progsRes.data && data.length) {
        const teacherIds = data.map(t => t.id)
        const { data: tprogs } = await supabase
          .from('teacher_programs')
          .select('teacher_id, program:programs(*)')
          .in('teacher_id', teacherIds)

        if (tprogs) {
          const progMap: Record<string, Program[]> = {}
          tprogs.forEach((tp: any) => {
            if (!progMap[tp.teacher_id]) progMap[tp.teacher_id] = []
            if (tp.program) progMap[tp.teacher_id].push(tp.program)
          })
          data = data.map(t => ({ ...t, programs: progMap[t.id] || [] }))
        }
      }

      setAllTeachers(data)
      setTeachers(data)
      if (langsRes.data) setLanguages(langsRes.data)
      if (progsRes.data) setPrograms(progsRes.data)
      if (levelsRes.data) setLevels(levelsRes.data)
      setLoading(false)
    }
    load()
  }, [])

  const applyFilters = useCallback(() => {
    let filtered = [...allTeachers]

    if (search.trim()) {
      const q = search.toLowerCase()
      filtered = filtered.filter(t =>
        t.user.display_name?.toLowerCase().includes(q) ||
        t.bio?.toLowerCase().includes(q) ||
        t.headline?.toLowerCase().includes(q)
      )
    }

    if (filterLanguage) {
      filtered = filtered.filter(t =>
        t.languages?.some(l => l.language_code === filterLanguage)
      )
    }

    if (filterProgram) {
      filtered = filtered.filter(t =>
        t.programs?.some(p => p.id === filterProgram)
      )
    }

    if (filterLevel) {
      filtered = filtered.filter(t =>
        t.languages?.some(l => l.levels?.includes(filterLevel))
      )
    }

    if (filterExperience) {
      const range = EXPERIENCE_RANGES.find(r => r.key === filterExperience)
      if (range) {
        filtered = filtered.filter(t =>
          (t.experience_years || 0) >= range.min && (t.experience_years || 0) <= range.max
        )
      }
    }

    if (filterAvailability) {
      filtered = filtered.filter(t => {
        const status = t.availability?.status
        if (filterAvailability === 'available') return !status || status !== 'busy'
        if (filterAvailability === 'busy') return status === 'busy'
        return true
      })
    }

    setTeachers(filtered)
    setPage(1)
  }, [allTeachers, search, filterLanguage, filterProgram, filterLevel, filterExperience, filterAvailability])

  useEffect(() => { applyFilters() }, [applyFilters])

  const totalPages = Math.ceil(teachers.length / ITEMS_PER_PAGE)
  const paginated = teachers.slice((page - 1) * ITEMS_PER_PAGE, page * ITEMS_PER_PAGE)
  const hasActiveFilters = filterLanguage || filterProgram || filterLevel || filterExperience || filterAvailability

  function clearFilters() {
    setFilterLanguage('')
    setFilterProgram('')
    setFilterLevel('')
    setFilterExperience('')
    setFilterAvailability('')
    setSearch('')
  }

  return (
    <>
      <Navbar />
      <main className="min-h-screen">
        <section className="border-b border-border py-12 sm:py-16">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="mb-10 text-center">
              <h1 className="text-3xl sm:text-4xl font-bold text-on-surface">{t('landing.guru.title')}</h1>
              <p className="mt-2 text-on-surface-variant">{t('landing.guru.subtitle')}</p>
            </div>

            <div className="mx-auto mb-8 max-w-xl">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
                <Input
                  placeholder={t('landing.guru.searchPlaceholder')}
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>

            <div className="flex flex-col gap-6 lg:flex-row">
              <aside className="w-full shrink-0 lg:w-64">
                <div className="sticky top-24 rounded-xl border border-border bg-surface p-5 space-y-5">
                  <div className="flex items-center justify-between">
                    <h2 className="font-semibold text-on-surface">{t('landing.guru.filter')}</h2>
                    {hasActiveFilters && (
                      <button onClick={clearFilters} className="text-xs text-indigo-400 hover:text-indigo-300 transition-colors">
                        {t('landing.guru.reset')}
                      </button>
                    )}
                  </div>

                  <div>
                    <label className="mb-1.5 block text-xs font-medium text-on-surface-variant uppercase tracking-wider">{t('landing.guru.filterLanguage')}</label>
                    <select
                      value={filterLanguage}
                      onChange={(e) => setFilterLanguage(e.target.value)}
                      className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-on-surface focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
                    >
                      <option value="">{t('landing.guru.allLanguages')}</option>
                      {languages.map((l) => (
                        <option key={l.code} value={l.code}><Flag emoji={l.flag_emoji} className="h-3.5" /> {l.native_name}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="mb-1.5 block text-xs font-medium text-on-surface-variant uppercase tracking-wider">{t('landing.guru.filterProgram')}</label>
                    <select
                      value={filterProgram}
                      onChange={(e) => setFilterProgram(e.target.value)}
                      className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-on-surface focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
                    >
                      <option value="">{t('landing.guru.allPrograms')}</option>
                      {programs.map((p) => (
                        <option key={p.id} value={p.id}>{pickName(lang, p.name)}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="mb-1.5 block text-xs font-medium text-on-surface-variant uppercase tracking-wider">{t('landing.guru.filterLevel')}</label>
                    <select
                      value={filterLevel}
                      onChange={(e) => setFilterLevel(e.target.value)}
                      className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-on-surface focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
                    >
                      <option value="">{t('landing.guru.allLevels')}</option>
                      {levels.map((l) => (
                        <option key={l.id} value={l.code}>{pickName(lang, l.name) || l.code}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="mb-1.5 block text-xs font-medium text-on-surface-variant uppercase tracking-wider">{t('landing.guru.filterExperience')}</label>
                    <select
                      value={filterExperience}
                      onChange={(e) => setFilterExperience(e.target.value)}
                      className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-on-surface focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
                    >
                      <option value="">{t('landing.guru.all')}</option>
                      {EXPERIENCE_RANGES.map((r) => (
                        <option key={r.key} value={r.key}>{t('landing.guru.experience.' + r.key)}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="mb-1.5 block text-xs font-medium text-on-surface-variant uppercase tracking-wider">{t('landing.guru.filterAvailability')}</label>
                    <div className="flex gap-2">
                      {[
                        { value: 'available', label: t('landing.guru.available') },
                        { value: 'busy', label: t('landing.guru.busy') },
                      ].map((opt) => (
                        <button
                          key={opt.value}
                          onClick={() => setFilterAvailability(filterAvailability === opt.value ? '' : opt.value)}
                          className={cn(
                            'flex-1 rounded-lg border px-3 py-1.5 text-sm transition-colors',
                            filterAvailability === opt.value
                              ? 'border-indigo-500/50 bg-indigo-500/10 text-indigo-400'
                              : 'border-border text-muted hover:border-indigo-500/30'
                          )}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </aside>

              <div className="flex-1 min-w-0">
                {loading ? (
                  <div className="grid gap-4 sm:grid-cols-2">
                    {Array.from({ length: 6 }).map((_, i) => <SkeletonCard key={i} />)}
                  </div>
                ) : teachers.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-20 text-center">
                    <div className="mb-4 flex h-20 w-20 items-center justify-center rounded-full bg-surface-container-high">
                      <Search className="h-8 w-8 text-muted" />
                    </div>
                    <h3 className="text-lg font-semibold text-on-surface">{t('landing.guru.comingSoon')}</h3>
                    <p className="mt-1 text-sm text-on-surface-variant">
                      {hasActiveFilters
                        ? t('landing.guru.emptyFiltered')
                        : t('landing.guru.emptyRecruiting')}
                    </p>
                    {hasActiveFilters && (
                      <Button variant="outline" className="mt-4" onClick={clearFilters}>
                        {t('landing.guru.resetFilter')}
                      </Button>
                    )}
                  </div>
                ) : (
                  <>
                    <p className="mb-4 text-sm text-on-surface-variant">
                      {t('landing.guru.showingCount', { count: teachers.length })}
                      {hasActiveFilters && t('landing.guru.filteredSuffix')}
                    </p>
                    <div className="grid gap-4 sm:grid-cols-2">
                      {paginated.map((t) => (
                        <TeacherCard key={t.user_id} teacher={t} onDetail={setSelectedTeacher} />
                      ))}
                    </div>

                    {totalPages > 1 && (
                      <div className="mt-8 flex items-center justify-center gap-3">
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={page === 1}
                          onClick={() => setPage(p => Math.max(1, p - 1))}
                        >
                          <ChevronLeft className="h-4 w-4" />
                        </Button>
                        {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
                          <button
                            key={p}
                            onClick={() => setPage(p)}
                            className={cn(
                              'flex h-8 w-8 items-center justify-center rounded-lg text-sm font-medium transition-colors',
                              p === page
                                ? 'bg-indigo-500/20 text-indigo-400'
                                : 'text-muted hover:bg-surface-container-high hover:text-on-surface'
                            )}
                          >
                            {p}
                          </button>
                        ))}
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={page === totalPages}
                          onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                        >
                          <ChevronRight className="h-4 w-4" />
                        </Button>
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          </div>
        </section>
      </main>
      <Footer />

      {selectedTeacher && (
        <DetailModal teacher={selectedTeacher} onClose={() => setSelectedTeacher(null)} />
      )}
    </>
  )
}
