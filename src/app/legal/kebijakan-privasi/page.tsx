'use client'

import { Navbar } from '@/components/layout/navbar'
import { Footer } from '@/components/layout/footer'
import { useI18n } from '@/lib/i18n/client'

export default function KebijakanPrivasiPage() {
  const { t } = useI18n()

  return (
    <>
      <Navbar />
      <main className="min-h-screen py-20 px-4">
        <div className="mx-auto max-w-3xl space-y-8">
          <h1 className="text-3xl font-bold text-on-surface">{t('landing.privacy.title')}</h1>
          <div className="space-y-4 text-on-surface-variant leading-relaxed">
            <p>{t('landing.privacy.updated')}</p>
            <h2 className="text-xl font-semibold text-on-surface pt-4">{t('landing.privacy.s1.title')}</h2>
            <p>{t('landing.privacy.s1.body')}</p>
            <h2 className="text-xl font-semibold text-on-surface pt-4">{t('landing.privacy.s2.title')}</h2>
            <p>{t('landing.privacy.s2.body')}</p>
            <h2 className="text-xl font-semibold text-on-surface pt-4">{t('landing.privacy.s3.title')}</h2>
            <p>{t('landing.privacy.s3.body')}</p>
            <h2 className="text-xl font-semibold text-on-surface pt-4">{t('landing.privacy.s4.title')}</h2>
            <p>{t('landing.privacy.s4.body')}</p>
            <h2 className="text-xl font-semibold text-on-surface pt-4">{t('landing.privacy.s5.title')}</h2>
            <p>{t('landing.privacy.s5.body')}</p>
          </div>
        </div>
      </main>
      <Footer />
    </>
  )
}
