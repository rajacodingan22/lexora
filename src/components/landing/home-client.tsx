'use client'

import { Navbar } from '@/components/layout/navbar'
import { Footer } from '@/components/layout/footer'
import { HeroSection } from '@/components/landing/hero'
import { LanguagesSection } from '@/components/landing/languages'
import { FeaturesSection } from '@/components/landing/features'
import { CoursesSection } from '@/components/landing/courses'
import { TeachersSection } from '@/components/landing/teachers'
import { NewsEventsSection } from '@/components/landing/news-events'
import { TestimonialsSection } from '@/components/landing/testimonials'
import { HowItWorksSection } from '@/components/landing/how-it-works'
import { SpecialOfferPopup } from '@/components/landing/special-offer-popup'
import { useI18n } from '@/lib/i18n/client'
import { Search, UserPlus, BookOpen, Award } from 'lucide-react'

export default function HomeClient() {
  const { t } = useI18n()

  const languages = [
    { name: t('public.home.langEnglish'), code: 'en' },
    { name: t('public.home.langJapanese'), code: 'ja' },
    { name: t('public.home.langKorean'), code: 'ko' },
    { name: t('public.home.langArabic'), code: 'ar' },
    { name: t('public.home.langPersian'), code: 'fa' },
    { name: t('public.home.langIndonesian'), code: 'id' },
    { name: t('public.home.langTurkish'), code: 'tr' },
    { name: t('public.home.langChinese'), code: 'zh' },
  ]

  const testimonialText = (key: string) => ({ id: t(key), en: t(key) })

  const testimonials = [
    { id: '1', name: 'Saraswati Putri', role: t('public.home.testimonialRole1'), text: testimonialText('public.home.testimonial1'), avatar_url: null, rating: 5, sort_order: 1, is_active: true, created_at: new Date().toISOString() },
    { id: '2', name: 'Andika Pratama', role: t('public.home.testimonialRole2'), text: testimonialText('public.home.testimonial2'), avatar_url: null, rating: 5, sort_order: 2, is_active: true, created_at: new Date().toISOString() },
    { id: '3', name: 'Maya Indah', role: t('public.home.testimonialRole3'), text: testimonialText('public.home.testimonial3'), avatar_url: null, rating: 5, sort_order: 3, is_active: true, created_at: new Date().toISOString() },
  ]

  return (
    <>
      <Navbar />
      <main className="min-h-screen bg-gradient-to-b from-background via-surface-container-lowest to-background">
        <HeroSection testimonials={testimonials} heroData={{ title: t('public.home.heroTitle'), subtitle: t('public.home.heroSubtitle'), ctaText: t('public.home.heroCta'), ctaLink: '/daftar', featurePills: [] }} />
        <LanguagesSection languages={languages} />
        <FeaturesSection />
        <CoursesSection />
        <TeachersSection />
        <HowItWorksSection steps={[
          { num: '01', title: t('landing.howItWorks.step1Title'), desc: t('landing.howItWorks.step1Desc'), icon: Search },
          { num: '02', title: t('landing.howItWorks.step2Title'), desc: t('landing.howItWorks.step2Desc'), icon: UserPlus },
          { num: '03', title: t('landing.howItWorks.step3Title'), desc: t('landing.howItWorks.step3Desc'), icon: BookOpen },
          { num: '04', title: t('landing.howItWorks.step4Title'), desc: t('landing.howItWorks.step4Desc'), icon: Award },
        ]} />
        <TestimonialsSection testimonials={testimonials} />
        <NewsEventsSection />
      </main>
      <Footer />
      <SpecialOfferPopup />
    </>
  )
}
