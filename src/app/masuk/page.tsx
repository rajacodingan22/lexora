'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Mail, Lock, Eye, EyeOff, ShieldCheck, Sparkles, Loader2, Zap, TrendingUp, Award } from 'lucide-react'
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
        if (application && application.status === 'pending_review') {
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

          <div className="space-y-6">
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-gradient-to-r from-violet-500/20 to-cyan-500/20 border border-white/10 backdrop-blur-sm">
              <Sparkles className="size-4 text-cyan-400" />
              <span className="text-xs font-bold uppercase tracking-widest text-white/90">{t('public.masuk.smartBadge')}</span>
            </div>
            
            <h2 className="text-4xl font-black leading-tight text-white">
              {t('public.masuk.heroTitleA')}<br />
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-violet-400 via-fuchsia-400 to-cyan-400">
                {t('public.masuk.heroTitleB')}
              </span>
            </h2>
            
            <p className="text-lg text-white/70 max-w-md">
              {t('public.masuk.heroDesc')}
            </p>

            <div className="grid grid-cols-3 gap-4 pt-4">
              {[
                { icon: Zap, label: 'Fast', value: '2x' },
                { icon: TrendingUp, label: 'Growth', value: '+150%' },
                { icon: Award, label: 'Success', value: '98%' },
              ].map((stat) => (
                <div key={stat.label} className="text-center p-4 rounded-2xl bg-white/5 border border-white/10 backdrop-blur-sm hover:bg-white/10 transition-all group">
                  <stat.icon className="size-6 mx-auto mb-2 text-cyan-400 group-hover:scale-110 transition-transform" />
                  <div className="text-2xl font-black text-white">{stat.value}</div>
                  <div className="text-xs text-white/60 uppercase tracking-wide">{stat.label}</div>
                </div>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-2 text-white/60 text-sm">
            <div className="h-px flex-1 bg-gradient-to-r from-transparent via-white/20 to-transparent" />
            <span>Trusted by 10,000+ students</span>
            <div className="h-px flex-1 bg-gradient-to-r from-transparent via-white/20 to-transparent" />
          </div>
        </aside>

        {/* Right Panel - Login Form */}
        <main className="flex items-center justify-center px-6 py-12 relative">
          <div className="absolute right-6 top-6 z-20">
            <AccessibilityToggle />
          </div>
          
          <div className="w-full max-w-md space-y-8">
            {/* Mobile Logo */}
            <Link href="/" className="inline-flex items-center gap-2 lg:hidden group">
              <div className="relative">
                <div className="absolute inset-0 bg-gradient-to-r from-violet-500 to-cyan-500 rounded-lg blur-md opacity-50" />
                <img src="/logo.png" alt="" className="relative size-10 rounded-lg object-contain" />
              </div>
              <span className="text-xl font-black text-white">
                Lexora<span className="text-cyan-400">Academy</span>
              </span>
            </Link>

            {/* Header */}
            <div className="text-center lg:text-left">
              <h1 className="text-3xl font-black tracking-tight text-white">
                {t('public.masuk.welcomeBack')}
              </h1>
              <p className="mt-2 text-white/60">{t('public.masuk.subtitle')}</p>
            </div>

            {/* Error Alert */}
            {error && (
              <div
                role="alert"
                className="flex items-start gap-3 rounded-2xl border border-red-500/30 bg-red-500/10 backdrop-blur-xl px-4 py-3 text-sm text-red-400 animate-fade-in"
              >
                <ShieldCheck className="size-4 shrink-0 mt-0.5" />
                <div className="flex-1">
                  <span>{error}</span>
                  {error.toLowerCase().includes('verif') && (
                    <button
                      type="button"
                      onClick={handleResend}
                      disabled={resending}
                      className="ml-1 font-bold text-cyan-400 hover:text-cyan-300 hover:underline disabled:opacity-50"
                    >
                      {resending ? t('public.masuk.sending') : t('public.masuk.resend')}
                    </button>
                  )}
                  {resent && (
                    <p className="mt-1 text-xs text-emerald-400">{t('public.masuk.resendSuccess')}</p>
                  )}
                </div>
              </div>
            )}

            {/* Login Form */}
            <form onSubmit={handleSubmit} className="space-y-5">
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
                className="bg-white/5 border-white/10 text-white placeholder:text-white/40 focus:border-violet-500 focus:ring-violet-500/20"
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
                className="bg-white/5 border-white/10 text-white placeholder:text-white/40 focus:border-violet-500 focus:ring-violet-500/20"
                suffix={
                  <button
                    type="button"
                    onClick={() => setShowPass(!showPass)}
                    className="rounded-md p-1.5 text-white/40 transition-colors hover:bg-white/10 hover:text-white"
                    aria-label={showPass ? t('public.masuk.hidePassword') : t('public.masuk.showPassword')}
                  >
                    {showPass ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                  </button>
                }
              />

              <div className="flex justify-end">
                <Link href="/lupa-password" className="text-sm font-bold text-cyan-400 hover:text-cyan-300 transition-colors">
                  {t('public.masuk.forgotPassword')}
                </Link>
              </div>

              <Button 
                type="submit" 
                variant="gradient" 
                size="lg" 
                loading={loading} 
                className="w-full text-base font-bold shadow-lg shadow-violet-500/25 hover:shadow-violet-500/40 hover:scale-[1.02] transition-all"
              >
                {t('public.masuk.loginButton')}
              </Button>

              {/* Divider */}
              <div className="relative my-6">
                <div className="h-px bg-gradient-to-r from-transparent via-white/20 to-transparent" />
                <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-gradient-to-br from-violet-950 via-slate-950 to-cyan-950 px-4 text-xs font-black uppercase tracking-widest text-white/40">
                  {t('public.masuk.or')}
                </span>
              </div>

              {/* Google Login */}
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

              {/* Sign Up Link */}
              <p className="text-center text-sm text-white/60">
                {t('public.masuk.noAccount')}{' '}
                <Link href="/daftar" className="font-bold text-transparent bg-clip-text bg-gradient-to-r from-violet-400 to-cyan-400 hover:from-violet-300 hover:to-cyan-300 transition-all">
                  {t('public.masuk.signupFree')}
                </Link>
              </p>
            </form>
          </div>
        </main>
      </div>
    </div>
  )
}
