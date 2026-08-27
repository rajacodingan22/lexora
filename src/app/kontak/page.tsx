'use client'

import { useState, useEffect } from 'react'
import { Navbar } from '@/components/layout/navbar'
import { Footer } from '@/components/layout/footer'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent } from '@/components/ui/card'
import { Mail, Phone, MapPin, Send, MessageSquare, CheckCircle, Loader2 } from 'lucide-react'
import { createClient } from '@/lib/supabase-client'
import { useI18n } from '@/lib/i18n/client'

interface ContactInfo {
  icon: string
  label: string
  value: string
  desc: string
}

const iconMap: Record<string, React.ElementType> = { Phone, Mail, MapPin }

export default function KontakPage() {
  const supabase = createClient()
  const { t } = useI18n()
  const [contactInfo, setContactInfo] = useState<ContactInfo[]>([])
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState({ name: '', email: '', subject: '', message: '' })
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)

  useEffect(() => {
    async function fetchContact() {
      try {
        const { data } = await supabase
          .from('cms_content')
          .select('heading, content, meta')
          .eq('section', 'contact')
          .single()

        if (data?.meta) {
          const meta = data.meta as any
          if (Array.isArray(meta.contact_info)) {
            setContactInfo(meta.contact_info)
          }
        }
      } catch (err) {
        console.error('Failed to fetch contact info', err)
      } finally {
        setLoading(false)
      }
    }
    fetchContact()
  }, [supabase])

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    if (!form.name || !form.email || !form.subject || !form.message) {
      setError(t('public.kontak.requiredError'))
      return
    }
    setSubmitting(true)
    try {
      const res = await fetch('/api/kontak', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || t('public.kontak.sendError'))
      }
      setSuccess(true)
      setForm({ name: '', email: '', subject: '', message: '' })
    } catch (err) {
      setError(err instanceof Error ? err.message : t('public.kontak.genericError'))
    } finally {
      setSubmitting(false)
    }
  }

  if (success) {
    return (
      <>
        <Navbar />
        <main className="flex min-h-[calc(100vh-4rem)] items-center justify-center px-4 py-12">
          <div className="w-full max-w-md text-center">
            <CheckCircle className="mx-auto h-12 w-12 text-emerald-400 mb-4" />
            <h1 className="text-2xl font-bold text-on-surface">{t('public.kontak.successTitle')}</h1>
            <p className="mt-2 text-on-surface-variant">{t('public.kontak.successDesc')}</p>
            <Button variant="outline" className="mt-6" onClick={() => setSuccess(false)}>{t('public.kontak.sendAnother')}</Button>
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
        <section className="border-b border-border py-16">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="mb-12 text-center">
              <h1 className="text-4xl font-bold text-on-surface">{t('public.kontak.title')}</h1>
              <p className="mt-2 text-lg text-on-surface-variant">{t('public.kontak.subtitle')}</p>
            </div>

            <div className="mx-auto grid max-w-5xl gap-8 lg:grid-cols-2">
              <div>
                <h2 className="text-xl font-semibold text-on-surface mb-6">{t('public.kontak.sendMessage')}</h2>
                {error && (
                  <div className="mb-4 rounded-lg bg-red-500/10 border border-red-500/20 px-4 py-3 text-sm text-red-400">
                    {error}
                  </div>
                )}
                <form onSubmit={handleSubmit} className="space-y-4">
                  <Input
                    label={t('public.kontak.nameLabel')}
                    name="name"
                    placeholder={t('public.kontak.namePlaceholder')}
                    value={form.name}
                    onChange={handleChange}
                    icon={<MessageSquare className="h-4 w-4" />}
                  />
                  <Input
                    label={t('public.kontak.emailLabel')}
                    name="email"
                    type="email"
                    placeholder="nama@email.com"
                    value={form.email}
                    onChange={handleChange}
                    icon={<Mail className="h-4 w-4" />}
                  />
                  <Input
                    label={t('public.kontak.subjectLabel')}
                    name="subject"
                    placeholder={t('public.kontak.subjectPlaceholder')}
                    value={form.subject}
                    onChange={handleChange}
                    icon={<Send className="h-4 w-4" />}
                  />
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium text-on-surface">{t('public.kontak.messageLabel')}</label>
                    <textarea
                      name="message"
                      rows={5}
                      placeholder={t('public.kontak.messagePlaceholder')}
                      value={form.message}
                      onChange={handleChange}
                      className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-on-surface placeholder:text-muted transition-colors duration-150 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 resize-none"
                    />
                  </div>
                  <Button type="submit" loading={submitting} className="w-full">
                    <Send className="h-4 w-4" />
                    {t('public.kontak.sendMessage')}
                  </Button>
                </form>
              </div>

              <div className="space-y-6">
                <h2 className="text-xl font-semibold text-on-surface mb-6">{t('public.kontak.infoTitle')}</h2>
                {loading ? (
                  <div className="flex justify-center py-8">
                    <Loader2 className="h-5 w-5 animate-spin text-indigo-400" />
                  </div>
                ) : contactInfo.length === 0 ? (
                  <p className="text-on-surface-variant">{t('public.kontak.empty')}</p>
                ) : (
                  contactInfo.map((item) => {
                    const Icon = iconMap[item.icon] || Mail
                    return (
                      <Card key={item.label} className="cursor-pointer transition-all hover:border-indigo-500/30 hover:shadow-md">
                        <CardContent className="flex items-start gap-4 p-5">
                          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-indigo-500/10">
                            <Icon className="h-5 w-5 text-indigo-400" />
                          </div>
                          <div>
                            <p className="text-sm text-on-surface-variant">{item.label}</p>
                            <p className="font-medium text-on-surface">{item.value}</p>
                            <p className="text-xs text-muted mt-0.5">{item.desc}</p>
                          </div>
                        </CardContent>
                      </Card>
                    )
                  })
                )}
              </div>
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </>
  )
}
