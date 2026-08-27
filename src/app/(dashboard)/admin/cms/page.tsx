'use client'

import { useEffect, useState, useCallback } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Label } from '@/components/ui/label'
import { ImageUpload } from '@/components/ui/image-upload'
import { createClient } from '@/lib/supabase-client'
import { useI18n } from '@/lib/i18n/client'
import {
  Layout, Save, X, Loader2, Plus, Trash2, Star,
} from 'lucide-react'

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface FaqItem {
  id: string
  question: string
  answer: string
}

interface TestimonialItem {
  id: string
  student_name: string
  student_photo: string
  content: string
  rating: number
}

interface PartnerItem {
  id: string
  name: string
  logo_url: string
  website: string
}

type ToastType = { type: 'success' | 'error'; message: string } | null

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function uid(): string {
  return Math.random().toString(36).substring(2, 11)
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function AdminCMSPage() {
  const { t } = useI18n()
  const supabase = createClient()
  const [activeTab, setActiveTab] = useState('hero')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState<ToastType>(null)

  /* Hero */
  const [hero, setHero] = useState({ headline: '', subheadline: '', cta_text: '', cta_link: '', background_image: '' })

  /* About */
  const [about, setAbout] = useState({ title: '', content: '', mission: '', vision: '', image_url: '' })

  /* FAQ */
  const [faqItems, setFaqItems] = useState<FaqItem[]>([])

  /* Testimonials */
  const [testimonials, setTestimonials] = useState<TestimonialItem[]>([])

  /* Partners */
  const [partners, setPartners] = useState<PartnerItem[]>([])

  /* ---------------------------------------------------------------- */
  /*  Data fetching                                                    */
  /* ---------------------------------------------------------------- */

  const fetchAll = useCallback(async () => {
    setLoading(true)
    try {
      const { data } = await supabase.from('cms_content').select('*')
      if (!data) return

      for (const row of data) {
        switch (row.section) {
          case 'hero':
            setHero({
              headline: row.heading ?? '',
              subheadline: row.content ? (typeof row.content === 'string' ? row.content : '') : '',
              cta_text: (row.meta as any)?.cta_text ?? '',
              cta_link: (row.meta as any)?.cta_link ?? '',
              background_image: row.image_url ?? '',
            })
            break

          case 'about':
            setAbout({
              title: row.heading ?? '',
              content: row.content ? (typeof row.content === 'string' ? row.content : '') : '',
              mission: (row.meta as any)?.mission ?? '',
              vision: (row.meta as any)?.vision ?? '',
              image_url: row.image_url ?? '',
            })
            break

          case 'faq':
            setFaqItems(Array.isArray(row.content) ? (row.content as FaqItem[]) : [])
            break

          case 'testimonials':
            setTestimonials(Array.isArray(row.content) ? (row.content as TestimonialItem[]) : [])
            break

          case 'partners':
            setPartners(Array.isArray(row.content) ? (row.content as PartnerItem[]) : [])
            break
        }
      }
    } catch (err) {
      console.error('Failed to fetch CMS data', err)
    } finally {
      setLoading(false)
    }
  }, [supabase])

  useEffect(() => { fetchAll() }, [fetchAll])

  /* ---------------------------------------------------------------- */
  /*  Save helpers                                                     */
  /* ---------------------------------------------------------------- */

  function showToast(type: 'success' | 'error', message: string) {
    setToast({ type, message })
    setTimeout(() => setToast(null), 4000)
  }

  async function upsertSection(section: string, payload: Record<string, any>) {
    const { error } = await supabase.from('cms_content').upsert(
      {
        section,
        ...payload,
        is_published: true,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'section' },
    )
    if (error) throw error
  }

  /* ---------------------------------------------------------------- */
  /*  Hero save                                                        */
  /* ---------------------------------------------------------------- */

  async function saveHero() {
    setSaving(true)
    try {
      await upsertSection('hero', {
        heading: hero.headline,
        content: hero.subheadline,
        image_url: hero.background_image,
        meta: { cta_text: hero.cta_text, cta_link: hero.cta_link },
      })
      showToast('success', t('admin1.cms.heroSaved'))
    } catch {
      showToast('error', t('admin1.cms.heroSaveError'))
    } finally {
      setSaving(false)
    }
  }

  /* ---------------------------------------------------------------- */
  /*  About save                                                       */
  /* ---------------------------------------------------------------- */

  async function saveAbout() {
    setSaving(true)
    try {
      await upsertSection('about', {
        heading: about.title,
        content: about.content,
        image_url: about.image_url,
        meta: { mission: about.mission, vision: about.vision },
      })
      showToast('success', t('admin1.cms.aboutSaved'))
    } catch {
      showToast('error', t('admin1.cms.aboutSaveError'))
    } finally {
      setSaving(false)
    }
  }

  /* ---------------------------------------------------------------- */
  /*  FAQ save                                                         */
  /* ---------------------------------------------------------------- */

  async function saveFaq() {
    setSaving(true)
    try {
      await upsertSection('faq', {
        heading: 'FAQ',
        content: faqItems,
        meta: {},
      })
      showToast('success', t('admin1.cms.faqSaved'))
    } catch {
      showToast('error', t('admin1.cms.faqSaveError'))
    } finally {
      setSaving(false)
    }
  }

  /* ---------------------------------------------------------------- */
  /*  Testimonials save                                                */
  /* ---------------------------------------------------------------- */

  async function saveTestimonials() {
    setSaving(true)
    try {
      await upsertSection('testimonials', {
        heading: 'Testimonials',
        content: testimonials,
        meta: {},
      })
      showToast('success', t('admin1.cms.testimonialsSaved'))
    } catch {
      showToast('error', t('admin1.cms.testimonialsSaveError'))
    } finally {
      setSaving(false)
    }
  }

  /* ---------------------------------------------------------------- */
  /*  Partners save                                                    */
  /* ---------------------------------------------------------------- */

  async function savePartners() {
    setSaving(true)
    try {
      await upsertSection('partners', {
        heading: 'Partners',
        content: partners,
        meta: {},
      })
      showToast('success', t('admin1.cms.partnersSaved'))
    } catch {
      showToast('error', t('admin1.cms.partnersSaveError'))
    } finally {
      setSaving(false)
    }
  }

  /* ---------------------------------------------------------------- */
  /*  Item management helpers (FAQ, Testimonials, Partners)            */
  /* ---------------------------------------------------------------- */

  function addFaqItem() {
    setFaqItems(prev => [...prev, { id: uid(), question: '', answer: '' }])
  }

  function removeFaqItem(id: string) {
    setFaqItems(prev => prev.filter(i => i.id !== id))
  }

  function updateFaqItem(id: string, field: 'question' | 'answer', value: string) {
    setFaqItems(prev => prev.map(i => (i.id === id ? { ...i, [field]: value } : i)))
  }

  function addTestimonial() {
    setTestimonials(prev => [...prev, { id: uid(), student_name: '', student_photo: '', content: '', rating: 5 }])
  }

  function removeTestimonial(id: string) {
    setTestimonials(prev => prev.filter(i => i.id !== id))
  }

  function updateTestimonial(id: string, field: keyof TestimonialItem, value: any) {
    setTestimonials(prev => prev.map(i => (i.id === id ? { ...i, [field]: value } : i)))
  }

  function addPartner() {
    setPartners(prev => [...prev, { id: uid(), name: '', logo_url: '', website: '' }])
  }

  function removePartner(id: string) {
    setPartners(prev => prev.filter(i => i.id !== id))
  }

  function updatePartner(id: string, field: keyof PartnerItem, value: string) {
    setPartners(prev => prev.map(i => (i.id === id ? { ...i, [field]: value } : i)))
  }

  /* ---------------------------------------------------------------- */
  /*  Render                                                           */
  /* ---------------------------------------------------------------- */

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-6 w-6 animate-spin text-indigo-400" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-on-surface">{t('admin1.cms.title')}</h1>
          <p className="text-on-surface-variant text-sm">{t('admin1.cms.subtitle')}</p>
        </div>
      </div>

      {/* Toast */}
      {toast && (
        <div className={`rounded-lg px-4 py-3 text-sm flex items-center justify-between ${
          toast.type === 'success' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-red-500/10 text-red-400'
        }`}>
          <span>{toast.message}</span>
          <button className="ml-4 shrink-0" onClick={() => setToast(null)} aria-label={t('admin1.cms.dismiss')}>
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="w-full overflow-x-auto">
          <TabsTrigger value="hero"><Layout className="mr-1.5 h-4 w-4" /> {t('admin1.cms.tabHero')}</TabsTrigger>
          <TabsTrigger value="about"><Layout className="mr-1.5 h-4 w-4" /> {t('admin1.cms.tabAbout')}</TabsTrigger>
          <TabsTrigger value="faq"><Layout className="mr-1.5 h-4 w-4" /> {t('admin1.cms.tabFaq')}</TabsTrigger>
          <TabsTrigger value="testimonials"><Star className="mr-1.5 h-4 w-4" /> {t('admin1.cms.tabTestimonials')}</TabsTrigger>
          <TabsTrigger value="partners"><Layout className="mr-1.5 h-4 w-4" /> {t('admin1.cms.tabPartners')}</TabsTrigger>
        </TabsList>

        {/* =============== HERO TAB =============== */}
        <TabsContent value="hero">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <span>{t('admin1.cms.heroTitle')}</span>
                <Button size="sm" onClick={saveHero} disabled={saving}>
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                  {t('admin1.cms.save')}
                </Button>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <Input
                label={t('admin1.cms.headlineLabel')}
                placeholder={t('admin1.cms.headlinePlaceholder')}
                value={hero.headline}
                onChange={e => setHero(prev => ({ ...prev, headline: e.target.value }))}
              />
              <Input
                label={t('admin1.cms.subheadlineLabel')}
                placeholder={t('admin1.cms.subheadlinePlaceholder')}
                value={hero.subheadline}
                onChange={e => setHero(prev => ({ ...prev, subheadline: e.target.value }))}
              />
              <div className="grid gap-4 sm:grid-cols-2">
                <Input
                  label={t('admin1.cms.ctaTextLabel')}
                  placeholder={t('admin1.cms.ctaTextPlaceholder')}
                  value={hero.cta_text}
                  onChange={e => setHero(prev => ({ ...prev, cta_text: e.target.value }))}
                />
                <Input
                  label={t('admin1.cms.ctaLinkLabel')}
                  placeholder={t('admin1.cms.ctaLinkPlaceholder')}
                  value={hero.cta_link}
                  onChange={e => setHero(prev => ({ ...prev, cta_link: e.target.value }))}
                />
              </div>
              <Label>{t('admin1.cms.backgroundImageLabel')}</Label>
              <ImageUpload
                bucket="cms"
                pathPrefix={`hero/${Date.now()}`}
                value={hero.background_image || null}
                onUpload={(url) => setHero(prev => ({ ...prev, background_image: url }))}
                onRemove={() => setHero(prev => ({ ...prev, background_image: '' }))}
              />
            </CardContent>
          </Card>
        </TabsContent>

        {/* =============== ABOUT TAB =============== */}
        <TabsContent value="about">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <span>{t('admin1.cms.aboutTitle')}</span>
                <Button size="sm" onClick={saveAbout} disabled={saving}>
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                  {t('admin1.cms.save')}
                </Button>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <Input
                label={t('admin1.cms.titleLabel')}
                placeholder={t('admin1.cms.titlePlaceholder')}
                value={about.title}
                onChange={e => setAbout(prev => ({ ...prev, title: e.target.value }))}
              />
              <Textarea
                label={t('admin1.cms.contentLabel')}
                placeholder={t('admin1.cms.contentPlaceholder')}
                rows={5}
                value={about.content}
                onChange={e => setAbout(prev => ({ ...prev, content: e.target.value }))}
              />
              <div className="grid gap-4 sm:grid-cols-2">
                <Textarea
                  label={t('admin1.cms.missionLabel')}
                  placeholder={t('admin1.cms.missionPlaceholder')}
                  rows={3}
                  value={about.mission}
                  onChange={e => setAbout(prev => ({ ...prev, mission: e.target.value }))}
                />
                <Textarea
                  label={t('admin1.cms.visionLabel')}
                  placeholder={t('admin1.cms.visionPlaceholder')}
                  rows={3}
                  value={about.vision}
                  onChange={e => setAbout(prev => ({ ...prev, vision: e.target.value }))}
                />
              </div>
              <Label>{t('admin1.cms.imageLabel')}</Label>
              <ImageUpload
                bucket="cms"
                pathPrefix={`about/${Date.now()}`}
                value={about.image_url || null}
                onUpload={(url) => setAbout(prev => ({ ...prev, image_url: url }))}
                onRemove={() => setAbout(prev => ({ ...prev, image_url: '' }))}
              />
            </CardContent>
          </Card>
        </TabsContent>

        {/* =============== FAQ TAB =============== */}
        <TabsContent value="faq">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <span>{t('admin1.cms.faqTitle')}</span>
                <Button size="sm" onClick={saveFaq} disabled={saving}>
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                  {t('admin1.cms.save')}
                </Button>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {faqItems.length === 0 && (
                <p className="text-sm text-muted italic">{t('admin1.cms.faqEmpty')}</p>
              )}
              {faqItems.map((item, idx) => (
                <div key={item.id} className="rounded-xl border border-border bg-surface-container-low p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <Badge variant="outline">#{idx + 1}</Badge>
                    <Button variant="ghost" size="icon-sm" onClick={() => removeFaqItem(item.id)} aria-label={t('admin1.cms.removeFaqItem')}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                  <Input
                    placeholder={t('admin1.cms.questionPlaceholder')}
                    value={item.question}
                    onChange={e => updateFaqItem(item.id, 'question', e.target.value)}
                  />
                  <Textarea
                    placeholder={t('admin1.cms.answerPlaceholder')}
                    rows={3}
                    value={item.answer}
                    onChange={e => updateFaqItem(item.id, 'answer', e.target.value)}
                  />
                </div>
              ))}
              <Button variant="outline" size="sm" onClick={addFaqItem}>
                <Plus className="h-4 w-4" /> {t('admin1.cms.addFaqItem')}
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        {/* =============== TESTIMONIALS TAB =============== */}
        <TabsContent value="testimonials">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <span>{t('admin1.cms.testimonialsTitle')}</span>
                <Button size="sm" onClick={saveTestimonials} disabled={saving}>
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                  {t('admin1.cms.save')}
                </Button>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {testimonials.length === 0 && (
                <p className="text-sm text-muted italic">{t('admin1.cms.testimonialsEmpty')}</p>
              )}
              {testimonials.map((item, idx) => (
                <div key={item.id} className="rounded-xl border border-border bg-surface-container-low p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <Badge variant="outline">#{idx + 1}</Badge>
                    <Button variant="ghost" size="icon-sm" onClick={() => removeTestimonial(item.id)} aria-label={t('admin1.cms.removeTestimonial')}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Input
                      label={t('admin1.cms.studentNameLabel')}
                      placeholder={t('admin1.cms.studentNamePlaceholder')}
                      value={item.student_name}
                      onChange={e => updateTestimonial(item.id, 'student_name', e.target.value)}
                    />
                    <Label>{t('admin1.cms.photoLabel')}</Label>
                    <ImageUpload
                      bucket="cms"
                      pathPrefix={`testimonials/${Date.now()}`}
                      value={item.student_photo || null}
                      onUpload={(url) => updateTestimonial(item.id, 'student_photo', url)}
                      onRemove={() => updateTestimonial(item.id, 'student_photo', '')}
                    />
                  </div>
                  <Textarea
                    label={t('admin1.cms.testimonialContentLabel')}
                    placeholder={t('admin1.cms.contentPlaceholder2')}
                    rows={3}
                    value={item.content}
                    onChange={e => updateTestimonial(item.id, 'content', e.target.value)}
                  />
                  <div>
                    <Label>{t('admin1.cms.ratingLabel')}</Label>
                    <div className="flex items-center gap-1">
                      {Array.from({ length: 5 }).map((_, i) => (
                        <button
                          key={i}
                          type="button"
                          onClick={() => updateTestimonial(item.id, 'rating', i + 1)}
                          aria-label={t('admin1.cms.starAria', { count: i + 1 })}
                        >
                          <Star
                            className={`h-5 w-5 ${
                              i < item.rating
                                ? 'fill-warning text-warning'
                                : 'text-border'
                            }`}
                          />
                        </button>
                      ))}
                      <span className="ml-2 text-sm text-on-surface-variant">{item.rating}/5</span>
                    </div>
                  </div>
                </div>
              ))}
              <Button variant="outline" size="sm" onClick={addTestimonial}>
                <Plus className="h-4 w-4" /> {t('admin1.cms.addTestimonial')}
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        {/* =============== PARTNERS TAB =============== */}
        <TabsContent value="partners">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <span>{t('admin1.cms.partnersTitle')}</span>
                <Button size="sm" onClick={savePartners} disabled={saving}>
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                  {t('admin1.cms.save')}
                </Button>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {partners.length === 0 && (
                <p className="text-sm text-muted italic">{t('admin1.cms.partnersEmpty')}</p>
              )}
              {partners.map((item, idx) => (
                <div key={item.id} className="rounded-xl border border-border bg-surface-container-low p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <Badge variant="outline">#{idx + 1}</Badge>
                    <Button variant="ghost" size="icon-sm" onClick={() => removePartner(item.id)} aria-label={t('admin1.cms.removePartner')}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                  <Input
                    label={t('admin1.cms.partnerNameLabel')}
                    placeholder={t('admin1.cms.partnerNamePlaceholder')}
                    value={item.name}
                    onChange={e => updatePartner(item.id, 'name', e.target.value)}
                  />
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Label>{t('admin1.cms.logoLabel')}</Label>
                    <ImageUpload
                      bucket="cms"
                      pathPrefix={`partners/${Date.now()}`}
                      value={item.logo_url || null}
                      onUpload={(url) => updatePartner(item.id, 'logo_url', url)}
                      onRemove={() => updatePartner(item.id, 'logo_url', '')}
                    />
                    <Input
                      label={t('admin1.cms.websiteLabel')}
                      placeholder={t('admin1.cms.websitePlaceholder')}
                      value={item.website}
                      onChange={e => updatePartner(item.id, 'website', e.target.value)}
                    />
                  </div>
                </div>
              ))}
              <Button variant="outline" size="sm" onClick={addPartner}>
                <Plus className="h-4 w-4" /> {t('admin1.cms.addPartner')}
              </Button>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
