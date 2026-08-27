'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { Navbar } from '@/components/layout/navbar'
import { Footer } from '@/components/layout/footer'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ArrowLeft, Calendar, Clock, Loader2 } from 'lucide-react'
import { createClient } from '@/lib/supabase-client'
import { useI18n } from '@/lib/i18n/client'

interface ArticleData {
  slug: string
  title: string
  date: string
  category: string
  author: string
  readTime: string
  content: string
}

const LOCALE_MAP: Record<string, string> = { en: 'en-US', id: 'id-ID', zh: 'zh-CN' }

function formatDate(dateStr: string | null, locale: string): string {
  if (!dateStr) return ''
  try {
    return new Intl.DateTimeFormat(LOCALE_MAP[locale] || 'en-US', { dateStyle: 'medium' }).format(new Date(dateStr))
  } catch {
    return dateStr
  }
}

export default function BeritaDetailPage() {
  const supabase = createClient()
  const { t, lang } = useI18n()
  const params = useParams()
  const slug = params.slug as string
  const [mounted, setMounted] = useState(false)
  const [article, setArticle] = useState<ArticleData | null>(null)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)

  useEffect(() => { setMounted(true) }, [])

  useEffect(() => {
    async function fetchArticle() {
      setLoading(true)
      try {
        const { data, error: fetchError } = await supabase
          .from('news')
          .select('*')
          .eq('slug', slug)
          .eq('status', 'published')
          .single()

        if (fetchError) {
          if (fetchError.code === 'PGRST116') {
            setNotFound(true)
          } else {
            throw fetchError
          }
        } else if (data) {
          const paragraphs = (data.content || '').split('\n').filter(Boolean)
          setArticle({
            slug: data.slug,
            title: data.title,
            date: formatDate(data.published_at || data.created_at, lang),
            category: data.category || t('public.berita.categoryFallback'),
            author: t('public.berita.authorFallback'),
            readTime: t('public.berita.readTime', { count: Math.max(1, Math.ceil((data.content || '').length / 1000)) }),
            content: paragraphs.join('\n\n'),
          })
        } else {
          setNotFound(true)
        }
      } catch (err) {
        console.error('Failed to fetch article', err)
        setNotFound(true)
      } finally {
        setLoading(false)
      }
    }
    if (mounted) {
      fetchArticle()
    }
  }, [slug, supabase, mounted, t, lang])

  if (!mounted || loading) {
    return (
      <>
        <Navbar />
        <main className="flex min-h-[calc(100vh-4rem)] items-center justify-center px-4">
          <Loader2 className="h-8 w-8 animate-spin text-indigo-400" />
        </main>
        <Footer />
      </>
    )
  }

  if (notFound || !article) {
    return (
      <>
        <Navbar />
        <main className="flex min-h-[calc(100vh-4rem)] items-center justify-center px-4 py-12">
          <div className="text-center">
            <h1 className="text-2xl font-bold text-on-surface">{t('public.berita.notFoundTitle')}</h1>
            <p className="mt-2 text-on-surface-variant">{t('public.berita.notFoundDesc')}</p>
            <Link href="/berita"><Button variant="outline" className="mt-6">{t('public.berita.backToNews')}</Button></Link>
          </div>
        </main>
        <Footer />
      </>
    )
  }

  return (
    <>
      <Navbar />
      <main className="min-h-screen">
        <section className="py-16">
          <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
            <Link
              href="/event"
              className="mb-8 inline-flex items-center gap-1 text-sm text-indigo-400 hover:text-indigo-300 transition-colors"
            >
              <ArrowLeft className="h-4 w-4" /> {t('public.berita.backToEvents')}
            </Link>

            <div className="mb-6 flex flex-wrap items-center gap-3">
              <Badge variant="default">{article.category}</Badge>
              <span className="flex items-center gap-1 text-sm text-muted">
                <Calendar className="h-4 w-4" />
                {article.date}
              </span>
              <span className="flex items-center gap-1 text-sm text-muted">
                <Clock className="h-4 w-4" />
                {article.readTime}
              </span>
            </div>

            <h1 className="text-3xl font-bold text-on-surface leading-tight mb-4">
              {article.title}
            </h1>

            <p className="text-sm text-on-surface-variant mb-10">
              {t('public.berita.byAuthor', { author: article.author })}
            </p>

            <div className="prose prose-invert max-w-none">
              <div className="rounded-xl border border-border bg-surface p-6 sm:p-8">
                {article.content.split('\n\n').map((paragraph, i) => (
                  <p key={i} className="mb-4 last:mb-0 text-on-surface leading-relaxed">
                    {paragraph}
                  </p>
                ))}
              </div>
            </div>

            <div className="mt-10 text-center">
              <Link href="/event">
                <Button variant="outline">
                  <ArrowLeft className="h-4 w-4" /> {t('public.berita.moreNews')}
                </Button>
              </Link>
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </>
  )
}
