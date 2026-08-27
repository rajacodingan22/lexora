'use client'

import { useEffect, useState } from 'react'
import { Navbar } from '@/components/layout/navbar'
import { Footer } from '@/components/layout/footer'
import { Heart, Target, Globe, Loader2 } from 'lucide-react'
import { createClient } from '@/lib/supabase-client'
import { useI18n } from '@/lib/i18n/client'

interface CmsFaqItem {
  id: string
  question: string
  answer: string
}

export default function AboutPage() {
  const supabase = createClient()
  const { t } = useI18n()
  const [about, setAbout] = useState<{ title: string; content: string; mission: string; vision: string } | null>(null)
  const [faqItems, setFaqItems] = useState<CmsFaqItem[]>([])
  const [aboutImage, setAboutImage] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function fetchCMS() {
      try {
        const { data } = await supabase.from('cms_content').select('*')
        if (!data) return

        for (const row of data) {
          if (row.section === 'about') {
            setAbout({
              title: row.heading ?? t('public.about.titleFallback'),
              content: (typeof row.content === 'string' ? row.content : '') || '',
              mission: (row.meta as any)?.mission ?? '',
              vision: (row.meta as any)?.vision ?? '',
            })
            if (row.image_url) setAboutImage(row.image_url)
          }
          if (row.section === 'faq' && Array.isArray(row.content) && row.content.length > 0) {
            setFaqItems(row.content as CmsFaqItem[])
          }
        }
      } catch (err) {
        console.error('Failed to fetch CMS data', err)
      } finally {
        setLoading(false)
      }
    }
    fetchCMS()
  }, [supabase, t])

  const details = about ? [
    { icon: Target, title: t('public.about.mission'), desc: about.mission },
    { icon: Heart, title: t('public.about.vision'), desc: about.vision },
    { icon: Globe, title: t('public.about.commitment'), desc: t('public.about.commitmentDesc') },
  ] : []

  return (
    <>
      <Navbar />
      <main className="min-h-screen">
        <section className="border-b border-border py-16">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            {loading ? (
              <div className="flex items-center justify-center py-20">
                <Loader2 className="h-8 w-8 animate-spin text-indigo-400" />
              </div>
            ) : about ? (
              <>
                <div className="mx-auto max-w-3xl text-center mb-16">
                  <h1 className="text-4xl font-bold text-on-surface">{about.title}</h1>
                  <p className="mt-4 text-lg text-on-surface-variant">{about.content}</p>
                  {aboutImage && (
                    <img src={aboutImage} alt={about.title} className="mt-8 mx-auto rounded-xl max-h-64 object-cover" />
                  )}
                </div>

                <div className="grid gap-8 md:grid-cols-2 lg:grid-cols-3">
                  {details.map((item) => (
                    <div key={item.title} className="rounded-xl border border-border bg-surface p-6 text-center">
                      <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-indigo-500/10">
                        <item.icon className="h-6 w-6 text-indigo-400" />
                      </div>
                      <h3 className="font-semibold text-on-surface">{item.title}</h3>
                      <p className="mt-2 text-sm text-on-surface-variant">{item.desc}</p>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <div className="py-20 text-center">
                <p className="text-on-surface-variant">{t('public.about.empty')}</p>
              </div>
            )}
          </div>
        </section>

        {faqItems.length > 0 && (
          <section className="py-16">
            <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
              <h2 className="text-3xl font-bold text-on-surface text-center mb-10">{t('public.about.faqTitle')}</h2>
              <div className="space-y-4">
                {faqItems.map((item) => (
                  <details key={item.id} className="group rounded-xl border border-border bg-surface overflow-hidden">
                    <summary className="flex cursor-pointer items-center justify-between px-6 py-4 text-sm font-semibold text-on-surface hover:bg-surface-hover [&::-webkit-details-marker]:hidden">
                      {item.question}
                      <svg className="ml-2 h-4 w-4 shrink-0 text-on-surface-variant transition-transform group-open:rotate-180" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clipRule="evenodd" />
                      </svg>
                    </summary>
                    <div className="px-6 pb-4 text-sm text-on-surface-variant leading-relaxed">
                      {item.answer}
                    </div>
                  </details>
                ))}
              </div>
            </div>
          </section>
        )}
      </main>
      <Footer />
    </>
  )
}
