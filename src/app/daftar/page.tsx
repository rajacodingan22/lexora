'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { Mail, Lock, User, Eye, EyeOff, CheckCircle2, Sparkles, ShieldCheck, GraduationCap, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { signUp, signInWithGoogle, type TeacherRegistrationData } from '@/lib/auth'
import { createClient } from '@/lib/supabase-client'
import { getSettingsMap, settingEnabled } from '@/lib/settings'
import { useI18n } from '@/lib/i18n/client'
import { AccessibilityToggle } from '@/components/shared/accessibility-toggle'
import { TeacherWizard } from '@/components/register/teacher-wizard'

const passwordRules = [
  { id: 'len', test: (p: string) => p.length >= 8 },
  { id: 'upper', test: (p: string) => /[A-Z]/.test(p) },
  { id: 'digit', test: (p: string) => /\d/.test(p) },
]

export default function RegisterPage() {
  const { t } = useI18n()
  const ruleLabels: Record<string, string> = {
    len: t('public.daftar.ruleLength'),
    upper: t('public.daftar.ruleUpper'),
    digit: t('public.daftar.ruleDigit'),
  }
  const [showPass, setShowPass] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)
  const [wizardOpen, setWizardOpen] = useState(false)
  const [wizardTick, setWizardTick] = useState(0)
  const [teacherLanguages, setTeacherLanguages] = useState<{ code: string; name: { id?: string; en?: string }; native_name: string }[]>([])
  const [teacherData, setTeacherData] = useState<TeacherRegistrationData>(() => {
    const timezone =
      (typeof Intl !== 'undefined' && Intl.DateTimeFormat().resolvedOptions().timeZone) || 'Asia/Jakarta'
    return {
      fullName: '',
      birthDate: '',
      gender: '',
      nationality: 'Indonesia',
      phoneNumber: '',
      email: '',
      address: '',
      timezone,
      languages: [],
      levels: {},
      programs: [],
      highestEducation: '',
      institution: '',
      major: '',
      graduationYear: '',
      hasTeachingExp: false,
      experienceYears: '',
      experienceInstitution: '',
      experienceDescription: '',
      teachingMode: 'both',
      sessionDuration: 60,
      maxStudents: 10,
      teachingDays: [],
      teachingHours: {},
    }
  })
  const [form, setForm] = useState({ name: '', email: '', password: '', role: 'student' })
  const [accepted, setAccepted] = useState(false)
  const [settingsLoaded, setSettingsLoaded] = useState(false)
  const [registrationEnabled, setRegistrationEnabled] = useState(true)
  const [googleEnabled, setGoogleEnabled] = useState(true)

  useEffect(() => {
    getSettingsMap().then((map) => {
      setRegistrationEnabled(settingEnabled(map, 'auth_allow_registration', true))
      setGoogleEnabled(settingEnabled(map, 'auth_allow_google_login', true))
      setSettingsLoaded(true)
    })

    createClient()
      .from('languages')
      .select('code, name, native_name')
      .eq('is_active', true)
      .order('sort_order')
      .then(({ data }) => {
        if (data) setTeacherLanguages(data as typeof teacherLanguages)
      })
  }, [])

  function openTeacherWizard() {
    setError('')
    setTeacherData((current) => ({
      ...current,
      fullName: current.fullName || form.name,
      email: current.email || form.email,
    }))
    setWizardTick((n) => n + 1)
    setWizardOpen(true)
  }

  function handleWizardComplete(data: TeacherRegistrationData) {
    setTeacherData(data)
    setForm((current) => ({ ...current, name: data.fullName, email: data.email, role: 'teacher' }))
    setWizardOpen(false)
    performSignup(data)
  }

  async function notifyTeacherApplication(data: TeacherRegistrationData) {
    try {
      await fetch('/api/email/teacher-notification', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          accountEmail: form.email,
          fullName: data.fullName,
          birthDate: data.birthDate,
          languages: data.languages,
          phoneNumber: data.phoneNumber,
          nationality: data.nationality,
          email: data.email,
        }),
      })
    } catch {
      // non-blocking: email to admin must never break the UI
    }
  }

  const performSignup = async (data: TeacherRegistrationData) => {
    setLoading(true)
    const { error } = await signUp(
      form.email,
      form.password,
      data.fullName,
      'teacher',
      data,
    )
    setLoading(false)
    if (error) { setError(error.message); return }
    notifyTeacherApplication(data)
    setSuccess(true)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    if (form.password.length < 8) { setError(t('public.daftar.pwTooShort')); return }
    if (!accepted) { setError(t('public.daftar.termsRequired')); return }

    if (form.role === 'teacher') {
      openTeacherWizard()
      return
    }

    setLoading(true)
    const { error } = await signUp(
      form.email,
      form.password,
      form.name,
      form.role,
      form.role === 'teacher' ? teacherData : undefined,
    )
    setLoading(false)

    if (error) { setError(error.message); return }
    if (form.role === 'teacher') notifyTeacherApplication(teacherData)
    setSuccess(true)
  }

  const handleGoogle = async () => {
    setError('')
    const { error } = await signInWithGoogle()
    if (error) setError(error.message)
  }

  if (settingsLoaded && !registrationEnabled) {
    return (
      <main className="flex min-h-dvh items-center justify-center bg-background px-4 py-8">
        <div className="w-full max-w-md text-center">
          <div className="mx-auto mb-6 flex size-20 items-center justify-center rounded-full bg-surface-container-low animate-bounce-in">
            <ShieldCheck className="size-10 text-muted" aria-hidden="true" />
          </div>
          <h1 className="text-3xl font-extrabold tracking-tight text-on-surface">
            {t('public.daftar.registrationClosed')}
          </h1>
          <p className="mt-3 text-on-surface-variant">
            {t('public.daftar.registrationClosedDesc')}
          </p>
          <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
            <Link href="/masuk">
              <Button variant="gradient" size="lg">{t('public.daftar.haveAccountLogin')}</Button>
            </Link>
          </div>
        </div>
      </main>
    )
  }

  if (success) {
    return (
      <main className="flex min-h-dvh items-center justify-center bg-background px-4 py-8">
        <div className="w-full max-w-md text-center">
          <div className="mx-auto mb-6 flex size-20 items-center justify-center rounded-full bg-success-soft animate-bounce-in">
            <CheckCircle2 className="size-10 text-success" aria-hidden="true" />
          </div>
          <h1 className="text-3xl font-extrabold tracking-tight text-on-surface">
            {form.role === 'teacher' ? t('public.daftar.teacherCheckEmail') : t('public.daftar.checkEmail')}
          </h1>
          <p className="mt-3 text-on-surface-variant">
            {t('public.daftar.verificationSent')}{' '}
            <strong className="text-on-surface">{form.email}</strong>
          </p>
          <p className="mt-1 text-sm text-on-surface-variant">
            {form.role === 'teacher' ? t('public.daftar.teacherVerificationHint') : t('public.daftar.verificationHint')}
          </p>
          <p className="mt-4 text-xs text-on-surface-variant">
            {t('public.daftar.noEmail')}
          </p>
          <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
            <Link href="/masuk">
              <Button variant="gradient" size="lg">{t('public.daftar.verifiedLogin')}</Button>
            </Link>
          </div>
        </div>
      </main>
    )
  }

  return (
    <div className="lg:grid lg:grid-cols-2">
      <aside
        className="relative hidden overflow-hidden border-r border-border bg-gradient-to-br from-accent via-primary to-secondary p-12 lg:flex lg:flex-col lg:min-h-dvh"
        aria-label="Brand introduction"
      >
        <div
          aria-hidden="true"
          className="absolute inset-0 opacity-30"
          style={{
            backgroundImage:
              'radial-gradient(circle at 30% 30%, oklch(0.99 0.005 270 / 0.4), transparent 55%), radial-gradient(circle at 70% 80%, oklch(0.99 0.005 270 / 0.3), transparent 50%)',
          }}
        />
        <Link href="/" className="relative z-10 flex items-center gap-2.5">
          <img src="/logo.png" alt="" className="size-10 rounded-xl object-contain shadow-sm" />
          <span className="text-xl font-extrabold tracking-tight text-primary-foreground">
            Lexora Academy
          </span>
        </Link>

        <div className="relative z-10 mt-auto">
          <div className="flex items-center gap-2 text-primary-foreground/90">
            <Sparkles className="size-5" aria-hidden="true" />
            <span className="text-sm font-bold uppercase tracking-widest">{t('public.daftar.joinNow')}</span>
          </div>
          <h2 className="mt-4 text-balance text-3xl font-extrabold leading-tight text-primary-foreground sm:text-4xl">
            {t('public.daftar.heroTitleA')}<br />
            {t('public.daftar.heroTitleB')}
          </h2>
          <p className="mt-3 max-w-sm text-primary-foreground/85">
            {t('public.daftar.heroDesc')}
          </p>

          <div className="mt-8 space-y-3">
            {[
              t('public.daftar.perk1'),
              t('public.daftar.perk2'),
              t('public.daftar.perk3'),
              t('public.daftar.perk4'),
            ].map((perk) => (
              <div key={perk} className="flex items-center gap-2.5 text-sm text-primary-foreground">
                <div className="flex size-6 shrink-0 items-center justify-center rounded-md bg-background/30 backdrop-blur">
                  <CheckCircle2 className="size-4" aria-hidden="true" />
                </div>
                {perk}
              </div>
            ))}
          </div>
        </div>
      </aside>

      <main className="relative flex min-h-dvh items-center justify-center bg-background px-4 py-8 sm:px-6 lg:px-12">
        <div className="absolute right-4 top-4 z-20">
          <AccessibilityToggle />
        </div>
        <div className="w-full max-w-md">
          <Link href="/" className="mb-8 inline-flex items-center gap-2 lg:hidden" aria-label="Lexora Academy home">
            <img src="/logo.png" alt="" className="size-9 rounded-lg object-contain shadow-sm" />
            <span className="text-lg font-extrabold tracking-tight text-on-surface">
              Lex<span className="gradient-text">ora</span> Academy
            </span>
          </Link>

          <div className="mb-8">
            <h1 className="text-3xl font-extrabold tracking-tight text-on-surface">{t('public.daftar.createAccount')}</h1>
            <p className="mt-2 text-on-surface-variant">{t('public.daftar.createSubtitle')}</p>
          </div>

          {error && (
            <div role="alert" className="mb-5 flex items-start gap-3 rounded-xl border border-destructive/30 bg-destructive-soft px-4 py-3 text-sm text-destructive animate-fade-in">
              <ShieldCheck className="size-4 shrink-0 mt-0.5" aria-hidden="true" />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <Input
              id="name"
              label={t('public.daftar.nameLabel')}
              type="text"
              placeholder={t('public.daftar.namePlaceholder')}
              required
              icon={<User className="size-4" aria-hidden="true" />}
              value={form.name}
              onChange={(e) => {
                const name = e.target.value
                setForm({ ...form, name })
                if (form.role === 'teacher') setTeacherData((current) => ({ ...current, fullName: name }))
              }}
              autoComplete="name"
            />

            <div className="grid gap-3 sm:grid-cols-2">
              <button
                type="button"
                onClick={() => setForm({ ...form, role: 'student' })}
                className={cn(
                  'flex items-center gap-3 rounded-xl border px-4 py-3 text-left transition-all',
                  form.role === 'student' ? 'border-primary bg-primary-soft ring-2 ring-primary/20' : 'border-border bg-surface-container-low hover:border-primary/50'
                )}
              >
                <GraduationCap className="size-5 text-primary" aria-hidden="true" />
                <span>
                  <span className="block text-sm font-semibold text-on-surface">{t('public.daftar.roleLearn')}</span>
                  <span className="block text-xs text-on-surface-variant">{t('public.daftar.roleLearnDesc')}</span>
                </span>
              </button>
              <button
                type="button"
                onClick={() => setForm({ ...form, role: 'teacher' })}
                className={cn(
                  'flex items-center gap-3 rounded-xl border px-4 py-3 text-left transition-all',
                  form.role === 'teacher' ? 'border-secondary bg-secondary/10 ring-2 ring-secondary/20' : 'border-border bg-surface-container-low hover:border-secondary/50'
                )}
              >
                <User className="size-5 text-secondary" aria-hidden="true" />
                <span>
                  <span className="block text-sm font-semibold text-on-surface">{t('public.daftar.roleTeach')}</span>
                  <span className="block text-xs text-on-surface-variant">{t('public.daftar.roleTeachDesc')}</span>
                </span>
              </button>
            </div>
            {form.role === 'teacher' && teacherData.fullName.trim() && teacherData.languages.length > 0 && (
              <div className="flex items-center justify-between rounded-lg bg-secondary/10 px-3 py-2 text-xs text-on-surface-variant">
                <span>{t('public.daftar.teacherDetailsReady')}</span>
                <button type="button" onClick={openTeacherWizard} className="font-semibold text-secondary hover:underline">
                  {t('public.daftar.editTeacherDetails')}
                </button>
              </div>
            )}

            <Input
              id="email"
              label={t('public.daftar.emailLabel')}
              type="email"
              placeholder="nama@email.com"
              required
              icon={<Mail className="size-4" aria-hidden="true" />}
              value={form.email}
              onChange={(e) => {
                const email = e.target.value
                setForm({ ...form, email })
                if (form.role === 'teacher') setTeacherData((current) => ({ ...current, email }))
              }}
              autoComplete="email"
            />

            <Input
              id="password"
              label={t('public.daftar.passwordLabel')}
              type={showPass ? 'text' : 'password'}
              placeholder={t('public.daftar.passwordPlaceholder')}
              required
              icon={<Lock className="size-4" aria-hidden="true" />}
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              autoComplete="new-password"
              hint={t('public.daftar.passwordHint')}
              suffix={
                <button
                  type="button"
                  onClick={() => setShowPass(!showPass)}
                  className="rounded-md p-1.5 text-muted transition-colors hover:bg-surface-hover hover:text-on-surface"
                  aria-label={showPass ? t('public.daftar.hidePassword') : t('public.daftar.showPassword')}
                >
                  {showPass ? <EyeOff className="size-4" aria-hidden="true" /> : <Eye className="size-4" aria-hidden="true" />}
                </button>
              }
            />
            {form.password.length > 0 && (
              <ul className="flex flex-wrap gap-1.5 text-[11px]">
                {passwordRules.map((r) => (
                  <li
                    key={r.id}
                    className={cn(
                      'flex items-center gap-1 rounded-md px-2 py-1 font-medium',
                      r.test(form.password)
                        ? 'bg-success-soft text-success'
                        : 'bg-surface-container-low text-on-surface-variant'
                    )}
                  >
                    <CheckCircle2 className={cn('size-3', r.test(form.password) ? 'opacity-100' : 'opacity-40')} aria-hidden="true" />
                    {ruleLabels[r.id]}
                  </li>
                ))}
              </ul>
            )}

            <label className="flex items-start gap-2.5 text-sm text-on-surface-variant">
              <input
                type="checkbox"
                checked={accepted}
                onChange={(e) => setAccepted(e.target.checked)}
                className="mt-0.5 size-4 cursor-pointer rounded border-border bg-surface-container-lowest accent-primary"
              />
              <span>
                {t('public.daftar.agreeTerms')}{' '}
                <Link href="/legal/syarat-ketentuan" className="font-semibold text-primary hover:underline">
                  {t('public.daftar.terms')}
                </Link>{' '}
                {t('public.daftar.and')}{' '}
                <Link href="/legal/kebijakan-privasi" className="font-semibold text-primary hover:underline">
                  {t('public.daftar.privacy')}
                </Link>
              </span>
            </label>

            <Button type="submit" variant="gradient" size="lg" loading={loading} className="w-full">
              {t('public.daftar.createFreeAccount')}
            </Button>

            <div className="relative my-4">
              <div className="divider-soft" />
              <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-background px-3 text-xs font-bold uppercase tracking-widest text-on-surface-variant">
                {t('public.daftar.or')}
              </span>
            </div>

            {googleEnabled && (
              <Button
                type="button"
                variant="secondary"
                size="lg"
                className="w-full"
                onClick={handleGoogle}
                disabled={loading}
              >
                {loading ? (
                  <Loader2 className="size-5 animate-spin" />
                ) : (
                  <svg className="size-5" viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4" />
                    <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                    <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
                    <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
                  </svg>
                )}
                {t('public.daftar.signupGoogle')}
              </Button>
            )}

            <p className="pt-2 text-center text-sm text-on-surface-variant">
              {t('public.daftar.haveAccount')}{' '}
              <Link href="/masuk" className="font-semibold text-primary hover:underline">
                {t('public.daftar.login')}
              </Link>
            </p>
          </form>
        </div>
      </main>
      {wizardOpen && (
        <TeacherWizard
          open={wizardOpen}
          key={wizardTick}
          initial={teacherData}
          languages={teacherLanguages}
          onClose={() => setWizardOpen(false)}
          onComplete={handleWizardComplete}
        />
      )}
    </div>
  )
}
