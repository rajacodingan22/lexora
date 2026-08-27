import Link from 'next/link'
import { ArrowLeft, SearchX } from 'lucide-react'
import { Navbar } from '@/components/layout/navbar'
import { Footer } from '@/components/layout/footer'
import { getI18n } from '@/lib/i18n/server'

export default async function NotFound() {
  const { t } = await getI18n()
  return (
    <>
      <Navbar />
      <main className="flex min-h-[calc(100vh-4rem)] flex-col items-center justify-center px-4">
        <div className="w-full max-w-md text-center">
          <div className="mx-auto mb-6 flex size-24 items-center justify-center rounded-3xl glass-card">
            <SearchX className="size-10 text-primary" aria-hidden="true" />
          </div>
          <div className="mb-2 font-mono text-sm font-bold uppercase tracking-widest text-muted">Error 404</div>
          <h1 className="text-3xl font-extrabold tracking-tight text-on-surface">
            {t('public.notFound.titleA')} <span className="gradient-text">{t('public.notFound.titleB')}</span>
          </h1>
          <p className="mt-3 text-on-surface-variant">
            {t('public.notFound.desc')}
          </p>
          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link
              href="/"
              className="btn-gradient inline-flex items-center gap-2 rounded-xl px-6 py-3 text-sm font-bold text-primary-foreground shadow-sm transition-all hover:shadow-glow"
            >
              <ArrowLeft className="size-4" />
              {t('public.notFound.backHome')}
            </Link>
            <Link
              href="/kontak"
              className="glass-card inline-flex items-center gap-2 rounded-xl px-6 py-3 text-sm font-bold text-on-surface transition-all hover:bg-surface-hover"
            >
              {t('public.notFound.contact')}
            </Link>
          </div>
        </div>
      </main>
      <Footer />
    </>
  )
}
