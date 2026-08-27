'use client'

import { Suspense, useEffect, useState } from 'react'
import Link from 'next/link'
import { Mail, ArrowLeft, CheckCircle2, Lock, ShieldCheck } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { createClient } from '@/lib/supabase-client'
import { resetPassword } from '@/lib/auth'
import { useSearchParams } from 'next/navigation'
import { useI18n } from '@/lib/i18n/client'
import { AccessibilityToggle } from '@/components/shared/accessibility-toggle'

function ForgotPasswordForm() {
  const searchParams = useSearchParams()
  const code = searchParams.get('code')
  const { t } = useI18n()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [sent, setSent] = useState(false)
  const [updated, setUpdated] = useState(false)
  const [showResetForm, setShowResetForm] = useState(false)
  const [exchanging, setExchanging] = useState(false)

  useEffect(() => {
    if (code) {
      setExchanging(true)
      const supabase = createClient()
      supabase.auth.exchangeCodeForSession(code).then(({ error }) => {
        setExchanging(false)
        if (error) {
          setError(t('public.forgot.invalidLink'))
          return
        }
        setShowResetForm(true)
      })
    }
  }, [code])

  const handleSendReset = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    const { error } = await resetPassword(email)
    setLoading(false)
    if (error) { setError(error.message); return }
    setSent(true)
  }

  const handleUpdatePassword = async (e: React.FormEvent) => {
    e.preventDefault()
    if (password.length < 8) { setError(t('public.forgot.pwTooShort')); return }
    setError('')
    setLoading(true)
    const supabase = createClient()
    const { error } = await supabase.auth.updateUser({ password })
    setLoading(false)
    if (error) { setError(error.message); return }
    setUpdated(true)
  }

  if (exchanging) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background">
        <div className="size-12 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </main>
    )
  }

  if (showResetForm) {
    if (updated) {
      return (
        <main className="flex min-h-screen items-center justify-center bg-background px-4 py-12">
          <div className="w-full max-w-md text-center">
            <div className="mx-auto mb-6 flex size-20 items-center justify-center rounded-full bg-success-soft animate-bounce-in">
              <CheckCircle2 className="size-10 text-success" />
            </div>
            <h1 className="text-3xl font-extrabold tracking-tight text-on-surface">
              {t('public.forgot.updatedTitle')}
            </h1>
            <p className="mt-3 text-on-surface-variant">
              {t('public.forgot.updatedDesc')}
            </p>
            <Link href="/masuk" className="mt-8 inline-block">
              <Button variant="gradient" size="lg">{t('public.forgot.loginNow')}</Button>
            </Link>
          </div>
        </main>
      )
    }
    return (
      <main className="flex min-h-screen items-center justify-center bg-background px-4 py-12 sm:px-6">
        <div className="w-full max-w-md">
          <div className="mb-8 text-center">
            <div className="mx-auto mb-4 flex size-14 items-center justify-center rounded-2xl bg-gradient-to-br from-accent to-primary shadow-sm">
              <Lock className="size-6 text-primary-foreground" />
            </div>
            <h1 className="text-2xl font-extrabold tracking-tight text-on-surface">{t('public.forgot.newPasswordTitle')}</h1>
            <p className="mt-2 text-on-surface-variant">{t('public.forgot.minLength')}</p>
          </div>
          {error && (
            <div role="alert" className="mb-5 flex items-start gap-3 rounded-xl border border-destructive/30 bg-destructive-soft px-4 py-3 text-sm text-destructive animate-fade-in">
              <ShieldCheck className="size-4 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}
          <form
            onSubmit={handleUpdatePassword}
            className="space-y-4 rounded-2xl border border-border bg-surface-container-lowest p-6 shadow-sm"
          >
            <Input
              id="new-password"
              label={t('public.forgot.newPasswordLabel')}
              type="password"
              placeholder={t('public.forgot.minLength')}
              required
              icon={<Lock className="size-4" />}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="new-password"
            />
            <Button type="submit" variant="gradient" size="lg" loading={loading} className="w-full">
              {t('public.forgot.savePassword')}
            </Button>
          </form>
        </div>
      </main>
    )
  }

  if (sent) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background px-4 py-12">
        <div className="w-full max-w-md text-center">
          <div className="mx-auto mb-6 flex size-20 items-center justify-center rounded-full bg-success-soft animate-bounce-in">
            <CheckCircle2 className="size-10 text-success" />
          </div>
          <h1 className="text-3xl font-extrabold tracking-tight text-on-surface">{t('public.forgot.checkEmail')}</h1>
          <p className="mt-3 text-on-surface-variant">
            {t('public.forgot.linkSent')}{' '}
            <strong className="text-on-surface">{email}</strong>
          </p>
          <p className="mt-2 text-sm text-on-surface-variant">
            {t('public.forgot.noEmail')}
          </p>
          <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
            <Link href="/masuk">
              <Button variant="secondary" size="lg">{t('public.forgot.backToLogin')}</Button>
            </Link>
            <Button
              variant="ghost"
              size="lg"
              onClick={() => setSent(false)}
            >
              {t('public.forgot.resend')}
            </Button>
          </div>
        </div>
      </main>
    )
  }

  return (
    <main className="relative flex min-h-screen items-center justify-center bg-background px-4 py-12 sm:px-6">
      <div className="absolute right-4 top-4 z-20">
        <AccessibilityToggle />
      </div>
      <div className="w-full max-w-md">
        <Link href="/" className="mb-8 inline-flex items-center gap-2.5">
          <img src="/logo.png" alt="" className="size-9 rounded-lg object-contain shadow-sm" />
          <span className="text-lg font-extrabold tracking-tight text-on-surface">
            Lex<span className="gradient-text">ora</span> Academy
          </span>
        </Link>

        <Link
          href="/masuk"
          className="mb-6 inline-flex items-center gap-1.5 text-sm font-semibold text-on-surface-variant transition-colors hover:text-primary"
        >
          <ArrowLeft className="size-4" /> {t('public.forgot.backToLogin')}
        </Link>

        <div className="mb-8 rounded-2xl border border-border bg-surface-container-lowest p-6 shadow-sm">
          <h1 className="text-2xl font-extrabold tracking-tight text-on-surface">{t('public.forgot.title')}</h1>
          <p className="mt-2 text-on-surface-variant">
            {t('public.forgot.desc')}
          </p>

          {error && (
            <div role="alert" className="mt-5 flex items-start gap-3 rounded-xl border border-destructive/30 bg-destructive-soft px-4 py-3 text-sm text-destructive animate-fade-in">
              <ShieldCheck className="size-4 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleSendReset} className="mt-6 space-y-4">
            <Input
              id="reset-email"
              label={t('public.forgot.emailLabel')}
              type="email"
              placeholder="nama@email.com"
              required
              icon={<Mail className="size-4" />}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
            />
            <Button type="submit" variant="gradient" size="lg" loading={loading} className="w-full">
              {t('public.forgot.sendResetLink')}
            </Button>
          </form>
        </div>

        <p className="text-center text-xs text-on-surface-variant">
          {t('public.forgot.rememberPassword')}{' '}
          <Link href="/masuk" className="font-semibold text-primary hover:underline">
            {t('public.forgot.loginHere')}
          </Link>
        </p>
      </div>
    </main>
  )
}

export default function ForgotPasswordPage() {
  return (
    <Suspense
      fallback={
        <main className="flex min-h-screen items-center justify-center bg-background">
          <div className="size-12 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        </main>
      }
    >
      <ForgotPasswordForm />
    </Suspense>
  )
}
