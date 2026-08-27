'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Menu, X, User, LogOut } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/lib/auth-context'
import { signOut } from '@/lib/auth'
import { useI18n } from '@/lib/i18n/client'
import { LanguageSwitcher } from '@/components/shared/language-switcher'
import { AccessibilityToggle } from '@/components/shared/accessibility-toggle'
import type { UserRole } from '@/types'

const navLinks = [
  { labelKey: 'nav.program', href: '/project' },
  { labelKey: 'nav.teachers', href: '/guru' },
  { labelKey: 'nav.events', href: '/event' },
  { labelKey: 'nav.faq', href: '/faq' },
]

export function Navbar() {
  const [mobileOpen, setMobileOpen] = useState(false)
  const [scrolled, setScrolled] = useState(false)
  const { user, loading } = useAuth()
  const { t } = useI18n()
  const router = useRouter()

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMobileOpen(false)
    }
    if (mobileOpen) {
      document.addEventListener('keydown', handleEsc)
      document.body.style.overflow = 'hidden'
    }
    return () => {
      document.removeEventListener('keydown', handleEsc)
      document.body.style.overflow = ''
    }
  }, [mobileOpen])

  const handleLogout = async () => {
    await signOut()
    router.push('/')
  }

  const role: UserRole = user?.role ?? 'student'
  const dashboardHref =
    role === 'teacher'
      ? '/teacher/dashboard'
      : role === 'admin'
        ? '/admin/dashboard'
        : '/student/dashboard'

  return (
    <>
      <header
        className={cn(
          'sticky top-0 z-50 transition-shadow duration-[var(--dur)] ease-[var(--ease-out)]',
          scrolled ? 'shadow-md' : 'shadow-none'
        )}
    >
      <div className="glass-nav">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <Link
            href="/"
            className="group flex items-center gap-2.5 transition-opacity hover:opacity-90"
          >
            <img
              src="/logo.png"
              alt=""
              className="size-9 rounded-lg object-contain shadow-sm"
            />
            <span className="hidden text-lg font-extrabold tracking-tight text-on-surface sm:inline">
              Lex<span className="gradient-text">ora</span> Academy
            </span>
          </Link>

          <nav
            aria-label={t('nav.ariaMain')}
            className="hidden items-center gap-1 md:flex"
          >
            {navLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="rounded-md px-3 py-2 text-sm font-medium text-on-surface-variant transition-colors duration-[var(--dur-fast)] hover:bg-surface-hover hover:text-on-surface"
              >
                {t(link.labelKey)}
              </Link>
            ))}
          </nav>

          <div className="hidden items-center gap-2 md:flex">
            <AccessibilityToggle />
            <LanguageSwitcher />
            {loading ? (
              <div className="h-8 w-24 skeleton rounded-md" aria-label={t('nav.loading')} />
            ) : user ? (
              <>
                <Link href={dashboardHref}>
                  <Button variant="ghost" size="sm">
                    <User className="size-4" />
                    {t('nav.dashboard')}
                  </Button>
                </Link>
                <Button variant="ghost" size="icon-sm" onClick={handleLogout} aria-label={t('nav.logout')}>
                  <LogOut />
                </Button>
              </>
            ) : (
              <>
                <Link href="/masuk">
                  <Button variant="ghost" size="sm">
                    {t('nav.login')}
                  </Button>
                </Link>
                <Link href="/daftar">
                  <Button variant="gradient" size="sm">
                    {t('nav.signup')}
                  </Button>
                </Link>
              </>
            )}
          </div>

          <button
            onClick={() => setMobileOpen(!mobileOpen)}
            className="rounded-md p-2 text-on-surface transition-colors hover:bg-surface-hover md:hidden"
            aria-label={mobileOpen ? t('nav.closeMenu') : t('nav.openMenu')}
            aria-expanded={mobileOpen}
            aria-controls="mobile-nav-menu"
          >
            {mobileOpen ? <X className="size-6" /> : <Menu className="size-6" />}
          </button>
        </div>

        {mobileOpen && (
          <>
            {/* Backdrop */}
            <div
              className="fixed inset-0 z-40 bg-background/60 backdrop-blur-sm md:hidden animate-fade-in"
              onClick={() => setMobileOpen(false)}
              aria-hidden="true"
            />
            {/* Mobile nav panel */}
            <div
              id="mobile-nav-menu"
              role="dialog"
              aria-modal="true"
              aria-label={t('nav.ariaMobile')}
              className="relative z-50 border-t border-border bg-surface-container-lowest md:hidden animate-slide-up"
            >
              <nav
                aria-label={t('nav.ariaMain')}
                className="flex flex-col gap-1 px-4 pb-6 pt-4"
              >
                {navLinks.map((link) => (
                  <Link
                    key={link.href}
                    href={link.href}
                    onClick={() => setMobileOpen(false)}
                    className="rounded-lg px-3 py-2.5 text-base font-medium text-on-surface-variant transition-colors hover:bg-surface-hover hover:text-on-surface"
                  >
                    {t(link.labelKey)}
                  </Link>
                ))}
                <div className="divider-soft my-3" />
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold text-on-surface-variant">{t('lang.label')}</span>
                  <div className="flex items-center gap-1.5">
                    <AccessibilityToggle />
                    <LanguageSwitcher />
                  </div>
                </div>
                {user ? (
                  <div className="flex flex-col gap-2">
                    <Link href={dashboardHref} onClick={() => setMobileOpen(false)}>
                      <Button variant="secondary" className="w-full">
                        {t('nav.dashboard')}
                      </Button>
                    </Link>
                    <Button
                      variant="ghost"
                      className="w-full text-destructive"
                      onClick={() => {
                        handleLogout()
                        setMobileOpen(false)
                      }}
                    >
                      {t('nav.logout')}
                    </Button>
                  </div>
                ) : (
                  <div className="flex flex-col gap-2">
                    <Link href="/masuk" onClick={() => setMobileOpen(false)}>
                      <Button variant="secondary" className="w-full">
                        {t('nav.login')}
                      </Button>
                    </Link>
                    <Link href="/daftar" onClick={() => setMobileOpen(false)}>
                      <Button variant="gradient" className="w-full">
                        {t('nav.signup')}
                      </Button>
                    </Link>
                  </div>
                )}
              </nav>
            </div>
          </>
        )}
      </div>
      </header>
    </>
  )
}
