'use client'

import { Navbar } from '@/components/layout/navbar'
import { Footer } from '@/components/layout/footer'
import { useI18n } from '@/lib/i18n/client'

export default function SyaratKetentuanPage() {
  const { t } = useI18n()

  return (
    <>
      <Navbar />
      <main className="min-h-screen py-20 px-4">
        <div className="mx-auto max-w-3xl space-y-8">
          <h1 className="text-3xl font-bold text-on-surface">{t('landing.terms.title')}</h1>
          <div className="space-y-4 text-on-surface-variant leading-relaxed">
            <p>{t('landing.terms.updated')}</p>
            <h2 className="text-xl font-semibold text-on-surface pt-4">{t('landing.terms.s1.title')}</h2>
            <p>{t('landing.terms.s1.body')}</p>
            <h2 className="text-xl font-semibold text-on-surface pt-4">{t('landing.terms.s2.title')}</h2>
            <p>{t('landing.terms.s2.body')}</p>
            <h2 className="text-xl font-semibold text-on-surface pt-4">{t('landing.terms.s3.title')}</h2>
            <p>{t('landing.terms.s3.body')}</p>
            <h2 className="text-xl font-semibold text-on-surface pt-4">{t('landing.terms.s4.title')}</h2>
            <p>{t('landing.terms.s4.body')}</p>
            <h2 className="text-xl font-semibold text-on-surface pt-4">{t('landing.terms.s5.title')}</h2>
            <p>{t('landing.terms.s5.body')}</p>
          </div>
        </div>
      </main>
      <Footer />
    </>
  )
}
