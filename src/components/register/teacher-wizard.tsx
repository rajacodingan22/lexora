'use client'

import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import {
  ArrowLeft,
  ArrowRight,
  CalendarDays,
  Check,
  Clock,
  Globe,
  GraduationCap,
  Mail,
  MapPin,
  Phone,
  School,
  User,
  X,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'
import type { TeacherRegistrationData } from '@/lib/auth'
import { useI18n } from '@/lib/i18n/client'
import { createClient } from '@/lib/supabase-client'

export interface TeacherWizardLanguage {
  code: string
  name: { id?: string; en?: string }
  native_name: string
}

export interface TeacherWizardProgram {
  id: string
  slug: string
  name: { id?: string; en?: string }
  language_code?: string
}

interface TeacherWizardProps {
  open: boolean
  initial: TeacherRegistrationData
  languages: TeacherWizardLanguage[]
  onClose: () => void
  onComplete: (data: TeacherRegistrationData) => void
}

const isValidEmail = (v: string) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v)

const DAYS = [
  { id: 'Senin', labelKey: 'teacher1.apply.dayMon' },
  { id: 'Selasa', labelKey: 'teacher1.apply.dayTue' },
  { id: 'Rabu', labelKey: 'teacher1.apply.dayWed' },
  { id: 'Kamis', labelKey: 'teacher1.apply.dayThu' },
  { id: 'Jumat', labelKey: 'teacher1.apply.dayFri' },
  { id: 'Sabtu', labelKey: 'teacher1.apply.daySat' },
  { id: 'Minggu', labelKey: 'teacher1.apply.daySun' },
]

const SESSION_DURATIONS = [30, 45, 60, 90, 120]

const EDUCATION_LEVELS = ['SMA/SMK', 'D3', 'S1', 'S2', 'S3']

const GENDERS = [
  { value: 'Laki-laki', labelKey: 'teacher1.apply.male' },
  { value: 'Perempuan', labelKey: 'teacher1.apply.female' },
]

const TEACHING_MODES = [
  { value: 'private', labelKey: 'teacher1.apply.modePrivate' },
  { value: 'group', labelKey: 'teacher1.apply.modeGroup' },
  { value: 'both', labelKey: 'teacher1.apply.modeBoth' },
]

const DEFAULT_TIMEZONE =
  (typeof Intl !== 'undefined' && Intl.DateTimeFormat().resolvedOptions().timeZone) || 'Asia/Jakarta'

function makeInitial(prev: TeacherRegistrationData): TeacherRegistrationData {
  return {
    fullName: prev.fullName || '',
    birthDate: prev.birthDate || '',
    gender: prev.gender || '',
    nationality: prev.nationality || 'Indonesia',
    phoneNumber: prev.phoneNumber || '',
    email: prev.email || '',
    address: prev.address || '',
    timezone: prev.timezone || DEFAULT_TIMEZONE,
    languages: prev.languages || [],
    levels: prev.levels || {},
    programs: prev.programs || [],
    highestEducation: prev.highestEducation || '',
    institution: prev.institution || '',
    major: prev.major || '',
    graduationYear: prev.graduationYear || '',
    hasTeachingExp: prev.hasTeachingExp || false,
    experienceYears: prev.experienceYears || '',
    experienceInstitution: prev.experienceInstitution || '',
    experienceDescription: prev.experienceDescription || '',
    teachingMode: prev.teachingMode || 'both',
    sessionDuration: prev.sessionDuration || 60,
    maxStudents: prev.maxStudents || 10,
    teachingDays: prev.teachingDays || [],
    teachingHours: prev.teachingHours || {},
  }
}

const TOTAL_STEPS = 11

export function TeacherWizard({ open, initial, languages, onClose, onComplete }: TeacherWizardProps) {
  const { t } = useI18n()
  const [step, setStep] = useState(0)
  const [direction, setDirection] = useState(1)
  const [draft, setDraft] = useState<TeacherRegistrationData>(makeInitial(initial))
  const [error, setError] = useState('')
  const [programs, setPrograms] = useState<TeacherWizardProgram[]>([])

  useEffect(() => {
    if (open) {
      setStep(0)
      setDirection(1)
      setError('')
      setDraft(makeInitial(initial))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  useEffect(() => {
    let alive = true
    createClient()
      .from('programs')
      .select('id, slug, name, language_code')
      .eq('is_active', true)
      .order('display_order')
      .then(({ data }) => {
        if (alive && data) setPrograms(data as TeacherWizardProgram[])
      })
    return () => {
      alive = false
    }
  }, [])

  const isLast = step === TOTAL_STEPS - 1

  const stepTitle = (i: number) => {
    switch (i) {
      case 0: return t('teacher1.apply.fullNameLabel')
      case 1: return t('teacher1.apply.birthDateLabel')
      case 2: return t('teacher1.apply.genderLabel')
      case 3: return t('teacher1.apply.phoneLabel')
      case 4: return t('teacher1.apply.emailLabel')
      case 5: return t('teacher1.apply.nationalityLabel')
      case 6: return t('teacher1.apply.languagesLabel')
      case 7: return t('teacher1.apply.educationSectionTitle')
      case 8: return t('teacher1.apply.teachingExpLabel')
      case 9: return t('teacher1.apply.programsLabel')
      default: return t('teacher1.apply.scheduleTitle')
    }
  }

  const stepHint = (i: number) => {
    switch (i) {
      case 0: return t('public.daftar.wiz.nameHint')
      case 1: return t('public.daftar.wiz.birthHint')
      case 2: return t('public.daftar.wiz.genderHint')
      case 3: return t('public.daftar.wiz.phoneHint')
      case 4: return t('public.daftar.wiz.emailHint')
      case 6: return t('public.daftar.wiz.langHint')
      case 8: return t('public.daftar.wiz.expHint')
      case 9: return t('public.daftar.wiz.programHint')
      case 10: return t('public.daftar.wiz.scheduleHint')
      default: return t('public.daftar.wiz.optionalHint')
    }
  }

  const stepIcon = () => {
    switch (step) {
      case 0: return <User className="size-5" aria-hidden="true" />
      case 1: return <CalendarDays className="size-5" aria-hidden="true" />
      case 2: return <User className="size-5" aria-hidden="true" />
      case 3: return <Phone className="size-5" aria-hidden="true" />
      case 4: return <Mail className="size-5" aria-hidden="true" />
      case 5: return <MapPin className="size-5" aria-hidden="true" />
      case 6: return <Globe className="size-5" aria-hidden="true" />
      case 7: return <School className="size-5" aria-hidden="true" />
      case 8: return <GraduationCap className="size-5" aria-hidden="true" />
      case 9: return <Globe className="size-5" aria-hidden="true" />
      default: return <Clock className="size-5" aria-hidden="true" />
    }
  }

  const set = <K extends keyof TeacherRegistrationData>(key: K, value: TeacherRegistrationData[K]) => {
    setDraft((d) => ({ ...d, [key]: value }))
    setError('')
  }

  const currentIsValid = () => {
    switch (step) {
      case 0: return draft.fullName.trim().length > 0
      case 1: return draft.birthDate.trim().length > 0
      case 2: return draft.gender.trim().length > 0 || draft.nationality.trim().length > 0
      case 3: return draft.phoneNumber.trim().length > 0
      case 4: return isValidEmail(draft.email)
      case 5: return true
      case 6: return draft.languages.length > 0
      case 7: return (
        draft.highestEducation.trim().length > 0 &&
        draft.institution.trim().length > 0 &&
        draft.major.trim().length > 0 &&
        draft.graduationYear.trim().length > 0
      )
      case 8: {
        if (!draft.hasTeachingExp) return true
        return draft.experienceYears.trim().length > 0
      }
      case 9: return true
      default: return draft.teachingDays.length > 0
    }
  }

  function go(next: number) {
    if (next > step && !currentIsValid()) {
      setError(t('public.daftar.wiz.required'))
      return
    }
    setError('')
    setDirection(next > step ? 1 : -1)
    setStep(next)
  }

  function finish() {
    if (!currentIsValid()) {
      setError(t('public.daftar.wiz.required'))
      return
    }
    onComplete({ ...makeInitial(draft), languages: [...draft.languages] })
  }

  const toggleInArray = <K extends 'languages' | 'programs' | 'teachingDays'>(key: K, value: string) => {
    const list = draft[key] as string[]
    const has = list.includes(value)
    set(key, (has ? list.filter((x) => x !== value) : [...list, value]) as TeacherRegistrationData[K])
    setError('')
  }

  const renderSelect = (
    label: string,
    value: string,
    onChange: (v: string) => void,
    options: { value: string; label: string }[],
    placeholder = t('public.daftar.wiz.selectPlaceholder'),
    required = true,
  ) => (
    <div className="space-y-1.5">
      <Label required={required}>{label}</Label>
      <select
        className={cn(
          'flex h-11 w-full rounded-lg border bg-surface-container-lowest px-3.5 py-2 text-sm text-on-surface',
          'transition-all hover:border-border-strong focus:outline-none focus:ring-2 focus:ring-ring focus:border-primary',
          'border-border'
        )}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        <option value="">{placeholder}</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </div>
  )

  const renderStep = () => {
    switch (step) {
      case 0:
        return (
          <div className="space-y-4">
            <Input
              label={t('public.daftar.teacherFullName')}
              required
              autoComplete="name"
              value={draft.fullName}
              onChange={(e) => set('fullName', e.target.value)}
            />
          </div>
        )
      case 1:
        return (
          <div className="space-y-4">
            <Input
              label={t('public.daftar.teacherBirthDate')}
              required
              type="date"
              value={draft.birthDate}
              onChange={(e) => set('birthDate', e.target.value)}
            />
          </div>
        )
      case 2:
        return (
          <div className="space-y-4">
            <Label required>{t('public.daftar.teacherGender')}</Label>
            <div className="grid grid-cols-2 gap-2">
              {GENDERS.map((g) => {
                const selected = draft.gender === g.value
                return (
                  <button
                    key={g.value}
                    type="button"
                    onClick={() => set('gender', g.value)}
                    className={cn(
                      'rounded-xl border px-4 py-3 transition-all text-sm font-medium',
                      selected
                        ? 'border-primary bg-primary-soft ring-2 ring-primary/25 text-on-surface'
                        : 'border-border bg-surface-container-low text-on-surface-variant'
                    )}
                  >
                    {t(g.labelKey)}
                  </button>
                )
              })}
            </div>
          </div>
        )
      case 3:
        return (
          <div className="space-y-4">
            <Input
              label={t('public.daftar.teacherPhone')}
              required
              type="tel"
              autoComplete="tel"
              value={draft.phoneNumber}
              onChange={(e) => set('phoneNumber', e.target.value)}
            />
          </div>
        )
      case 4:
        return (
          <div className="space-y-4">
            <Input
              label={t('public.daftar.teacherEmail')}
              required
              type="email"
              autoComplete="email"
              value={draft.email}
              onChange={(e) => set('email', e.target.value)}
            />
          </div>
        )
      case 5:
        return (
          <div className="space-y-4">
            {renderSelect(
              t('public.daftar.teacherCountry'),
              draft.nationality,
              (v) => set('nationality', v),
              [
                { value: 'Indonesia', label: 'Indonesia' },
                { value: 'Malaysia', label: 'Malaysia' },
                { value: 'Singapore', label: 'Singapore' },
                { value: 'Thailand', label: 'Thailand' },
                { value: 'Vietnam', label: 'Vietnam' },
                { value: 'Filipina', label: 'Filipina' },
                { value: 'Tiongkok', label: 'Tiongkok' },
                { value: 'Jepang', label: 'Jepang' },
                { value: 'Korea Selatan', label: 'Korea Selatan' },
                { value: 'India', label: 'India' },
                { value: 'Australia', label: 'Australia' },
                { value: 'Amerika Serikat', label: 'Amerika Serikat' },
                { value: 'Inggris', label: 'Inggris' },
                { value: 'Belanda', label: 'Belanda' },
                { value: 'Mesir', label: 'Mesir' },
                { value: 'Arab Saudi', label: 'Arab Saudi' },
              ],
              t('public.daftar.teacherCountryPlaceholder'),
            )}
            <Textarea
              label={t('public.daftar.teacherAddress')}
              placeholder={t('public.daftar.teacherAddressPlaceholder')}
              value={draft.address}
              onChange={(e) => set('address', e.target.value)}
            />
            <Input
              label={t('public.daftar.teacherTimezone')}
              value={draft.timezone}
              onChange={(e) => set('timezone', e.target.value)}
              hint={t('public.daftar.teacherTimezoneHint')}
            />
          </div>
        )
      case 6:
        return (
          <div>
            <p className="mb-3 text-sm text-on-surface-variant">{t('public.daftar.teacherLanguagesHint')}</p>
            <div className="grid max-h-56 grid-cols-1 gap-2 overflow-y-auto sm:grid-cols-2">
              {languages.map((lang) => {
                const checked = draft.languages.includes(lang.code)
                return (
                  <button
                    key={lang.code}
                    type="button"
                    onClick={() => toggleInArray('languages', lang.code)}
                    className={cn(
                      'flex items-center justify-between gap-2 rounded-xl border px-4 py-3 text-left transition-all',
                      checked
                        ? 'border-primary bg-primary-soft ring-2 ring-primary/25'
                        : 'border-border bg-surface-container-low hover:border-primary/50'
                    )}
                  >
                    <span className="flex min-w-0 items-center gap-2 text-sm font-medium text-on-surface">
                      <span className={cn('flex size-5 shrink-0 items-center justify-center rounded-md border', checked ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-surface-container-lowest')}>
                        {checked && <Check className="size-3.5" aria-hidden="true" />}
                      </span>
                      <span className="truncate">{lang.name?.id || lang.name?.en || lang.native_name}</span>
                    </span>
                  </button>
                )
              })}
            </div>
          </div>
        )
      case 7:
        return (
          <div className="space-y-4">
            {renderSelect(
              t('public.daftar.teacherEducationLevel'),
              draft.highestEducation,
              (v) => set('highestEducation', v),
              EDUCATION_LEVELS.map((l) => ({ value: l, label: l === 'SMA/SMK' ? t('teacher1.apply.educationSMA') : l })),
            )}
            <Input
              label={t('public.daftar.teacherInstitution')}
              required
              value={draft.institution}
              onChange={(e) => set('institution', e.target.value)}
            />
            <Input
              label={t('public.daftar.teacherMajor')}
              required
              value={draft.major}
              onChange={(e) => set('major', e.target.value)}
            />
            <Input
              label={t('public.daftar.teacherGradYear')}
              required
              type="number"
              min={1950}
              max={2099}
              value={draft.graduationYear}
              onChange={(e) => set('graduationYear', e.target.value)}
            />
          </div>
        )
      case 8:
        return (
          <div className="space-y-4">
            <button
              type="button"
              className={cn(
                'flex w-full items-center justify-between rounded-xl border px-4 py-3 text-left transition-all',
                draft.hasTeachingExp
                  ? 'border-secondary bg-secondary/15 ring-2 ring-secondary/25'
                  : 'border-border bg-surface-container-low'
              )}
              onClick={() => set('hasTeachingExp', !draft.hasTeachingExp)}
            >
              <span className="text-sm font-medium text-on-surface">{t('public.daftar.teacherExpToggle')}</span>
              <span className={cn('relative h-6 w-11 shrink-0 rounded-full transition-colors', draft.hasTeachingExp ? 'bg-secondary' : 'bg-surface-container-highest')}>
                <span className={cn('absolute top-0.5 size-5 rounded-full bg-white shadow-sm transition-transform', draft.hasTeachingExp ? 'left-[22px]' : 'left-0.5')} />
              </span>
            </button>
            {draft.hasTeachingExp && (
              <div className="space-y-4 rounded-xl border border-border bg-surface-container-low p-4 animate-fade-in">
                <Input
                  label={t('public.daftar.teacherExpYears')}
                  required
                  type="number"
                  min={0}
                  max={50}
                  value={draft.experienceYears}
                  onChange={(e) => set('experienceYears', e.target.value)}
                />
                <Input
                  label={t('public.daftar.teacherExpInstitution')}
                  value={draft.experienceInstitution}
                  onChange={(e) => set('experienceInstitution', e.target.value)}
                />
                <Textarea
                  label={t('public.daftar.teacherExpDescription')}
                  value={draft.experienceDescription}
                  onChange={(e) => set('experienceDescription', e.target.value)}
                />
              </div>
            )}
          </div>
        )
      case 9: {
        const anyPrograms = programs.length > 0
        return (
          <div>
            {anyPrograms ? (
              <>
                <p className="mb-3 text-sm text-on-surface-variant">{t('public.daftar.teacherProgramsHint')}</p>
                <div className="max-h-56 space-y-1.5 overflow-y-auto">
                  {programs.map((p) => {
                    const label = p.name?.id || p.name?.en || p.slug
                    const checked = draft.programs.includes(p.slug)
                    return (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => toggleInArray('programs', p.slug)}
                        className={cn(
                          'flex w-full items-center justify-between gap-2 rounded-xl border px-4 py-2.5 text-left transition-all',
                          checked
                            ? 'border-primary bg-primary-soft ring-2 ring-primary/25'
                            : 'border-border bg-surface-container-low hover:border-primary/50'
                        )}
                      >
                        <span className="truncate text-sm font-medium text-on-surface">{label}</span>
                        <span className={cn('flex size-5 shrink-0 items-center justify-center rounded-md border', checked ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-surface-container-lowest')}>
                          {checked && <Check className="size-3.5" aria-hidden="true" />}
                        </span>
                      </button>
                    )
                  })}
                </div>
              </>
            ) : (
              <p className="text-sm text-on-surface-variant">{t('public.daftar.teacherProgramsNone')}</p>
            )}
          </div>
        )
      }
      default:
        return (
          <div className="space-y-4">
            <div>
              <Label required>{t('public.daftar.teacherMode')}</Label>
              <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-3">
                {TEACHING_MODES.map((m) => {
                  const selected = draft.teachingMode === m.value
                  return (
                    <button
                      key={m.value}
                      type="button"
                      onClick={() => set('teachingMode', m.value)}
                      className={cn(
                        'rounded-xl border px-3 py-2.5 text-sm font-medium transition-all',
                        selected
                          ? 'border-primary bg-primary-soft ring-2 ring-primary/25 text-on-surface'
                          : 'border-border bg-surface-container-low text-on-surface-variant'
                      )}
                    >
                      {t(m.labelKey)}
                    </button>
                  )
                })}
              </div>
            </div>
            {renderSelect(
              t('public.daftar.teacherSessionDuration'),
              String(draft.sessionDuration),
              (v) => set('sessionDuration', Number(v)),
              SESSION_DURATIONS.map((d) => ({ value: String(d), label: t('teacher1.apply.optionMinutes', { count: d }) })),
            )}
            <Input
              label={t('public.daftar.teacherMaxStudents')}
              required
              type="number"
              min={1}
              max={100}
              value={String(draft.maxStudents)}
              onChange={(e) => set('maxStudents', parseInt(e.target.value) || 0)}
            />
            <div>
              <Label required>{t('public.daftar.teacherDays')}</Label>
              <div className="mt-2 grid grid-cols-4 gap-2 sm:grid-cols-7">
                {DAYS.map((day) => {
                  const selected = draft.teachingDays.includes(day.id)
                  return (
                    <button
                      key={day.id}
                      type="button"
                      onClick={() => toggleInArray('teachingDays', day.id)}
                      className={cn(
                        'rounded-lg py-2 text-xs font-medium transition-all',
                        selected
                          ? 'bg-primary text-primary-foreground shadow-sm'
                          : 'bg-surface-container-low text-on-surface-variant hover:bg-surface hover:text-on-surface'
                      )}
                    >
                      {t(day.labelKey)}
                    </button>
                  )
                })}
              </div>
            </div>
          </div>
        )
    }
  }

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/70 p-4 backdrop-blur-md"
      role="dialog"
      aria-modal="true"
      aria-labelledby="teacher-wizard-title"
    >
      <motion.div
        initial={{ scale: 0.92, y: 28, opacity: 0 }}
        animate={{ scale: 1, y: 0, opacity: 1 }}
        exit={{ scale: 0.95, y: 12, opacity: 0 }}
        transition={{ type: 'spring', damping: 24, stiffness: 280 }}
        className="relative flex max-h-[calc(100dvh-2rem)] w-full max-w-lg flex-col overflow-hidden rounded-3xl border border-border bg-background shadow-2xl"
      >
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 top-0 h-40 opacity-40"
          style={{
            background:
              'radial-gradient(circle at 20% 0%, oklch(0.70 0.19 280 / 0.28), transparent 55%), radial-gradient(circle at 90% 0%, oklch(0.70 0.16 180 / 0.22), transparent 55%)',
          }}
        />

        <button
          type="button"
          onClick={onClose}
          className="absolute right-4 top-4 z-10 rounded-xl p-2 text-muted transition-colors hover:bg-surface-hover hover:text-on-surface"
          aria-label={t('public.daftar.closeTeacherDetails')}
        >
          <X className="size-5" aria-hidden="true" />
        </button>

        <div className="relative flex-1 overflow-y-auto px-6 pb-6 pt-7 sm:px-8">
          <div className="pr-10">
            <div className="mb-3 inline-flex size-11 items-center justify-center rounded-2xl bg-secondary/15 text-secondary">
              <GraduationCap className="size-6" aria-hidden="true" />
            </div>
            <h2 id="teacher-wizard-title" className="text-2xl font-extrabold tracking-tight text-on-surface">
              {t('public.daftar.wiz.title')}
            </h2>
            <p className="mt-1 text-sm text-on-surface-variant">{t('public.daftar.wiz.subtitle')}</p>
          </div>

          <div className="mb-6 mt-6">
            <div className="mb-2 flex items-center justify-between text-xs font-medium">
              <span className="text-on-surface-variant">{t('public.daftar.wiz.step')} {step + 1} / {TOTAL_STEPS}</span>
              <span className="text-on-surface-variant">{stepTitle(step)}</span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-surface-container-low">
              <motion.div
                className="btn-gradient h-full rounded-full"
                initial={false}
                animate={{ width: `${((step + 1) / TOTAL_STEPS) * 100}%` }}
                transition={{ type: 'spring', damping: 30, stiffness: 320 }}
              />
            </div>
          </div>

          <div className="space-y-4">
            <AnimatePresence mode="wait" custom={direction}>
              <motion.div
                key={step}
                custom={direction}
                initial={{ opacity: 0, x: direction * 64, scale: 0.98 }}
                animate={{ opacity: 1, x: 0, scale: 1 }}
                exit={{ opacity: 0, x: -direction * 40, scale: 0.98 }}
                transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
              >
                {error && (
                  <p role="alert" className="mb-2 text-sm font-medium text-destructive">
                    {error}
                  </p>
                )}
                <div className="rounded-2xl border border-border bg-surface-container-lowest p-4 sm:p-5">
                  <div className="mb-3 flex items-center gap-2">
                    <span className="flex size-8 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                      {stepIcon()}
                    </span>
                    <p className="text-sm text-on-surface-variant">{stepHint(step)}</p>
                  </div>
                  {renderStep()}
                </div>
              </motion.div>
            </AnimatePresence>

            <div className="flex items-center justify-between gap-3 pt-1">
              <Button type="button" variant="ghost" size="lg" onClick={() => (step === 0 ? onClose() : go(step - 1))}>
                <ArrowLeft className="size-4" aria-hidden="true" />
                {step === 0 ? t('public.daftar.wiz.backToForm') : t('public.daftar.wiz.back')}
              </Button>
              {isLast ? (
                <Button type="button" variant="gradient" size="lg" onClick={finish}>
                  {t('public.daftar.wiz.finish')}
                  <ArrowRight className="size-4" aria-hidden="true" />
                </Button>
              ) : (
                <Button type="button" variant="gradient" size="lg" onClick={() => go(step + 1)}>
                  {t('public.daftar.wiz.next')}
                  <ArrowRight className="size-4" aria-hidden="true" />
                </Button>
              )}
            </div>
          </div>
        </div>
      </motion.div>
    </div>
  )
}