'use client'

import { useState, useEffect } from 'react'
import { Navbar } from '@/components/layout/navbar'
import { Footer } from '@/components/layout/footer'
import { ChevronDown, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { createClient } from '@/lib/supabase-client'
import { useI18n } from '@/lib/i18n/client'

export default function FAQPage() {
  const supabase = createClient()
  const { t } = useI18n()
  const [openIndex, setOpenIndex] = useState<number | null>(null)
  const [faqs, setFaqs] = useState<{ q: string; a: string }[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function fetchFaq() {
      try {
        const { data, error: fetchError } = await supabase
          .from('cms_content')
          .select('content')
          .eq('section', 'faq')
          .single()

        if (fetchError) throw fetchError

        if (data && Array.isArray(data.content)) {
          const parsed = (data.content as Array<{ question: string; answer: string }>)
            .filter((item) => item.question && item.answer)
            .map((item) => ({ q: item.question, a: item.answer }))
          if (parsed.length > 0) {
            setFaqs(parsed)
          }
        }
      } catch (err) {
        console.error('Failed to fetch FAQ from CMS', err)
      } finally {
        setLoading(false)
      }
    }
    fetchFaq()
  }, [supabase])

  return (
    <>
      <Navbar />
      <main className="min-h-screen">
        <section className="border-b border-border py-16">
          <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
            <div className="mb-12 text-center">
              <h1 className="text-4xl font-bold text-on-surface">FAQ</h1>
              <p className="mt-2 text-lg text-on-surface-variant">{t('public.faq.subtitle')}</p>
            </div>
            {loading ? (
              <div className="flex items-center justify-center py-20">
                <Loader2 className="h-8 w-8 animate-spin text-indigo-400" />
              </div>
            ) : faqs.length === 0 ? (
              <div className="py-20 text-center">
                <p className="text-on-surface-variant">{t('public.faq.empty')}</p>
              </div>
            ) : (
              <div className="space-y-3">
                {faqs.map((faq, idx) => (
                  <div key={idx} className="rounded-xl border border-border bg-surface overflow-hidden">
                    <button
                      onClick={() => setOpenIndex(openIndex === idx ? null : idx)}
                      className="flex w-full items-center justify-between p-5 text-left transition-colors hover:bg-surface-container-high"
                    >
                      <span className="font-medium text-on-surface">{faq.q}</span>
                      <ChevronDown className={cn('h-5 w-5 text-muted transition-transform duration-200', openIndex === idx && 'rotate-180')} />
                    </button>
                    {openIndex === idx && (
                      <div className="border-t border-border px-5 py-4">
                        <p className="text-sm text-on-surface-variant">{faq.a}</p>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>
      </main>
      <Footer />
    </>
  )
}
