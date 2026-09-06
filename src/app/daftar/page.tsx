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
      <main className="flex min-h-dvh items-center justify-center bg-gradient-to-br from-violet-950 via-slate-950 to-cyan-950 px-4 py-8">
        <div className="w-full max-w-md text-center">
          <div className="mx-auto mb-6 flex size-20 items-center justify-center rounded-full bg-white/10 backdrop-blur-xl animate-bounce-in">
            <ShieldCheck className="size-10 text-cyan-400" aria-hidden="true" />
          </div>
          <h1 className="text-3xl font-black tracking-tight text-white">
            {t('public.daftar.registrationClosed')}
          </h1>
          <p className="mt-3 text-white/70">
            {t('public.daftar.registrationClosedDesc')}
          </p>
          <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
            <Link href="/masuk">
              <Button variant="gradient" size="lg" className="shadow-lg shadow-violet-500/25 hover:shadow-violet-500/40">{t('public.daftar.haveAccountLogin')}</Button>
            </Link>
          </div>
        </div>
      </main>
    )
  }

  if (success) {
    return (
      <main className="flex min-h-dvh items-center justify-center bg-gradient-to-br from-violet-950 via-slate-950 to-cyan-950 px-4 py-8">
        <div className="w-full max-w-md text-center">
          <div className="mx-auto mb-6 flex size-20 items-center justify-center rounded-full bg-emerald-500/20 backdrop-blur-xl animate-bounce-in">
            <CheckCircle2 className="size-10 text-emerald-400" aria-hidden="true" />
          </div>
          <h1 className="text-3xl font-black tracking-tight text-white">
            {form.role === 'teacher' ? t('public.daftar.teacherCheckEmail') : t('public.daftar.checkEmail')}
          </h1>
          <p className="mt-3 text-white/70">
            {t('public.daftar.verificationSent')}{' '}
            <strong className="text-white">{form.email}</strong>
          </p>
          <p className="mt-1 text-sm text-white/60">
            {form.role === 'teacher' ? t('public.daftar.teacherVerificationHint') : t('public.daftar.verificationHint')}
          </p>
          <p className="mt-4 text-xs text-white/40">
            {t('public.daftar.noEmail')}
          </p>
          <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
            <Link href="/masuk">
              <Button variant="gradient" size="lg" className="shadow-lg shadow-violet-500/25 hover:shadow-violet-500/40">{t('public.daftar.verifiedLogin')}</Button>
            </Link>
          </div>
        </div>
      </main>
    )
  }

  return (
    <div className="relative min-h-dvh overflow-hidden bg-gradient-to-br from-violet-950 via-slate-950 to-cyan-950">
      {/* Animated Background Elements */}
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute -top-1/2 -left-1/4 h-[1000px] w-[1000px] rounded-full bg-gradient-to-r from-violet-600/20 to-fuchsia-600/20 blur-3xl animate-pulse" />
        <div className="absolute -bottom-1/2 -right-1/4 h-[1000px] w-[1000px] rounded-full bg-gradient-to-r from-cyan-600/20 to-blue-600/20 blur-3xl animate-pulse delay-1000" />
        <div className="absolute top-1/4 right-1/4 h-[600px] w-[600px] rounded-full bg-gradient-to-r from-pink-600/15 to-purple-600/15 blur-3xl animate-pulse delay-500" />
      </div>

      {/* Grid Pattern Overlay */}
      <div className="absolute inset-0 bg-[linear-gradient(rgba(139,92,246,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(139,92,246,0.03)_1px,transparent_1px)] bg-[size:64px_64px]" />

      <div className="relative grid lg:grid-cols-2 min-h-dvh">
        {/* Left Panel - Brand */}
        <aside className="hidden lg:flex lg:flex-col lg:justify-between lg:p-12 lg:border-r border-white/10 backdrop-blur-xl bg-white/5">
          <Link href="/" className="flex items-center gap-3 group">
            <div className="relative">
              <div className="absolute inset-0 bg-gradient-to-r from-violet-500 to-cyan-500 rounded-xl blur-lg opacity-50 group-hover:opacity-75 transition-opacity" />
              <img src="/logo.png" alt="" className="relative size-12 rounded-xl object-contain shadow-2xl" />
            </div>
            <span className="text-2xl font-black tracking-tight text-white">
              Lexora<span className="text-transparent bg-clip-text bg-gradient-to-r from-violet-400 to-cyan-400">Academy</span>
            </span>
          </Link>

          <div className="space-y-6 mt-auto">
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-gradient-to-r from-violet-500/20 to-cyan-500/20 border border-white/10 backdrop-blur-sm">
              <Sparkles className="size-4 text-cyan-400" />
              <span className="text-xs font-bold uppercase tracking-widest text-white/90">{t('public.daftar.joinNow')}</span>
            </div>
            
            <h2 className="text-4xl font-black leading-tight text-white">
              {t('public.daftar.heroTitleA')}<br />
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-violet-400 via-fuchsia-400 to-cyan-400">
                {t('public.daftar.heroTitleB')}
              </span>
            </h2>
            
            <p className="text-lg text-white/70 max-w-md">
              {t('public.daftar.heroDesc')}
            </p>

            <div className="mt-8 space-y-3">
              {[
                t('public.daftar.perk1'),
                t('public.daftar.perk2'),
                t('public.daftar.perk3'),
                t('public.daftar.perk4'),
              ].map((perk) => (
                <div key={perk} className="flex items-center gap-2.5 text-sm text-white/90">
                  <div className="flex size-6 shrink-0 items-center justify-center rounded-md bg-white/10 backdrop-blur">
                    <CheckCircle2 className="size-4 text-cyan-400" />
                  </div>
                  {perk}
                </div>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-2 text-white/60 text-sm">
            <div className="h-px flex-1 bg-gradient-to-r from-transparent via-white/20 to-transparent" />
            <span>Join 10,000+ students today</span>
            <div className="h-px flex-1 bg-gradient-to-r from-transparent via-white/20 to-transparent" />
          </div>
        </aside>

        {/* Right Panel - Register Form */}
        <main className="flex items-center justify-center px-6 py-12 relative">
          <div className="absolute right-6 top-6 z-20">
            <AccessibilityToggle />
          </div>
          
          <div className="w-full max-w-md">
            {/* Mobile Logo */}
            <Link href="/" className="inline-flex items-center gap-2 lg:hidden group mb-8">
              <div className="relative">
                <div className="absolute inset-0 bg-gradient-to-r from-violet-500 to-cyan-500 rounded-lg blur-md opacity-50" />
                <img src="/logo.png" alt="" className="relative size-10 rounded-lg object-contain" />
              </div>
              <span className="text-xl font-black text-white">
                Lexora<span className="text-cyan-400">Academy</span>
              </span>
            </Link>

            {/* Header */}
            <div className="text-center lg:text-left mb-8">
              <h1 className="text-3xl font-black tracking-tight text-white">{t('public.daftar.createAccount')}</h1>
              <p className="mt-2 text-white/60">{t('public.daftar.createSubtitle')}</p>
            </div>

            {/* Error Alert */}
            {error && (
              <div role="alert" className="mb-5 flex items-start gap-3 rounded-2xl border border-red-500/30 bg-red-500/10 backdrop-blur-xl px-4 py-3 text-sm text-red-400 animate-fade-in">
                <ShieldCheck className="size-4 shrink-0 mt-0.5" />
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
              className="bg-white/5 border-white/10 text-white placeholder:text-white/40 focus:border-violet-500 focus:ring-violet-500/20"
            />

            <div className="grid gap-3 sm:grid-cols-2">
              <button
                type="button"
                onClick={() => setForm({ ...form, role: 'student' })}
                className={cn(
                  'flex items-center gap-3 rounded-xl border px-4 py-3 text-left transition-all',
                  form.role === 'student' ? 'border-violet-500 bg-violet-500/20 ring-2 ring-violet-500/20' : 'border-white/10 bg-white/5 hover:border-violet-500/50'
                )}
              >
                <GraduationCap className="size-5 text-cyan-400" aria-hidden="true" />
                <span>
                  <span className="block text-sm font-semibold text-white">{t('public.daftar.roleLearn')}</span>
                  <span className="block text-xs text-white/60">{t('public.daftar.roleLearnDesc')}</span>
                </span>
              </button>
              <button
                type="button"
                onClick={() => setForm({ ...form, role: 'teacher' })}
                className={cn(
                  'flex items-center gap-3 rounded-xl border px-4 py-3 text-left transition-all',
                  form.role === 'teacher' ? 'border-cyan-500 bg-cyan-500/20 ring-2 ring-cyan-500/20' : 'border-white/10 bg-white/5 hover:border-cyan-500/50'
                )}
              >
                <User className="size-5 text-fuchsia-400" aria-hidden="true" />
                <span>
                  <span className="block text-sm font-semibold text-white">{t('public.daftar.roleTeach')}</span>
                  <span className="block text-xs text-white/60">{t('public.daftar.roleTeachDesc')}</span>
                </span>
              </button>
            </div>
            {form.role === 'teacher' && teacherData.fullName.trim() && teacherData.languages.length > 0 && (
              <div className="flex items-center justify-between rounded-lg bg-cyan-500/10 px-3 py-2 text-xs text-white/70">
                <span>{t('public.daftar.teacherDetailsReady')}</span>
                <button type="button" onClick={openTeacherWizard} className="font-semibold text-cyan-400 hover:underline">
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
              className="bg-white/5 border-white/10 text-white placeholder:text-white/40 focus:border-violet-500 focus:ring-violet-500/20"
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
                  className="rounded-md p-1.5 text-white/40 transition-colors hover:bg-white/10 hover:text-white"
                  aria-label={showPass ? t('public.daftar.hidePassword') : t('public.daftar.showPassword')}
                >
                  {showPass ? <EyeOff className="size-4" aria-hidden="true" /> : <Eye className="size-4" aria-hidden="true" />}
                </button>
              }
              className="bg-white/5 border-white/10 text-white placeholder:text-white/40 focus:border-violet-500 focus:ring-violet-500/20"
            />
            {form.password.length > 0 && (
              <ul className="flex flex-wrap gap-1.5 text-[11px]">
                {passwordRules.map((r) => (
                  <li
                    key={r.id}
                    className={cn(
                      'flex items-center gap-1 rounded-md px-2 py-1 font-medium',
                      r.test(form.password)
                        ? 'bg-emerald-500/20 text-emerald-400'
                        : 'bg-white/5 text-white/60'
                    )}
                  >
                    <CheckCircle2 className={cn('size-3', r.test(form.password) ? 'opacity-100' : 'opacity-40')} aria-hidden="true" />
                    {ruleLabels[r.id]}
                  </li>
                ))}
              </ul>
            )}

            <label className="flex items-start gap-2.5 text-sm text-white/70">
              <input
                type="checkbox"
                checked={accepted}
                onChange={(e) => setAccepted(e.target.checked)}
                className="mt-0.5 size-4 cursor-pointer rounded border-white/20 bg-white/5 accent-violet-500"
              />
              <span>
                {t('public.daftar.agreeTerms')}{' '}
                <Link href="/legal/syarat-ketentuan" className="font-semibold text-cyan-400 hover:underline">
                  {t('public.daftar.terms')}
                </Link>{' '}
                {t('public.daftar.and')}{' '}
                <Link href="/legal/kebijakan-privasi" className="font-semibold text-cyan-400 hover:underline">
                  {t('public.daftar.privacy')}
                </Link>
              </span>
            </label>

            <Button type="submit" variant="gradient" size="lg" loading={loading} className="w-full shadow-lg shadow-violet-500/25 hover:shadow-violet-500/40 hover:scale-[1.02] transition-all">
              {t('public.daftar.createFreeAccount')}
            </Button>

            <div className="relative my-4">
              <div className="h-px bg-gradient-to-r from-transparent via-white/20 to-transparent" />
              <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-gradient-to-br from-violet-950 via-slate-950 to-cyan-950 px-3 text-xs font-black uppercase tracking-widest">
                {t('public.daftar.or')}
              </span>
            </div>

            {googleEnabled && (
              <Button
                type="button"
                variant="secondary"
                size="lg"
                className="w-full bg-white/5 border-white/10 text-white hover:bg-white/10 transition-all"
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

            <p className="pt-2 text-center text-sm text-white/60">
              {t('public.daftar.haveAccount')}{' '}
              <Link href="/masuk" className="font-bold text-transparent bg-clip-text bg-gradient-to-r from-violet-400 to-cyan-400 hover:from-violet-300 hover:to-cyan-300 transition-all">
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
  );
}
