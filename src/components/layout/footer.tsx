'use client'

import Link from 'next/link'
import { Mail, MapPin, Phone } from 'lucide-react'
import { useI18n } from '@/lib/i18n/client'

const navSections = [
  {
    titleKey: 'nav.program',
    ariaLabelKey: 'footer.projectAria',
    links: [
      { labelKey: 'footer.langEnglish', href: '/project?lang=en' },
      { labelKey: 'footer.langJapanese', href: '/project?lang=ja' },
      { labelKey: 'footer.langKorean', href: '/project?lang=ko' },
      { labelKey: 'footer.langArabic', href: '/project?lang=ar' },
      { labelKey: 'footer.langBipa', href: '/project?lang=id' },
      { labelKey: 'footer.langTurkish', href: '/project?lang=tr' },
      { labelKey: 'footer.langChinese', href: '/project?lang=zh' },
    ],
  },
]

// Inline SVGs avoid missing lucide-react icons (Github/Instagram/Linkedin)
const socials = [
  {
    label: 'Instagram',
    href: 'https://instagram.com/lexora',
    path: 'M7.8 2h8.4C19.4 2 22 4.6 22 7.8v8.4a5.8 5.8 0 0 1-5.8 5.8H7.8C4.6 22 2 19.4 2 16.2V7.8A5.8 5.8 0 0 1 7.8 2Zm-.2 2A3.6 3.6 0 0 0 4 7.6v8.8C4 18.39 5.61 20 7.6 20h8.8a3.6 3.6 0 0 0 3.6-3.6V7.6C20 5.61 18.39 4 16.4 4H7.6Zm9.65 2.5a1.25 1.25 0 1 1 0 2.5 1.25 1.25 0 0 1 0-2.5ZM12 7a5 5 0 1 1 0 10 5 5 0 0 1 0-10Zm0 2a3 3 0 1 0 0 6 3 3 0 0 0 0-6Z',
  },
  {
    label: 'LinkedIn',
    href: 'https://linkedin.com/company/lexora',
    path: 'M20.45 20.45h-3.55v-5.57c0-1.33-.02-3.04-1.85-3.04-1.85 0-2.14 1.45-2.14 2.95v5.66H9.36V9h3.41v1.56h.05a3.74 3.74 0 0 1 3.37-1.85c3.6 0 4.27 2.37 4.27 5.46v6.28ZM5.34 7.43a2.07 2.07 0 1 1 0-4.14 2.07 2.07 0 0 1 0 4.14ZM7.12 20.45H3.56V9h3.56v11.45ZM22.22 0H1.77C.79 0 0 .77 0 1.72v20.56C0 23.23.79 24 1.77 24h20.45c.98 0 1.78-.77 1.78-1.72V1.72C24 .77 23.2 0 22.22 0Z',
  },
  {
    label: 'X (Twitter)',
    href: 'https://x.com/lexora',
    path: 'M18.244 2H21l-6.522 7.45L22.5 22h-6.737l-5.273-6.896L4.5 22H1.74l6.978-7.97L1.5 2h6.92l4.768 6.298L18.244 2Zm-1.18 18h1.86L7.04 4H5.05l12.013 16Z',
  },
]

export function Footer() {
  const { t } = useI18n()
  return (
    <footer className="border-t border-border bg-surface-container-low">
      <div className="mx-auto max-w-7xl px-4 py-14 sm:px-6 lg:px-8">
        <div className="grid gap-10 lg:grid-cols-12">
          <div className="lg:col-span-5">
            <Link href="/" className="flex items-center gap-2.5" aria-label={t('footer.homeAria')}>
              <img
                src="/logo.png"
                alt=""
                className="size-10 rounded-xl object-contain shadow-sm"
              />
              <span className="text-xl font-extrabold tracking-tight text-on-surface">
                Lex<span className="gradient-text">ora</span> Academy
              </span>
            </Link>
            <p className="mt-4 max-w-md text-sm leading-relaxed text-on-surface-variant">
              {t('footer.about')}
            </p>
            <div className="mt-6 flex items-center gap-2">
              {socials.map(({ label, href, path }) => (
                <a
                  key={label}
                  href={href}
                  aria-label={label}
                  target="_blank"
                  rel="noreferrer"
                  className="flex size-9 items-center justify-center rounded-lg border border-border bg-surface-container-lowest text-on-surface-variant transition-all duration-[var(--dur-fast)] hover:scale-[1.06] hover:border-primary hover:text-primary"
                >
                  <svg
                    className="size-4"
                    viewBox="0 0 24 24"
                    fill="currentColor"
                    aria-hidden="true"
                  >
                    <path d={path} />
                  </svg>
                </a>
              ))}
            </div>
          </div>

          {navSections.map((section) => (
            <nav key={section.titleKey} aria-label={t(section.ariaLabelKey)} className="lg:col-span-3">
              <h3 className="mb-4 text-sm font-bold tracking-wide text-on-surface">{t(section.titleKey)}</h3>
              <ul className="space-y-2.5">
                {section.links.map((link) => (
                  <li key={link.href}>
                    <Link
                      href={link.href}
                      className="text-sm text-on-surface-variant transition-colors duration-[var(--dur-fast)] hover:text-primary"
                    >
                      {t(link.labelKey)}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          ))}

          <div className="lg:col-span-4">
            <h3 className="mb-4 text-sm font-bold tracking-wide text-on-surface">{t('footer.contact')}</h3>
            <ul className="space-y-3 text-sm text-on-surface-variant">
              <li className="flex items-center gap-2.5">
                <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary-soft text-primary">
                  <Mail className="size-4" aria-hidden="true" />
                </span>
                <a href="mailto:hello@lexora.com" className="hover:text-primary">
                  hello@lexora.com
                </a>
              </li>
              <li className="flex items-center gap-2.5">
                <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary-soft text-primary">
                  <Phone className="size-4" aria-hidden="true" />
                </span>
                <a href="tel:+62812345678" className="hover:text-primary">
                  +62 812 3456 7890
                </a>
              </li>
              <li className="flex items-center gap-2.5">
                <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary-soft text-primary">
                  <MapPin className="size-4" aria-hidden="true" />
                </span>
                Jakarta, Indonesia
              </li>
            </ul>
          </div>
        </div>

        <div className="mt-12 border-t border-border pt-6">
          <div className="flex flex-col items-center justify-between gap-3 text-sm text-on-surface-variant md:flex-row">
            <p>{t('footer.copyright', { year: new Date().getFullYear() })}</p>
          </div>
        </div>
      </div>
    </footer>
  )
}
