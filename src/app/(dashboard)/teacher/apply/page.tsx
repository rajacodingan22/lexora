'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { ImageUpload } from '@/components/ui/image-upload'
import { useAuth } from '@/lib/auth-context'
import { signOut } from '@/lib/auth'
import { createClient } from '@/lib/supabase-client'
import { cn } from '@/lib/utils'
import { Flag } from '@/components/ui/flag'
import { useI18n } from '@/lib/i18n/client'
import {
  ChevronLeft, ChevronRight, Check, Save,
  FileText, AlertCircle, CheckCircle2, XCircle,
  Clock, GraduationCap, Globe, Calendar,
  User,
} from 'lucide-react'
import type { Language, LanguageLevel } from '@/types'

// ─── Constants ───────────────────────────────────────────────────────────────

const DAYS = [
  { id: 'Senin', labelKey: 'teacher1.apply.dayMon' },
  { id: 'Selasa', labelKey: 'teacher1.apply.dayTue' },
  { id: 'Rabu', labelKey: 'teacher1.apply.dayWed' },
  { id: 'Kamis', labelKey: 'teacher1.apply.dayThu' },
  { id: 'Jumat', labelKey: 'teacher1.apply.dayFri' },
  { id: 'Sabtu', labelKey: 'teacher1.apply.daySat' },
  { id: 'Minggu', labelKey: 'teacher1.apply.daySun' },
]

const PROGRAM_OPTIONS = [
  'Conversation', 'MUN', 'TOEFL', 'IELTS', 'TOEIC',
  'Business English', 'Public Speaking', 'Debate',
  'BIPA', 'JLPT', 'TOPIK', 'Grammar', 'UTBK',
]

const SESSION_DURATIONS = [30, 45, 60, 90, 120]

const EDUCATION_LEVELS = [
  { value: 'SMA/SMK', label: 'SMA / SMK' },
  { value: 'D3', label: 'D3' },
  { value: 'S1', label: 'S1' },
  { value: 'S2', label: 'S2' },
  { value: 'S3', label: 'S3' },
]

const GENDER_OPTIONS = [
  { value: 'Laki-laki', labelKey: 'teacher1.apply.male' },
  { value: 'Perempuan', labelKey: 'teacher1.apply.female' },
]

const TEACHING_MODES = [
  { value: 'private', labelKey: 'teacher1.apply.modePrivate' },
  { value: 'group', labelKey: 'teacher1.apply.modeGroup' },
  { value: 'both', labelKey: 'teacher1.apply.modeBoth' },
]

// ─── Types ───────────────────────────────────────────────────────────────────

interface ApplicationData {
  id?: string
  full_name: string
  birth_date: string
  gender: string
  nationality: string
  phone_number: string
  email: string
  address: string
  timezone: string
  bio: string
  self_intro: string
  motivation: string
  highest_education: string
  institution: string
  major: string
  graduation_year: string
  has_teaching_exp: boolean
  experience_years: string
  experience_institution: string
  experience_description: string
  languages: string[]
  programs: string[]
  levels: Record<string, string[]>
  teaching_days: string[]
  teaching_hours: Record<string, string>
  session_duration: number
  max_students_per_class: number
  teaching_mode: string
  documents: { name: string; url: string }[]
  agreed_terms: boolean
  agreed_policy: boolean
  status: string
  admin_notes: string
}

const defaultFormData: ApplicationData = {
  full_name: '',
  birth_date: '',
  gender: '',
  nationality: 'Indonesia',
  phone_number: '',
  email: '',
  address: '',
  timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Jakarta',
  bio: '',
  self_intro: '',
  motivation: '',
  highest_education: '',
  institution: '',
  major: '',
  graduation_year: '',
  has_teaching_exp: false,
  experience_years: '',
  experience_institution: '',
  experience_description: '',
  languages: [],
  programs: [],
  levels: {},
  teaching_days: [],
  teaching_hours: {},
  session_duration: 60,
  max_students_per_class: 10,
  teaching_mode: 'both',
  documents: [],
  agreed_terms: false,
  agreed_policy: false,
  status: 'draft',
  admin_notes: '',
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function TeacherApplyPage() {
  const { user, loading: authLoading } = useAuth()
  const router = useRouter()
  const supabase = createClient()
  const { t } = useI18n()

  const STEPS = [
    { id: 1, label: t('teacher1.apply.step1'), icon: User },
    { id: 2, label: t('teacher1.apply.step2'), icon: GraduationCap },
    { id: 3, label: t('teacher1.apply.step3'), icon: Globe },
    { id: 4, label: t('teacher1.apply.step4'), icon: Clock },
    { id: 5, label: t('teacher1.apply.step5'), icon: FileText },
  ]

  // ── Core state ──────────────────────────────────────────────────────────
  const [step, setStep] = useState(1)
  const [formData, setFormData] = useState<ApplicationData>(defaultFormData)
  const [applicationId, setApplicationId] = useState<string | null>(null)
  const [existingStatus, setExistingStatus] = useState<string | null>(null)

  // ── Loading & error ─────────────────────────────────────────────────────
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [savingDraft, setSavingDraft] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [submitSuccess, setSubmitSuccess] = useState(false)

  // ── Fetched data ────────────────────────────────────────────────────────
  const [languages, setLanguages] = useState<Language[]>([])
  const [levelMap, setLevelMap] = useState<Record<string, LanguageLevel[]>>({})
  const [allLevels, setAllLevels] = useState<LanguageLevel[]>([])

  // ── Load existing application & reference data ──────────────────────────
  useEffect(() => {
    if (authLoading || !user) return
    loadInitialData()
  }, [authLoading, user])

  async function loadInitialData() {
    setLoading(true)
    try {
      // Fetch reference data
      const [langRes, levelsRes] = await Promise.all([
        supabase.from('languages').select('*').eq('is_active', true).order('sort_order'),
        supabase.from('language_levels').select('*').eq('is_active', true).order('sort_order'),
      ])

      if (langRes.data) {
        setLanguages(langRes.data as Language[])
      }
      if (levelsRes.data) {
        const levels = levelsRes.data as LanguageLevel[]
        setAllLevels(levels)
        // Build map of language_code -> levels
        const map: Record<string, LanguageLevel[]> = {}
        for (const lv of levels) {
          if (!map[lv.language_code]) map[lv.language_code] = []
          map[lv.language_code].push(lv)
        }
        setLevelMap(map)
      }

      // Check for existing application
      const { data: existing } = await supabase
        .from('teacher_applications')
        .select('*')
        .eq('user_id', user!.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (existing) {
        const app = existing as any
        setApplicationId(app.id)
        setExistingStatus(app.status)

        // Pre-fill form with existing data (for drafts / needs_revision)
        if (app.status === 'draft' || app.status === 'needs_revision') {
          setFormData({
            full_name: app.full_name || user?.display_name || '',
            birth_date: app.birth_date || '',
            gender: app.gender || '',
            nationality: app.nationality || 'Indonesia',
            phone_number: app.phone_number || user?.phone_number || '',
            email: app.email || user?.email || '',
            address: app.address || '',
            timezone: app.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Jakarta',
            bio: app.bio || '',
            self_intro: app.self_intro || '',
            motivation: app.motivation || '',
            highest_education: app.highest_education || '',
            institution: app.institution || '',
            major: app.major || '',
            graduation_year: app.graduation_year || '',
            has_teaching_exp: app.has_teaching_exp ?? false,
            experience_years: app.experience_years || '',
            experience_institution: app.experience_institution || '',
            experience_description: app.experience_description || '',
            languages: app.languages || [],
            programs: app.programs || [],
            levels: app.levels || {},
            teaching_days: app.teaching_days || [],
            teaching_hours: app.teaching_hours || {},
            session_duration: app.session_duration ?? 60,
            max_students_per_class: app.max_students_per_class ?? 10,
            teaching_mode: app.teaching_mode || 'both',
            documents: app.documents || [],
            agreed_terms: app.agreed_terms || false,
            agreed_policy: app.agreed_policy || false,
            status: app.status,
            admin_notes: app.admin_notes || '',
          })
        } else {
          // For non-editable statuses, still pre-fill from user data
          setFormData((prev) => ({
            ...prev,
            full_name: user?.display_name || '',
            phone_number: user?.phone_number || '',
            email: user?.email || '',
          }))
        }
      } else {
        // No existing application — pre-fill from user profile
        setFormData((prev) => ({
          ...prev,
          full_name: user?.display_name || '',
          phone_number: user?.phone_number || '',
          email: user?.email || '',
        }))
      }
    } catch (err) {
      console.error('Failed to load initial data', err)
    } finally {
      setLoading(false)
    }
  }

  // ── Field updater ───────────────────────────────────────────────────────
  const updateField = useCallback(<K extends keyof ApplicationData>(
    key: K,
    value: ApplicationData[K]
  ) => {
    setFormData((prev) => ({ ...prev, [key]: value }))
    // Clear error for this field
    if (errors[key]) {
      setErrors((prev) => {
        const next = { ...prev }
        delete next[key]
        return next
      })
    }
  }, [errors])

  // ── Validation ──────────────────────────────────────────────────────────
  function validateStep(s: number): boolean {
    const newErrors: Record<string, string> = {}

    switch (s) {
      case 1: {
        if (!formData.full_name.trim()) newErrors.full_name = t('teacher1.apply.errFullName')
        if (!formData.birth_date) newErrors.birth_date = t('teacher1.apply.errBirthDate')
        if (!formData.gender) newErrors.gender = t('teacher1.apply.errGender')
        if (!formData.nationality.trim()) newErrors.nationality = t('teacher1.apply.errNationality')
        if (!formData.phone_number.trim()) newErrors.phone_number = t('teacher1.apply.errPhone')
        if (!formData.email.trim()) newErrors.email = t('teacher1.apply.errEmail')
        if (!formData.email.includes('@')) newErrors.email = t('teacher1.apply.errEmailFormat')
        if (!formData.timezone.trim()) newErrors.timezone = t('teacher1.apply.errTimezone')
        break
      }
      case 2: {
        if (!formData.bio.trim()) newErrors.bio = t('teacher1.apply.errBio')
        if (!formData.self_intro.trim()) newErrors.self_intro = t('teacher1.apply.errSelfIntro')
        if (!formData.motivation.trim()) newErrors.motivation = t('teacher1.apply.errMotivation')
        if (!formData.highest_education) newErrors.highest_education = t('teacher1.apply.errEducation')
        if (!formData.institution.trim()) newErrors.institution = t('teacher1.apply.errInstitution')
        if (!formData.major.trim()) newErrors.major = t('teacher1.apply.errMajor')
        if (!formData.graduation_year.trim()) newErrors.graduation_year = t('teacher1.apply.errGradYear')
        break
      }
      case 3: {
        if (formData.has_teaching_exp) {
          if (!formData.experience_years.trim()) newErrors.experience_years = t('teacher1.apply.errExperienceYears')
          if (!formData.experience_institution.trim()) newErrors.experience_institution = t('teacher1.apply.errExperienceInstitution')
          if (!formData.experience_description.trim()) newErrors.experience_description = t('teacher1.apply.errExperienceDesc')
        }
        if (formData.languages.length === 0) newErrors.languages = t('teacher1.apply.errLanguages')
        if (formData.programs.length === 0) newErrors.programs = t('teacher1.apply.errPrograms')
        break
      }
      case 4: {
        // Validate levels for selected languages
        for (const langCode of formData.languages) {
          const selectedLevels = formData.levels[langCode] || []
          if (selectedLevels.length === 0) {
            const lang = languages.find((l) => l.code === langCode)
            newErrors[`levels_${langCode}`] = t('teacher1.apply.errLevelsLang', { lang: lang?.native_name || langCode })
          }
        }
        if (formData.teaching_days.length === 0) newErrors.teaching_days = t('teacher1.apply.errTeachingDays')
        if (!formData.session_duration) newErrors.session_duration = t('teacher1.apply.errSessionDuration')
        if (!formData.max_students_per_class || formData.max_students_per_class < 1) {
          newErrors.max_students_per_class = t('teacher1.apply.errMaxStudents')
        }
        if (!formData.teaching_mode) newErrors.teaching_mode = t('teacher1.apply.errTeachingMode')
        break
      }
      case 5: {
        if (!formData.documents || formData.documents.length === 0 || !formData.documents[0].url) {
          newErrors.documents = t('teacher1.apply.errUploadCv')
        }
        if (!formData.agreed_terms) newErrors.agreed_terms = t('teacher1.apply.errAgreedTerms')
        if (!formData.agreed_policy) newErrors.agreed_policy = t('teacher1.apply.errAgreedPolicy')
        break
      }
    }

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  // ── Navigation ──────────────────────────────────────────────────────────
  function goNext() {
    if (validateStep(step)) {
      setStep((s) => Math.min(s + 1, 5))
    }
  }

  function goPrev() {
    setStep((s) => Math.max(s - 1, 1))
  }

  function goToStep(s: number) {
    // Allow going back without validation
    if (s < step) {
      setStep(s)
      return
    }
    // Going forward — validate all intermediate steps
    for (let i = step; i < s; i++) {
      if (!validateStep(i)) return
    }
    setStep(s)
  }

  // ── Save Draft ──────────────────────────────────────────────────────────
  async function handleSaveDraft() {
    if (!user) return
    setSavingDraft(true)
    try {
      const payload = {
        user_id: user.id,
        ...buildPayload(),
        status: 'draft',
      }

      if (applicationId) {
        await supabase
          .from('teacher_applications')
          .update({ ...payload, updated_at: new Date().toISOString() })
          .eq('id', applicationId)
      } else {
        const { data } = await supabase
          .from('teacher_applications')
          .insert(payload)
          .select('id')
          .single()
        if (data) {
          setApplicationId((data as any).id)
          setExistingStatus('draft')
        }
      }
    } catch (err) {
      console.error('Failed to save draft', err)
    } finally {
      setSavingDraft(false)
    }
  }

  // ── Submit ──────────────────────────────────────────────────────────────
  async function handleSubmit() {
    // Validate all steps
    for (let i = 1; i <= 5; i++) {
      if (!validateStep(i)) {
        setStep(i)
        return
      }
    }

    if (!user) return
    setSubmitting(true)

    try {
      const now = new Date().toISOString()
      const payload = {
        user_id: user.id,
        ...buildPayload(),
        status: 'pending_review',
        submitted_at: now,
      }

      let appId = applicationId

      if (applicationId) {
        await supabase
          .from('teacher_applications')
          .update({ ...payload, updated_at: now })
          .eq('id', applicationId)
      } else {
        const { data } = await supabase
          .from('teacher_applications')
          .insert(payload)
          .select('id')
          .single()
        if (data) {
          appId = (data as any).id
          setApplicationId(appId)
        }
      }

      // Update the users table with basic info
      await supabase
        .from('users')
        .update({
          display_name: formData.full_name,
          phone_number: formData.phone_number,
          birth_date: formData.birth_date,
          gender: formData.gender,
          nationality: formData.nationality,
          timezone: formData.timezone,
        })
        .eq('id', user.id)

      // Upsert into teachers table
      const { data: existingTeacher } = await supabase
        .from('teachers')
        .select('id')
        .eq('user_id', user.id)
        .single()

      const teacherPayload = {
        user_id: user.id,
        application_id: appId,
        headline: formData.full_name || null,
        bio: formData.bio,
        experience_years: formData.has_teaching_exp ? parseInt(formData.experience_years) || 0 : 0,
        highest_education: formData.highest_education,
        institution: formData.institution,
        major: formData.major,
        teaching_mode: formData.teaching_mode,
        max_students: formData.max_students_per_class,
        status: 'pending',
        availability: {
          days: formData.teaching_days,
          hours: formData.teaching_hours,
          session_duration: formData.session_duration,
        },
      }

      let teacherId: string | undefined = existingTeacher?.id

      if (existingTeacher) {
        await supabase
          .from('teachers')
          .update(teacherPayload)
          .eq('user_id', user.id)
      } else {
        const { data: inserted } = await supabase
          .from('teachers')
          .insert(teacherPayload)
          .select('id')
          .single()
        teacherId = inserted?.id
      }

      if (!teacherId) {
        setErrors({ _form: t('teacher1.apply.teacherProfileError') })
        return
      }

      // ── Sync teacher_languages ─────────────────────────────────────
      // Remove old, insert new
      await supabase
        .from('teacher_languages')
        .delete()
        .eq('teacher_id', teacherId)

      if (formData.languages.length > 0) {
        await supabase
          .from('teacher_languages')
          .insert(
            formData.languages.map((code) => ({
              teacher_id: teacherId,
              language_code: code,
              levels: formData.levels[code] || [],
              is_native: code === 'id',
            }))
          )
      }

      // ── Sync teacher_programs ──────────────────────────────────────
      // First get the program IDs that match the selected program names
      if (formData.programs.length > 0) {
        const { data: matchingPrograms } = await supabase
          .from('programs')
          .select('id, slug')
          .in('slug', formData.programs.map((p) => p.toLowerCase().replace(/\s+/g, '-')))

        if (matchingPrograms && matchingPrograms.length > 0) {
          await supabase
            .from('teacher_programs')
            .delete()
            .eq('teacher_id', teacherId)

          await supabase
            .from('teacher_programs')
            .insert(
              matchingPrograms.map((p: any) => ({
                teacher_id: teacherId,
                program_id: p.id,
              }))
            )
        }
      }

      setExistingStatus('pending_review')
      setSubmitSuccess(true)
    } catch (err) {
      console.error('Failed to submit application', err)
      setErrors({ _form: t('teacher1.apply.submitError') })
    } finally {
      setSubmitting(false)
    }
  }

  // ── Build DB payload from form data ─────────────────────────────────────
  function buildPayload() {
    return {
      full_name: formData.full_name,
      birth_date: formData.birth_date,
      gender: formData.gender,
      nationality: formData.nationality,
      phone_number: formData.phone_number,
      email: formData.email,
      address: formData.address,
      timezone: formData.timezone,
      bio: formData.bio,
      self_intro: formData.self_intro,
      motivation: formData.motivation,
      highest_education: formData.highest_education,
      institution: formData.institution,
      major: formData.major,
      graduation_year: formData.graduation_year,
      has_teaching_exp: formData.has_teaching_exp,
      experience_years: formData.experience_years,
      experience_institution: formData.experience_institution,
      experience_description: formData.experience_description,
      languages: formData.languages,
      programs: formData.programs,
      levels: formData.levels,
      teaching_days: formData.teaching_days,
      teaching_hours: formData.teaching_hours,
      session_duration: formData.session_duration,
      max_students_per_class: formData.max_students_per_class,
      teaching_mode: formData.teaching_mode,
      documents: formData.documents,
      agreed_terms: formData.agreed_terms,
      agreed_policy: formData.agreed_policy,
    }
  }

  // ── Loading state ───────────────────────────────────────────────────────
  if (loading || authLoading) {
    return <ApplicationSkeleton />
  }

  // ── Status-based views ──────────────────────────────────────────────────
  // If approved → redirect to dashboard
  if (existingStatus === 'approved') {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <div className="mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-success-soft">
          <CheckCircle2 className="h-10 w-10 text-success" />
        </div>
        <h1 className="text-2xl font-bold text-on-surface">{t('teacher1.apply.approvedTitle')}</h1>
        <p className="mt-2 text-on-surface-variant">
          {t('teacher1.apply.approvedDesc')}
        </p>
        <Button className="mt-6" onClick={() => router.push('/teacher/dashboard')}>
          {t('teacher1.apply.openDashboard')}
        </Button>
      </div>
    )
  }

  // If pending_review → show waiting message
  if (existingStatus === 'pending_review' && !submitSuccess) {
    return (
      <div className="mx-auto max-w-xl py-16">
        <PendingReviewCard />
        <p className="mt-4 text-center text-sm text-on-surface-variant">
          {t('teacher1.apply.pendingSignupHint')}
        </p>
      </div>
    )
  }

  // If rejected → show rejection
  if (existingStatus === 'rejected' && !submitSuccess) {
    return <RejectionCard formData={formData} onRestart={() => setExistingStatus('needs_revision')} />
  }

  // If submit was successful
  if (submitSuccess) {
    return <SuccessCard />
  }

  // ── Needs revision banner ───────────────────────────────────────────────
  const isRevision = existingStatus === 'needs_revision'

  // ── Render ──────────────────────────────────────────────────────────────
  return (
    <div className="mx-auto max-w-4xl">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-on-surface">
          {isRevision ? t('teacher1.apply.titleRevision') : t('teacher1.apply.title')}
        </h1>
        <p className="mt-1 text-on-surface-variant">
          {isRevision
            ? t('teacher1.apply.descRevision')
            : t('teacher1.apply.desc')}
        </p>
      </div>

      {/* Admin notes (for needs_revision) */}
      {isRevision && formData.admin_notes && (
        <div className="mb-6 rounded-2xl border border-warning/30 bg-warning-soft p-4">
          <div className="flex items-start gap-3">
            <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-warning" />
            <div>
              <p className="text-sm font-semibold text-warning">{t('teacher1.apply.adminNotes')}</p>
              <p className="mt-1 text-sm text-on-surface-variant">{formData.admin_notes}</p>
            </div>
          </div>
        </div>
      )}

      {/* Global error */}
      {errors._form && (
        <div className="mb-6 rounded-lg bg-destructive-soft px-4 py-3 text-sm text-destructive">
          {errors._form}
        </div>
      )}

      {/* Progress indicator */}
      <div className="mb-8">
        <div className="flex items-center justify-between">
          {STEPS.map((s, idx) => (
            <div key={s.id} className="flex items-center">
              <button
                type="button"
                onClick={() => goToStep(s.id)}
                className={cn(
                  'flex items-center gap-2 text-sm font-medium transition-colors',
                  step === s.id
                    ? 'text-primary'
                    : step > s.id
                      ? 'text-success'
                      : 'text-on-surface-variant hover:text-on-surface'
                )}
              >
                <span
                  className={cn(
                    'flex h-8 w-8 items-center justify-center rounded-full border-2 text-xs font-bold transition-colors',
                    step === s.id
                      ? 'border-primary bg-primary-soft text-primary'
                      : step > s.id
                        ? 'border-success bg-success-soft text-success'
                        : 'border-border text-on-surface-variant'
                  )}
                >
                  {step > s.id ? <Check className="h-4 w-4" /> : s.id}
                </span>
                <span className="hidden sm:inline">{s.label}</span>
              </button>
              {idx < STEPS.length - 1 && (
                <div
                  className={cn(
                    'mx-2 h-px w-8 sm:w-16 transition-colors',
                    step > s.id ? 'bg-success' : 'bg-border'
                  )}
                />
              )}
            </div>
          ))}
        </div>

        {/* Mobile step label */}
        <p className="mt-3 text-center text-xs text-on-surface-variant sm:hidden">
          {t('teacher1.apply.stepIndicator', { current: step, total: 5, label: STEPS[step - 1].label })}
        </p>
      </div>

      {/* Form content */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            {step === 1 && <User className="h-5 w-5 text-primary" />}
            {step === 2 && <GraduationCap className="h-5 w-5 text-primary" />}
            {step === 3 && <Globe className="h-5 w-5 text-primary" />}
            {step === 4 && <Calendar className="h-5 w-5 text-primary" />}
            {step === 5 && <FileText className="h-5 w-5 text-primary" />}
            {STEPS[step - 1].label}
          </CardTitle>
          <CardDescription>
            {step === 1 && t('teacher1.apply.step1Desc')}
            {step === 2 && t('teacher1.apply.step2Desc')}
            {step === 3 && t('teacher1.apply.step3Desc')}
            {step === 4 && t('teacher1.apply.step4Desc')}
            {step === 5 && t('teacher1.apply.step5Desc')}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {step === 1 && <Step1Personal formData={formData} updateField={updateField} errors={errors} />}
          {step === 2 && <Step2AboutEducation formData={formData} updateField={updateField} errors={errors} />}
          {step === 3 && (
            <Step3ExperienceLanguages
              formData={formData}
              updateField={updateField}
              errors={errors}
              languages={languages}
            />
          )}
          {step === 4 && (
            <Step4ScheduleCapacity
              formData={formData}
              updateField={updateField}
              errors={errors}
              languages={languages}
              levelMap={levelMap}
              allLevels={allLevels}
            />
          )}
          {step === 5 && (
            <Step5DocumentsSubmit
              formData={formData}
              updateField={updateField}
              errors={errors}
              languages={languages}
              userId={user?.id || 'unknown'}
            />
          )}
        </CardContent>
      </Card>

      {/* Navigation buttons */}
      <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          {step > 1 && (
            <Button variant="outline" onClick={goPrev}>
              <ChevronLeft className="h-4 w-4" />
              {t('teacher1.apply.previous')}
            </Button>
          )}
        </div>
        <div className="flex items-center gap-3">
          <Button variant="ghost" onClick={handleSaveDraft} loading={savingDraft}>
            <Save className="h-4 w-4" />
            {t('teacher1.apply.saveDraft')}
          </Button>
          {step < 5 ? (
            <Button onClick={goNext}>
              {t('teacher1.apply.next')}
              <ChevronRight className="h-4 w-4" />
            </Button>
          ) : (
            <Button variant="gradient" onClick={handleSubmit} loading={submitting}>
              <CheckCircle2 className="h-4 w-4" />
              {isRevision ? t('teacher1.apply.resubmit') : t('teacher1.apply.submit')}
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Step 1: Informasi Pribadi ──────────────────────────────────────────────

function Step1Personal({
  formData,
  updateField,
  errors,
}: {
  formData: ApplicationData
  updateField: (k: keyof ApplicationData, v: any) => void
  errors: Record<string, string>
}) {
  const { t } = useI18n()

  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <Input
          label={t('teacher1.apply.fullNameLabel')}
          required
          placeholder={t('teacher1.apply.fullNamePlaceholder')}
          value={formData.full_name}
          onChange={(e) => updateField('full_name', e.target.value)}
          error={errors.full_name}
        />
        <Input
          label={t('teacher1.apply.birthDateLabel')}
          required
          type="date"
          value={formData.birth_date}
          onChange={(e) => updateField('birth_date', e.target.value)}
          error={errors.birth_date}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label required>{t('teacher1.apply.genderLabel')}</Label>
          <select
            className={cn(
              'flex h-11 w-full rounded-lg border bg-surface-container-lowest px-3.5 py-2 text-sm text-on-surface',
              'transition-all hover:border-border-strong focus:outline-none focus:ring-2 focus:ring-ring focus:border-primary',
              errors.gender ? 'border-destructive/60' : 'border-border'
            )}
            value={formData.gender}
            onChange={(e) => updateField('gender', e.target.value)}
          >
            <option value="">{t('teacher1.apply.genderPlaceholder')}</option>
            {GENDER_OPTIONS.map((g) => (
              <option key={g.value} value={g.value}>{t(g.labelKey)}</option>
            ))}
          </select>
          {errors.gender && <p className="text-xs text-destructive">{errors.gender}</p>}
        </div>
        <Input
          label={t('teacher1.apply.nationalityLabel')}
          required
          placeholder="Indonesia"
          value={formData.nationality}
          onChange={(e) => updateField('nationality', e.target.value)}
          error={errors.nationality}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Input
          label={t('teacher1.apply.phoneLabel')}
          required
          type="tel"
          placeholder={t('teacher1.apply.phonePlaceholder')}
          value={formData.phone_number}
          onChange={(e) => updateField('phone_number', e.target.value)}
          error={errors.phone_number}
        />
        <Input
          label={t('teacher1.apply.emailLabel')}
          required
          type="email"
          placeholder={t('teacher1.apply.emailPlaceholder')}
          value={formData.email}
          onChange={(e) => updateField('email', e.target.value)}
          error={errors.email}
        />
      </div>

      <div className="space-y-1.5">
        <Label>{t('teacher1.apply.addressLabel')}</Label>
        <Textarea
          placeholder={t('teacher1.apply.addressPlaceholder')}
          value={formData.address}
          onChange={(e) => updateField('address', e.target.value)}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Input
          label={t('teacher1.apply.timezoneLabel')}
          required
          value={formData.timezone}
          onChange={(e) => updateField('timezone', e.target.value)}
          error={errors.timezone}
          hint={t('teacher1.apply.timezoneHint')}
        />
      </div>
    </div>
  )
}

// ─── Step 2: Tentang Saya & Pendidikan ──────────────────────────────────────

function Step2AboutEducation({
  formData,
  updateField,
  errors,
}: {
  formData: ApplicationData
  updateField: (k: keyof ApplicationData, v: any) => void
  errors: Record<string, string>
}) {
  const { t } = useI18n()

  return (
    <div className="space-y-5">
      <div className="space-y-1.5">
        <Label required>{t('teacher1.apply.bioLabel')}</Label>
        <Textarea
          placeholder={t('teacher1.apply.bioPlaceholder')}
          maxLength={500}
          value={formData.bio}
          onChange={(e) => updateField('bio', e.target.value)}
          error={errors.bio}
        />
        <p className="text-xs text-on-surface-variant">{t('teacher1.apply.charCount', { count: formData.bio.length })}</p>
      </div>

      <div className="space-y-1.5">
        <Label required>{t('teacher1.apply.selfIntroLabel')}</Label>
        <Textarea
          placeholder={t('teacher1.apply.selfIntroPlaceholder')}
          value={formData.self_intro}
          onChange={(e) => updateField('self_intro', e.target.value)}
          error={errors.self_intro}
        />
      </div>

      <div className="space-y-1.5">
        <Label required>{t('teacher1.apply.motivationLabel')}</Label>
        <Textarea
          placeholder={t('teacher1.apply.motivationPlaceholder')}
          value={formData.motivation}
          onChange={(e) => updateField('motivation', e.target.value)}
          error={errors.motivation}
        />
      </div>

      <div className="border-t border-border pt-5">
        <h3 className="mb-4 text-sm font-semibold text-on-surface">{t('teacher1.apply.educationSectionTitle')}</h3>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label required>{t('teacher1.apply.educationLevelLabel')}</Label>
            <select
              className={cn(
                'flex h-11 w-full rounded-lg border bg-surface-container-lowest px-3.5 py-2 text-sm text-on-surface',
                'transition-all hover:border-border-strong focus:outline-none focus:ring-2 focus:ring-ring focus:border-primary',
                errors.highest_education ? 'border-destructive/60' : 'border-border'
              )}
              value={formData.highest_education}
              onChange={(e) => updateField('highest_education', e.target.value)}
            >
              <option value="">{t('teacher1.apply.educationLevelPlaceholder')}</option>
              {EDUCATION_LEVELS.map((el) => (
                <option key={el.value} value={el.value}>
                  {el.value === 'SMA/SMK' ? t('teacher1.apply.educationSMA') : el.label}
                </option>
              ))}
            </select>
            {errors.highest_education && <p className="text-xs text-destructive">{errors.highest_education}</p>}
          </div>
          <Input
            label={t('teacher1.apply.institutionLabel')}
            required
            placeholder={t('teacher1.apply.institutionPlaceholder')}
            value={formData.institution}
            onChange={(e) => updateField('institution', e.target.value)}
            error={errors.institution}
          />
        </div>

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <Input
            label={t('teacher1.apply.majorLabel')}
            required
            placeholder={t('teacher1.apply.majorPlaceholder')}
            value={formData.major}
            onChange={(e) => updateField('major', e.target.value)}
            error={errors.major}
          />
          <Input
            label={t('teacher1.apply.gradYearLabel')}
            required
            type="number"
            min="1950"
            max="2099"
            placeholder={t('teacher1.apply.gradYearPlaceholder')}
            value={formData.graduation_year}
            onChange={(e) => updateField('graduation_year', e.target.value)}
            error={errors.graduation_year}
          />
        </div>
      </div>
    </div>
  )
}

// ─── Step 3: Pengalaman & Bahasa ────────────────────────────────────────────

function Step3ExperienceLanguages({
  formData,
  updateField,
  errors,
  languages,
}: {
  formData: ApplicationData
  updateField: (k: keyof ApplicationData, v: any) => void
  errors: Record<string, string>
  languages: Language[]
}) {
  const { t } = useI18n()

  return (
    <div className="space-y-6">
      {/* Teaching Experience */}
      <div>
        <div className="flex items-center gap-3">
          <Label>{t('teacher1.apply.teachingExpLabel')}</Label>
          <button
            type="button"
            role="switch"
            aria-checked={formData.has_teaching_exp}
            onClick={() => updateField('has_teaching_exp', !formData.has_teaching_exp)}
            className={cn(
              'relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
              formData.has_teaching_exp ? 'bg-primary' : 'bg-surface-container-highest'
            )}
          >
            <span
              className={cn(
                'pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow-sm ring-0 transition-transform',
                formData.has_teaching_exp ? 'translate-x-5' : 'translate-x-0'
              )}
            />
          </button>
        </div>

        {formData.has_teaching_exp && (
          <div className="mt-4 space-y-4 rounded-lg border border-border bg-surface-container-low p-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Input
                label={t('teacher1.apply.experienceYearsLabel')}
                required
                placeholder={t('teacher1.apply.experienceYearsPlaceholder')}
                value={formData.experience_years}
                onChange={(e) => updateField('experience_years', e.target.value)}
                error={errors.experience_years}
              />
              <Input
                label={t('teacher1.apply.experienceInstitutionLabel')}
                required
                placeholder={t('teacher1.apply.experienceInstitutionPlaceholder')}
                value={formData.experience_institution}
                onChange={(e) => updateField('experience_institution', e.target.value)}
                error={errors.experience_institution}
              />
            </div>
            <div className="space-y-1.5">
              <Label required>{t('teacher1.apply.experienceDescLabel')}</Label>
              <Textarea
                placeholder={t('teacher1.apply.experienceDescPlaceholder')}
                value={formData.experience_description}
                onChange={(e) => updateField('experience_description', e.target.value)}
                error={errors.experience_description}
              />
            </div>
          </div>
        )}
      </div>

      {/* Languages */}
      <div>
        <Label required>{t('teacher1.apply.languagesLabel')}</Label>
        {errors.languages && <p className="mb-2 text-xs text-destructive">{errors.languages}</p>}
        <div className="mt-2 flex flex-wrap gap-2">
          {languages.map((lang) => {
            const selected = formData.languages.includes(lang.code)
            return (
              <button
                key={lang.code}
                type="button"
                onClick={() => {
                  const next = selected
                    ? formData.languages.filter((c) => c !== lang.code)
                    : [...formData.languages, lang.code]
                  updateField('languages', next)
                }}
                className={cn(
                  'rounded-full px-3.5 py-1.5 text-sm font-medium transition-all',
                  selected
                    ? 'bg-primary text-primary-foreground shadow-sm'
                    : 'bg-surface-container-low text-on-surface-variant hover:bg-surface hover:text-on-surface'
                )}
              >
                {lang.flag_emoji ? <Flag emoji={lang.flag_emoji} className="h-3.5" /> : null} {lang.native_name || lang.name?.en}
              </button>
            )
          })}
        </div>
      </div>

      {/* Programs */}
      <div>
        <Label required>{t('teacher1.apply.programsLabel')}</Label>
        {errors.programs && <p className="mb-2 text-xs text-destructive">{errors.programs}</p>}
        <div className="mt-2 flex flex-wrap gap-2">
          {PROGRAM_OPTIONS.map((prog) => {
            const selected = formData.programs.includes(prog)
            return (
              <button
                key={prog}
                type="button"
                onClick={() => {
                  const next = selected
                    ? formData.programs.filter((p) => p !== prog)
                    : [...formData.programs, prog]
                  updateField('programs', next)
                }}
                className={cn(
                  'rounded-full px-3.5 py-1.5 text-sm font-medium transition-all',
                  selected
                    ? 'bg-accent text-accent-foreground shadow-sm'
                    : 'bg-surface-container-low text-on-surface-variant hover:bg-surface hover:text-on-surface'
                )}
              >
                {prog}
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}

// ─── Step 4: Level, Jadwal & Kapasitas ──────────────────────────────────────

function Step4ScheduleCapacity({
  formData,
  updateField,
  errors,
  languages,
  levelMap,
  allLevels,
}: {
  formData: ApplicationData
  updateField: (k: keyof ApplicationData, v: any) => void
  errors: Record<string, string>
  languages: Language[]
  levelMap: Record<string, LanguageLevel[]>
  allLevels: LanguageLevel[]
}) {
  const { t } = useI18n()

  return (
    <div className="space-y-6">
      {/* Levels per selected language */}
      {formData.languages.length > 0 && (
        <div>
          <Label required>{t('teacher1.apply.levelsLabel')}</Label>
          <p className="mb-3 text-xs text-on-surface-variant">
            {t('teacher1.apply.levelsHint')}
          </p>
          <div className="space-y-3">
            {formData.languages.map((langCode) => {
              const lang = languages.find((l) => l.code === langCode)
              const levels = levelMap[langCode] || allLevels.filter((l) => l.language_code === langCode)
              const selectedLevels = formData.levels[langCode] || []
              const errorKey = `levels_${langCode}`

              return (
                <div
                  key={langCode}
                  className="rounded-lg border border-border bg-surface-container-low p-4"
                >
                  <p className="mb-2 text-sm font-semibold text-on-surface">
                    {lang?.flag_emoji ? <Flag emoji={lang.flag_emoji} className="h-3.5" /> : null} {lang?.native_name || langCode}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {levels.map((lv) => {
                      const isSelected = selectedLevels.includes(lv.code)
                      return (
                        <button
                          key={lv.id}
                          type="button"
                          onClick={() => {
                            const current = formData.levels[langCode] || []
                            const next = isSelected
                              ? current.filter((c) => c !== lv.code)
                              : [...current, lv.code]
                            updateField('levels', {
                              ...formData.levels,
                              [langCode]: next,
                            })
                          }}
                          className={cn(
                            'rounded-md px-3 py-1.5 text-xs font-medium transition-all border',
                            isSelected
                              ? 'bg-primary-soft text-primary border-primary/30'
                              : 'bg-surface-container-lowest text-on-surface-variant border-border hover:border-border-strong'
                          )}
                        >
                          {lv.code} — {lv.name?.id || lv.name?.en}
                        </button>
                      )
                    })}
                  </div>
                  {errors[errorKey] && (
                    <p className="mt-1 text-xs text-destructive">{errors[errorKey]}</p>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Teaching Days */}
      <div>
        <Label required>{t('teacher1.apply.teachingDaysLabel')}</Label>
        {errors.teaching_days && <p className="mb-2 text-xs text-destructive">{errors.teaching_days}</p>}
        <div className="mt-2 grid grid-cols-4 gap-2 sm:grid-cols-7">
          {DAYS.map((day) => {
            const selected = formData.teaching_days.includes(day.id)
            return (
              <button
                key={day.id}
                type="button"
                onClick={() => {
                  const next = selected
                    ? formData.teaching_days.filter((d) => d !== day.id)
                    : [...formData.teaching_days, day.id]
                  updateField('teaching_days', next)
                }}
                className={cn(
                  'rounded-lg px-2 py-2 text-xs font-medium transition-all text-center',
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

      {/* Teaching Hours (shown when days are selected) */}
      {formData.teaching_days.length > 0 && (
        <div>
          <Label>{t('teacher1.apply.teachingHoursLabel')}</Label>
          <p className="mb-2 text-xs text-on-surface-variant">
            {t('teacher1.apply.teachingHoursHint')}
          </p>
          <div className="space-y-2">
            {formData.teaching_days.map((day) => (
              <div key={day} className="flex flex-wrap items-center gap-3">
                <span className="w-16 text-sm font-medium text-on-surface">
                  {t(DAYS.find((d) => d.id === day)?.labelKey || 'teacher1.apply.dayMon')}
                </span>
                <Input
                  type="time"
                  value={formData.teaching_hours[day]?.split('-')[0] || '08:00'}
                  onChange={(e) => {
                    const current = formData.teaching_hours[day] || '08:00-17:00'
                    const end = current.split('-')[1] || '17:00'
                    updateField('teaching_hours', {
                      ...formData.teaching_hours,
                      [day]: `${e.target.value}-${end}`,
                    })
                  }}
                  className="w-32"
                />
                <span className="text-xs text-on-surface-variant">{t('teacher1.apply.until')}</span>
                <Input
                  type="time"
                  value={formData.teaching_hours[day]?.split('-')[1] || '17:00'}
                  onChange={(e) => {
                    const current = formData.teaching_hours[day] || '08:00-17:00'
                    const start = current.split('-')[0] || '08:00'
                    updateField('teaching_hours', {
                      ...formData.teaching_hours,
                      [day]: `${start}-${e.target.value}`,
                    })
                  }}
                  className="w-32"
                />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Session Duration, Max Students, Teaching Mode */}
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="space-y-1.5">
          <Label required>{t('teacher1.apply.sessionDurationLabel')}</Label>
          <select
            className={cn(
              'flex h-11 w-full rounded-lg border bg-surface-container-lowest px-3.5 py-2 text-sm text-on-surface',
              'transition-all hover:border-border-strong focus:outline-none focus:ring-2 focus:ring-ring focus:border-primary',
              errors.session_duration ? 'border-destructive/60' : 'border-border'
            )}
            value={formData.session_duration}
            onChange={(e) => updateField('session_duration', parseInt(e.target.value))}
          >
            {SESSION_DURATIONS.map((d) => (
              <option key={d} value={d}>{t('teacher1.apply.optionMinutes', { count: d })}</option>
            ))}
          </select>
          {errors.session_duration && <p className="text-xs text-destructive">{errors.session_duration}</p>}
        </div>

        <Input
          label={t('teacher1.apply.maxStudentsLabel')}
          required
          type="number"
          min="1"
          max="100"
          value={formData.max_students_per_class.toString()}
          onChange={(e) => updateField('max_students_per_class', parseInt(e.target.value) || 0)}
          error={errors.max_students_per_class}
        />

        <div className="space-y-1.5">
          <Label required>{t('teacher1.apply.teachingModeLabel')}</Label>
          <select
            className={cn(
              'flex h-11 w-full rounded-lg border bg-surface-container-lowest px-3.5 py-2 text-sm text-on-surface',
              'transition-all hover:border-border-strong focus:outline-none focus:ring-2 focus:ring-ring focus:border-primary',
              errors.teaching_mode ? 'border-destructive/60' : 'border-border'
            )}
            value={formData.teaching_mode}
            onChange={(e) => updateField('teaching_mode', e.target.value)}
          >
            {TEACHING_MODES.map((m) => (
              <option key={m.value} value={m.value}>{t(m.labelKey)}</option>
            ))}
          </select>
          {errors.teaching_mode && <p className="text-xs text-destructive">{errors.teaching_mode}</p>}
        </div>
      </div>
    </div>
  )
}

// ─── Step 5: Dokumen & Submit ───────────────────────────────────────────────

function Step5DocumentsSubmit({
  formData,
  updateField,
  errors,
  languages,
  userId,
}: {
  formData: ApplicationData
  updateField: (k: keyof ApplicationData, v: any) => void
  errors: Record<string, string>
  languages: Language[]
  userId: string
}) {
  const { t } = useI18n()
  const cvUrl = formData.documents[0]?.url || null

  function handleCvUpload(url: string) {
    updateField('documents', [{ name: 'CV', url }])
  }

  function handleCvRemove() {
    updateField('documents', [])
  }

  return (
    <div className="space-y-6">
      {/* CV Upload */}
      <div>
        <Label required>{t('teacher1.apply.uploadCvLabel')}</Label>
        <p className="mb-3 text-xs text-on-surface-variant">
          {t('teacher1.apply.uploadCvHint')}
        </p>
        <ImageUpload
          bucket="teacher-documents"
          pathPrefix={`${userId}/cv/${Date.now()}`}
          value={cvUrl}
          onUpload={handleCvUpload}
          onRemove={handleCvRemove}
          accept=".pdf,.doc,.docx,image/*"
        />
        {errors.documents && <p className="mt-1 text-xs text-destructive">{errors.documents}</p>}
      </div>

      {/* Agreement checkboxes */}
      <div className="space-y-3 rounded-lg border border-border bg-surface-container-low p-4">
        <label className="flex items-start gap-3">
          <input
            type="checkbox"
            checked={formData.agreed_terms}
            onChange={(e) => updateField('agreed_terms', e.target.checked)}
            className="mt-1 h-4 w-4 rounded border-border text-primary focus:ring-primary"
          />
          <span className="text-sm text-on-surface">
            {t('teacher1.apply.agreeTermsPrefix')}{' '}
            <span className="font-medium text-primary">{t('teacher1.apply.termsHighlight')}</span>{' '}
            {t('teacher1.apply.agreeTermsSuffix')}
          </span>
        </label>
        {errors.agreed_terms && <p className="text-xs text-destructive">{errors.agreed_terms}</p>}

        <label className="flex items-start gap-3">
          <input
            type="checkbox"
            checked={formData.agreed_policy}
            onChange={(e) => updateField('agreed_policy', e.target.checked)}
            className="mt-1 h-4 w-4 rounded border-border text-primary focus:ring-primary"
          />
          <span className="text-sm text-on-surface">
            {t('teacher1.apply.agreePolicyPrefix')}{' '}
            <span className="font-medium text-primary">{t('teacher1.apply.policyHighlight')}</span>{' '}
            {t('teacher1.apply.agreePolicySuffix')}
          </span>
        </label>
        {errors.agreed_policy && <p className="text-xs text-destructive">{errors.agreed_policy}</p>}
      </div>

      {/* Summary preview */}
      <div className="rounded-lg border border-border bg-surface-container-low p-4">
        <h4 className="mb-3 text-sm font-semibold text-on-surface">{t('teacher1.apply.summaryTitle')}</h4>
        <div className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-on-surface-variant">{t('teacher1.apply.summaryName')}</span>
            <span className="font-medium text-on-surface">{formData.full_name || '-'}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-on-surface-variant">{t('teacher1.apply.summaryLanguages')}</span>
            <span className="font-medium text-on-surface">
              {formData.languages
                .map((c) => languages.find((l) => l.code === c)?.native_name || c)
                .join(', ') || '-'}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-on-surface-variant">{t('teacher1.apply.summaryPrograms')}</span>
            <span className="font-medium text-on-surface">
              {formData.programs.join(', ') || '-'}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-on-surface-variant">{t('teacher1.apply.summarySession')}</span>
            <span className="font-medium text-on-surface">
              {t('teacher1.apply.optionMinutes', { count: formData.session_duration })}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-on-surface-variant">{t('teacher1.apply.summaryMode')}</span>
            <span className="font-medium text-on-surface capitalize">
              {formData.teaching_mode === 'both'
                ? t('teacher1.apply.modeBothDisplay')
                : formData.teaching_mode}
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Status-based Screens ────────────────────────────────────────────────────

function PendingReviewCard() {
  const { t } = useI18n()
  const router = useRouter()

  function handleLogout() {
    void signOut().finally(() => router.push('/'))
  }

  return (
    <div className="mx-auto max-w-lg py-16 text-center">
      <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-warning-soft">
        <Clock className="h-10 w-10 text-warning" />
      </div>
      <h1 className="text-2xl font-bold text-on-surface">{t('teacher1.apply.pendingTitle')}</h1>
      <p className="mt-3 text-on-surface-variant">
        {t('teacher1.apply.pendingDesc')}
      </p>
      <div className="mt-6 rounded-lg border border-border bg-surface-container-low p-4">
        <div className="flex items-center gap-3">
          <Badge variant="warning" pulse>{t('teacher1.apply.pendingStatusActive')}</Badge>
          <span className="text-sm text-on-surface-variant">{t('teacher1.apply.pendingStatusLabel')}</span>
        </div>
      </div>
      <Button variant="outline" className="mt-8" onClick={handleLogout}>
        {t('sidebar.logout')}
      </Button>
    </div>
  )
}

function RejectionCard({
  formData,
  onRestart,
}: {
  formData: ApplicationData
  onRestart: () => void
}) {
  const { t } = useI18n()
  const router = useRouter()

  return (
    <div className="mx-auto max-w-lg py-16 text-center">
      <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-destructive-soft">
        <XCircle className="h-10 w-10 text-destructive" />
      </div>
      <h1 className="text-2xl font-bold text-on-surface">{t('teacher1.apply.rejectedTitle')}</h1>
      {formData.admin_notes && (
        <div className="mt-4 rounded-lg border border-destructive/30 bg-destructive-soft p-4 text-left">
          <p className="text-sm font-semibold text-destructive">{t('teacher1.apply.rejectReason')}</p>
          <p className="mt-1 text-sm text-on-surface-variant">{formData.admin_notes}</p>
        </div>
      )}
      <p className="mt-4 text-on-surface-variant">
        {t('teacher1.apply.rejectedDesc')}
      </p>
      <div className="mt-6 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
        <Button variant="gradient" onClick={onRestart}>
          {t('teacher1.apply.resubmitBtn')}
        </Button>
        <Button variant="outline" onClick={() => router.push('/student/dashboard')}>
          {t('teacher1.apply.backToDashboard')}
        </Button>
      </div>
    </div>
  )
}

function SuccessCard() {
  const { t } = useI18n()

  return (
    <div className="mx-auto max-w-lg py-16 text-center">
      <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-success-soft">
        <CheckCircle2 className="h-10 w-10 text-success" />
      </div>
      <h1 className="text-2xl font-bold text-on-surface">{t('teacher1.apply.successTitle')}</h1>
      <p className="mt-3 text-on-surface-variant">
        {t('teacher1.apply.successDesc')}
      </p>
      <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
        <Button variant="outline" onClick={() => window.location.reload()}>
          {t('teacher1.apply.viewStatus')}
        </Button>
      </div>
    </div>
  )
}

// ─── Skeleton ────────────────────────────────────────────────────────────────

function ApplicationSkeleton() {
  return (
    <div className="mx-auto max-w-4xl animate-pulse">
      <div className="mb-8">
        <div className="h-8 w-64 rounded bg-surface-container-highest" />
        <div className="mt-2 h-4 w-96 rounded bg-surface-container-highest" />
      </div>
      <div className="mb-8 flex items-center justify-between">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-full bg-surface-container-highest" />
            <div className="hidden h-4 w-24 rounded bg-surface-container-highest sm:block" />
            {i < 4 && <div className="mx-2 h-px w-8 bg-surface-container-highest sm:w-16" />}
          </div>
        ))}
      </div>
      <div className="rounded-2xl border border-border bg-surface p-6">
        <div className="mb-6">
          <div className="h-6 w-48 rounded bg-surface-container-highest" />
          <div className="mt-1 h-4 w-64 rounded bg-surface-container-highest" />
        </div>
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="h-24 rounded-lg bg-surface-container-highest" />
            <div className="h-24 rounded-lg bg-surface-container-highest" />
          </div>
          <div className="h-24 rounded-lg bg-surface-container-highest" />
        </div>
      </div>
    </div>
  )
}
