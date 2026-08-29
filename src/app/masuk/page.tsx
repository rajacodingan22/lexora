'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Mail, Lock, Eye, EyeOff, ShieldCheck, Sparkles, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { signIn, signInWithGoogle } from '@/lib/auth'
import { createClient } from '@/lib/supabase-client'
import { getSettingsMap, settingEnabled } from '@/lib/settings'
import { useI18n } from '@/lib/i18n/client'
import { AccessibilityToggle } from '@/components/shared/accessibility-toggle'

export default function LoginPage() {
  const { t } = useI18n()
  const [showPass, setShowPass] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [form, setForm] = useState({ email: '', password: '' })
  const [resending, setResending] = useState(false)
  const [resent, setResent] = useState(false)
  const [googleEnabled, setGoogleEnabled] = useState(true)
  const router = useRouter()

  useEffect(() => {
    getSettingsMap().then((map) => {
      setGoogleEnabled(settingEnabled(map, 'auth_allow_google_login', true))
    })
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setResent(false)
    setLoading(true)

    const { data, error } = await signIn(form.email, form.password)
    setLoading(false)

    if (error) {
      const msg = error.message
      if (msg === 'Invalid login credentials') {
        setError(t('public.masuk.invalidCredentials'))
      } else if (msg?.toLowerCase().includes('email not confirmed')) {
        setError(t('public.masuk.emailNotConfirmed'))
      } else {
        setError(msg)
      }
      return
    }

    if (data?.user) {
      const supabase = createClient()
      const { data: profile } = await supabase
        .from('users').select('role, status').eq('id', data.user.id).single()
      const role = (profile as { role?: string; status?: string } | null)?.role || 'student'
      if (role === 'teacher') {
        router.push('/teacher/dashboard')
      } else if (role === 'admin') {
        router.push('/admin/dashboard')
      } else {
        const { data: application } = await supabase
          .from('teacher_applications')
          .select('status')
          .eq('user_id', data.user.id)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle()
        if (application && ['draft', 'pending_review', 'needs_revision', 'rejected'].includes(application.status)) {
          router.push('/teacher/apply')
        } else {
          router.push('/student/dashboard')
        }
      }
    }
  }

  const handleGoogle = async () => {
    setError('')
    const { error } = await signInWithGoogle()
    if (error) setError(error.message)
  }

  const handleResend = async () => {
    setResending(true)
    setResent(false)
    const supabase = createClient()
    const { error } = await supabase.auth.resend({
      type: 'signup',
      email: form.email,
    })
    setResending(false)
    if (error) {
      setError(error.message)
    } else {
      setResent(true)
    }
  }

  return (
    <div className="lg:grid lg:grid-cols-2">
      <aside className="relative hidden overflow-hidden border-r border-border bg-gradient-to-br from-accent via-primary to-secondary p-12 lg:flex lg:flex-col lg:min-h-dvh">
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
            <Sparkles className="size-5" />
            <span className="text-sm font-bold uppercase tracking-widest">{t('public.masuk.smartBadge')}</span>
          </div>
          <h2 className="mt-4 text-balance text-3xl font-extrabold leading-tight text-primary-foreground sm:text-4xl">
            {t('public.masuk.heroTitleA')}<br />
            {t('public.masuk.heroTitleB')}
          </h2>
          <p className="mt-3 max-w-sm text-primary-foreground/85">
            {t('public.masuk.heroDesc')}
          </p>
        </div>
      </aside>

      <main className="relative flex min-h-dvh items-center justify-center bg-background px-4 py-8 sm:px-6 lg:px-12">
        <div className="absolute right-4 top-4 z-20">
          <AccessibilityToggle />
        </div>
        <div className="w-full max-w-md">
          <Link href="/" className="mb-8 inline-flex items-center gap-2 lg:hidden">
            <img src="/logo.png" alt="" className="size-9 rounded-lg object-contain shadow-sm" />
            <span className="text-lg font-extrabold tracking-tight text-on-surface">
            Lexora Academy
            </span>
          </Link>

          <div className="mb-8">
            <h1 className="text-3xl font-extrabold tracking-tight text-on-surface">
              {t('public.masuk.welcomeBack')}
            </h1>
            <p className="mt-2 text-on-surface-variant">{t('public.masuk.subtitle')}</p>
          </div>

          {error && (
            <div
              role="alert"
              className="mb-5 flex items-start gap-3 rounded-xl border border-destructive/30 bg-destructive-soft px-4 py-3 text-sm text-destructive animate-fade-in"
            >
              <ShieldCheck className="size-4 shrink-0 mt-0.5" />
              <div className="flex-1">
                <span>{error}</span>
                {error.toLowerCase().includes('verif') && (
                  <button
                    type="button"
                    onClick={handleResend}
                    disabled={resending}
                    className="ml-1 font-semibold text-primary hover:underline disabled:opacity-50"
                  >
                    {resending ? t('public.masuk.sending') : t('public.masuk.resend')}
                  </button>
                )}
                {resent && (
                  <p className="mt-1 text-xs text-success">{t('public.masuk.resendSuccess')}</p>
                )}
              </div>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <Input
              id="email"
              label={t('public.masuk.emailLabel')}
              type="email"
              placeholder="nama@email.com"
              required
              icon={<Mail className="size-4" />}
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              autoComplete="email"
            />

            <Input
              id="password"
              label={t('public.masuk.passwordLabel')}
              type={showPass ? 'text' : 'password'}
              placeholder={t('public.masuk.passwordPlaceholder')}
              required
              icon={<Lock className="size-4" />}
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              autoComplete="current-password"
              suffix={
                <button
                  type="button"
                  onClick={() => setShowPass(!showPass)}
                  className="rounded-md p-1.5 text-muted transition-colors hover:bg-surface-hover hover:text-on-surface"
                  aria-label={showPass ? t('public.masuk.hidePassword') : t('public.masuk.showPassword')}
                >
                  {showPass ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                </button>
              }
            />

            <div className="flex justify-end text-sm">
              <Link href="/lupa-password" className="font-semibold text-primary hover:underline">
                {t('public.masuk.forgotPassword')}
              </Link>
            </div>

            <Button type="submit" variant="gradient" size="lg" loading={loading} className="w-full">
              {t('public.masuk.loginButton')}
            </Button>

            <div className="relative my-4">
              <div className="divider-soft" />
              <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-background px-3 text-xs font-bold uppercase tracking-widest text-on-surface-variant">
                {t('public.masuk.or')}
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
                  <svg className="size-5" viewBox="0 0 24 24">
                    <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4" />
                    <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                    <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
                    <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
                  </svg>
                )}
                {t('public.masuk.loginGoogle')}
              </Button>
            )}

            <p className="pt-2 text-center text-sm text-on-surface-variant">
              {t('public.masuk.noAccount')}{' '}
              <Link href="/daftar" className="font-semibold text-primary hover:underline">
                {t('public.masuk.signupFree')}
              </Link>
            </p>
          </form>
        </div>
      </main>
    </div>
  )
}
