'use client'

import Link from 'next/link'
import { CheckCircle2, ArrowRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useI18n } from '@/lib/i18n/client'
import { AccessibilityToggle } from '@/components/shared/accessibility-toggle'

export default function EmailVerificationPage() {
  const { t } = useI18n()
  return (
    <main className="relative flex min-h-screen items-center justify-center bg-background px-4 py-12 sm:px-6">
      <div className="absolute right-4 top-4 z-20">
        <AccessibilityToggle />
      </div>
      <div className="w-full max-w-md text-center">
        <Link href="/" className="mb-8 inline-flex items-center gap-2.5">
          <img src="/logo.png" alt="" className="size-10 rounded-xl object-contain shadow-sm" />
          <span className="text-xl font-extrabold tracking-tight text-on-surface">
            Lex<span className="gradient-text">ora</span> Academy
          </span>
        </Link>

        <div className="rounded-3xl border border-border bg-surface-container-lowest p-8 shadow-sm">
          <div className="mx-auto mb-6 flex size-20 items-center justify-center rounded-full bg-success-soft animate-bounce-in">
            <CheckCircle2 className="size-10 text-success" />
          </div>
          <h1 className="text-3xl font-extrabold tracking-tight text-on-surface">
            {t('public.verify.title')}
          </h1>
          <p className="mt-3 text-on-surface-variant">
            {t('public.verify.desc')}
          </p>

          <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
            <Link href="/masuk">
              <Button variant="gradient" size="lg">
                {t('public.verify.login')}
                <ArrowRight className="size-5" />
              </Button>
            </Link>
            <Link href="/">
              <Button variant="ghost" size="lg">
                {t('public.verify.backHome')}
              </Button>
            </Link>
          </div>
        </div>

        <p className="mt-6 text-xs text-on-surface-variant">
          {t('public.verify.needHelp')}{' '}
          <Link href="/kontak" className="font-semibold text-primary hover:underline">
            {t('public.verify.contactSupport')}
          </Link>
        </p>
      </div>
    </main>
  )
}
