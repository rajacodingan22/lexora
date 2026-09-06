'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Menu, X, User, LogOut, ChevronRight } from 'lucide-react'
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
    const onScroll = () => setScrolled(window.scrollY > 20)
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
          'fixed top-0 left-0 right-0 z-50 transition-all duration-500 ease-out',
          scrolled 
            ? 'bg-background/80 backdrop-blur-2xl border-b border-border/50 shadow-lg shadow-black/5' 
            : 'bg-transparent'
        )}
      >
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex h-20 items-center justify-between">
            <Link
              href="/"
              className="group flex items-center gap-3 transition-all duration-300 hover:scale-105"
            >
              <div className="relative">
                <div className="absolute inset-0 bg-gradient-to-r from-primary to-accent rounded-xl blur-lg opacity-50 group-hover:opacity-75 transition-opacity" />
                <img
                  src="/logo.png"
                  alt=""
                  className="relative size-10 rounded-xl object-contain shadow-xl"
                />
              </div>
              <div className="hidden sm:block">
                <span className="text-xl font-black tracking-tight text-on-surface block">
                  Lex<span className="bg-gradient-to-r from-primary via-accent to-secondary bg-clip-text text-transparent">ora</span>
                </span>
                <span className="text-[10px] font-semibold text-on-surface-variant uppercase tracking-widest -mt-1 block">
                  Academy
                </span>
              </div>
            </Link>

            <nav
              aria-label={t('nav.ariaMain')}
              className="hidden items-center gap-1 md:flex"
            >
              {navLinks.map((link, idx) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className="group relative px-4 py-2 text-sm font-semibold text-on-surface-variant transition-all duration-300 hover:text-on-surface overflow-hidden rounded-lg"
                >
                  <span className="relative z-10">{t(link.labelKey)}</span>
                  <span className="absolute inset-0 bg-gradient-to-r from-primary/10 to-accent/10 rounded-lg opacity-0 group-hover:opacity-100 transition-all duration-300 scale-x-0 group-hover:scale-x-100 origin-left" />
                  <ChevronRight className="inline-block size-3 ml-1 opacity-0 group-hover:opacity-100 transition-all duration-300 -translate-x-2 group-hover:translate-x-0" />
                </Link>
              ))}
            </nav>

            <div className="hidden items-center gap-3 md:flex">
              <div className="flex items-center gap-2 pr-3 border-r border-border/50">
                <AccessibilityToggle />
                <LanguageSwitcher />
              </div>
              {loading ? (
                <div className="h-9 w-28 skeleton rounded-xl" aria-label={t('nav.loading')} />
              ) : user ? (
                <>
                  <Link href={dashboardHref}>
                    <Button variant="ghost" size="sm" className="gap-2">
                      <div className="size-5 rounded-full bg-gradient-to-br from-primary to-accent flex items-center justify-center">
                        <User className="size-3" />
                      </div>
                      {t('nav.dashboard')}
                    </Button>
                  </Link>
                  <Button variant="ghost" size="icon" onClick={handleLogout} aria-label={t('nav.logout')} className="hover:bg-destructive/10 hover:text-destructive">
                    <LogOut className="size-5" />
                  </Button>
                </>
              ) : (
                <>
                  <Link href="/masuk">
                    <Button variant="ghost" size="sm" className="font-semibold">
                      {t('nav.login')}
                    </Button>
                  </Link>
                  <Link href="/daftar">
                    <Button className="relative overflow-hidden group font-semibold shadow-lg shadow-primary/25 hover:shadow-primary/40 transition-all duration-300 hover:-translate-y-0.5">
                      <span className="absolute inset-0 bg-gradient-to-r from-accent to-primary opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                      <span className="relative z-10">{t('nav.signup')}</span>
                    </Button>
                  </Link>
                </>
              )}
            </div>

            <button
              onClick={() => setMobileOpen(!mobileOpen)}
              className="relative rounded-xl p-2 text-on-surface transition-all duration-300 hover:bg-surface-hover md:hidden group"
              aria-label={mobileOpen ? t('nav.closeMenu') : t('nav.openMenu')}
              aria-expanded={mobileOpen}
              aria-controls="mobile-nav-menu"
            >
              <div className="relative w-6 h-6">
                <span className={cn(
                  "absolute h-0.5 w-6 bg-current rounded-full transition-all duration-300",
                  mobileOpen ? "rotate-45 top-3" : "top-1.5"
                )} />
                <span className={cn(
                  "absolute h-0.5 w-6 bg-current rounded-full transition-all duration-300",
                  mobileOpen ? "-rotate-45 top-3" : "top-4.5 opacity-0"
                )} />
                <span className={cn(
                  "absolute h-0.5 w-6 bg-current rounded-full transition-all duration-300",
                  mobileOpen ? "opacity-0" : "top-3.5"
                )} />
              </div>
            </button>
          </div>
        </div>

        {mobileOpen && (
          <>
            {/* Backdrop with blur */}
            <div
              className="fixed inset-0 z-40 bg-background/60 backdrop-blur-xl md:hidden animate-fade-in"
              onClick={() => setMobileOpen(false)}
              aria-hidden="true"
            />
            {/* Mobile nav panel */}
            <div
              id="mobile-nav-menu"
              role="dialog"
              aria-modal="true"
              aria-label={t('nav.ariaMobile')}
              className="fixed top-0 right-0 bottom-0 z-50 w-[85vw] max-w-sm border-l border-border/50 bg-surface-container-lowest/95 backdrop-blur-2xl shadow-2xl md:hidden animate-slide-up overflow-y-auto"
            >
              <div className="p-6">
                <div className="flex items-center justify-between mb-8">
                  <div className="flex items-center gap-2">
                    <img src="/logo.png" alt="" className="size-8 rounded-lg" />
                    <span className="font-bold text-on-surface">
                      Lex<span className="gradient-text">ora</span>
                    </span>
                  </div>
                  <button
                    onClick={() => setMobileOpen(false)}
                    className="rounded-lg p-2 hover:bg-surface-hover transition-colors"
                    aria-label={t('nav.closeMenu')}
                  >
                    <X className="size-5" />
                  </button>
                </div>
                
                <nav aria-label={t('nav.ariaMain')} className="flex flex-col gap-1">
                  {navLinks.map((link) => (
                    <Link
                      key={link.href}
                      href={link.href}
                      onClick={() => setMobileOpen(false)}
                      className="group flex items-center justify-between rounded-xl px-4 py-3.5 text-base font-semibold text-on-surface-variant transition-all duration-300 hover:bg-gradient-to-r hover:from-primary/10 hover:to-accent/10 hover:text-on-surface hover:pl-5"
                    >
                      {t(link.labelKey)}
                      <ChevronRight className="size-4 opacity-0 group-hover:opacity-100 transition-all duration-300 -translate-x-2 group-hover:translate-x-0" />
                    </Link>
                  ))}
                  
                  <div className="my-6 h-px bg-gradient-to-r from-transparent via-border to-transparent" />
                  
                  <div className="flex items-center justify-between py-3">
                    <span className="text-sm font-semibold text-on-surface-variant">{t('lang.label')}</span>
                    <div className="flex items-center gap-2">
                      <AccessibilityToggle />
                      <LanguageSwitcher />
                    </div>
                  </div>
                  
                  {user ? (
                    <div className="flex flex-col gap-3 mt-6">
                      <Link href={dashboardHref} onClick={() => setMobileOpen(false)}>
                        <Button variant="secondary" className="w-full font-semibold">
                          <User className="size-4 mr-2" />
                          {t('nav.dashboard')}
                        </Button>
                      </Link>
                      <Button
                        variant="ghost"
                        className="w-full text-destructive font-semibold"
                        onClick={() => {
                          handleLogout()
                          setMobileOpen(false)
                        }}
                      >
                        <LogOut className="size-4 mr-2" />
                        {t('nav.logout')}
                      </Button>
                    </div>
                  ) : (
                    <div className="flex flex-col gap-3 mt-6">
                      <Link href="/masuk" onClick={() => setMobileOpen(false)}>
                        <Button variant="secondary" className="w-full font-semibold">
                          {t('nav.login')}
                        </Button>
                      </Link>
                      <Link href="/daftar" onClick={() => setMobileOpen(false)}>
                        <Button className="w-full font-semibold shadow-lg shadow-primary/25">
                          {t('nav.signup')}
                        </Button>
                      </Link>
                    </div>
                  )}
                </nav>
              </div>
            </div>
          </>
        )}
      </header>
    </>
  )
}
