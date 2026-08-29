import type { Metadata } from 'next'
import HomeClient from '@/components/landing/home-client'

export const metadata: Metadata = {
  title: 'Lexora Academy - Platform Pembelajaran Bahasa',
  description: 'Belajar bahasa asing dengan pengajar profesional dan sistem belajar terstruktur',
  openGraph: {
    title: 'Lexora Academy - Platform Pembelajaran Bahasa',
    description: 'Belajar bahasa asing dengan pengajar profesional dan sistem belajar terstruktur',
    type: 'website',
  },
  twitter: { card: 'summary_large_image', title: 'Lexora Academy', description: 'Belajar bahasa asing dengan pengajar profesional' },
}

export default function HomePage() {
  return <HomeClient />
}
