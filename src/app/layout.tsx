import type { Metadata } from 'next'
import Script from 'next/script'
import './globals.css'
import { AuthProvider } from '@/lib/auth-context'
import { LanguageProvider } from '@/lib/i18n/client'
import { SkipToContent } from '@/components/shared/skip-to-content'
import { SpecialOfferPopup } from '@/components/landing/special-offer-popup'
import { LANG_COOKIE, isLang, type Lang } from '@/lib/i18n/config'
import { cookies } from 'next/headers'

export const metadata: Metadata = {
  title: 'Lexora Academy - Platform Pembelajaran Bahasa',
  description: 'Belajar bahasa asing dengan pengajar profesional dan sistem belajar terstruktur',
}

const INIT_SCRIPT = `
(function(){try{var d=document.documentElement,s=localStorage;if(s.getItem('a11y-theme'))d.setAttribute('data-theme',s.getItem('a11y-theme'));if(s.getItem('a11y-font-size'))d.setAttribute('data-font-size',s.getItem('a11y-font-size'));if(s.getItem('a11y-line-spacing'))d.setAttribute('data-line-spacing',s.getItem('a11y-line-spacing'));if(s.getItem('a11y-dyslexia')==='true')d.setAttribute('data-dyslexia','true');if(s.getItem('a11y-reduced-motion')==='true')d.setAttribute('data-reduced-motion','true');if(s.getItem('a11y-color-blind')==='true')d.setAttribute('data-color-blind','true');if(window.matchMedia('(prefers-reduced-motion:reduce)').matches)d.setAttribute('data-reduced-motion','true');}catch(e){}}())
`

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  let initialLang: Lang | undefined
  try {
    const cookieStore = await cookies()
    const stored = cookieStore.get(LANG_COOKIE)?.value
    if (isLang(stored)) initialLang = stored
  } catch {
    /* ignore */
  }
  return (
    <html lang={initialLang ?? 'en'} data-theme="dark" data-font-size="normal">
      <head>
        <link
          rel="stylesheet"
          href="https://cdn.jsdelivr.net/npm/open-dyslexic@1.0.3/open-dyslexic-regular.css"
        />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:wght,FILL@100..700,0..1&display=swap"
        />
        <Script id="a11y-init" strategy="beforeInteractive">{INIT_SCRIPT}</Script>
      </head>
      <body className="min-h-screen bg-background antialiased">
        <SkipToContent />
        <LanguageProvider initialLang={initialLang}>
          <AuthProvider>
            {children}
            <SpecialOfferPopup />
          </AuthProvider>
        </LanguageProvider>
      </body>
    </html>
  )
}

