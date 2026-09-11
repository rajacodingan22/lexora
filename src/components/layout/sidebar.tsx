'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { cn } from '@/lib/utils'
import {
  LayoutDashboard, BookOpen, GraduationCap, Award, User,
  Calendar, CalendarDays, MessageCircle, Settings, LogOut, Menu, X,
  FileText, ClipboardList, Users, Globe, BarChart3,
  Megaphone, Shield, ChevronLeft, ChevronRight, Hourglass, CalendarClock,
} from 'lucide-react'
import { useState, useEffect, useCallback } from 'react'
import { signOut } from '@/lib/auth'
import { useI18n } from '@/lib/i18n/client'
import { LanguageSwitcher } from '@/components/shared/language-switcher'

interface SidebarProps {
  role: 'student' | 'teacher' | 'admin'
}

const roleLabels: Record<string, string> = {
  student: 'sidebar.studentRole',
  teacher: 'sidebar.teacherRole',
  admin: 'sidebar.adminRole',
}

const COLLAPSED_KEY = 'sidebar-collapsed'

const navConfig = {
  student: [
    { key: 'sidebar.dashboard', href: '/student/dashboard', icon: LayoutDashboard },
        { key: 'sidebar.grades', href: '/student/nilai', icon: ClipboardList },
    { key: 'sidebar.certificates', href: '/student/sertifikat', icon: Award },
    { key: 'sidebar.payment', href: '/student/pembayaran', icon: FileText },
    { key: 'sidebar.placementTest', href: '/student/placement-test', icon: FileText },
    { key: 'sidebar.testHistory', href: '/student/riwayat-placement', icon: FileText },
    { key: 'sidebar.discussion', href: '/student/diskusi', icon: MessageCircle },
    { key: 'sidebar.profile', href: '/student/profil', icon: User },
  ],
  teacher: [
    { key: 'sidebar.dashboard', href: '/teacher/dashboard', icon: LayoutDashboard },
    { key: 'sidebar.myClasses', href: '/teacher/kelas', icon: BookOpen },
    { key: 'sidebar.meetings', href: '/teacher/pertemuan', icon: CalendarDays },
    { key: 'sidebar.materials', href: '/teacher/materi', icon: GraduationCap },
    { key: 'sidebar.quiz', href: '/teacher/quiz', icon: FileText },
    { key: 'sidebar.grades', href: '/teacher/nilai', icon: BarChart3 },
    { key: 'sidebar.certificates', href: '/teacher/sertifikat', icon: Award },
    { key: 'sidebar.calendar', href: '/teacher/kalender', icon: Calendar },
    { key: 'sidebar.profile', href: '/teacher/profil', icon: User },
  ],
  admin: [
    { key: 'sidebar.dashboard', href: '/admin/dashboard', icon: LayoutDashboard },
    { key: 'sidebar.users', href: '/admin/users', icon: Users },
    { key: 'sidebar.languages', href: '/admin/bahasa', icon: Globe },
    { key: 'sidebar.placement', href: '/admin/placement', icon: FileText },
    { key: 'sidebar.teachers', href: '/admin/teacher-management', icon: GraduationCap },
    { key: 'sidebar.programs', href: '/admin/program', icon: BookOpen },
    { key: 'sidebar.courses', href: '/admin/kursus', icon: GraduationCap },
    { key: 'sidebar.assignments', href: '/admin/penugasan', icon: ClipboardList },
    { key: 'sidebar.finalExam', href: '/admin/ujian-akhir', icon: CalendarClock },
    { key: 'sidebar.batches', href: '/admin/batch', icon: Calendar },
    { key: 'sidebar.waitingList', href: '/admin/waiting-list', icon: Hourglass },
    { key: 'sidebar.schedule', href: '/admin/jadwal', icon: Calendar },
    { key: 'sidebar.eventsNews', href: '/admin/event', icon: CalendarDays },
    { key: 'sidebar.news', href: '/admin/berita', icon: Megaphone },
    { key: 'sidebar.announcements', href: '/admin/pengumuman', icon: Megaphone },
    { key: 'sidebar.reports', href: '/admin/laporan', icon: BarChart3 },
    { key: 'sidebar.cms', href: '/admin/cms', icon: Megaphone },
    { key: 'sidebar.auditLog', href: '/admin/audit', icon: Shield },
    { key: 'sidebar.paymentVerif', href: '/admin/verifikasi', icon: FileText },
    { key: 'sidebar.settings', href: '/admin/settings', icon: Settings },
  ],
}

export function Sidebar({ role }: SidebarProps) {
  const pathname = usePathname()
  const router = useRouter()
  const { t } = useI18n()
  const [mobileOpen, setMobileOpen] = useState(false)
  const [collapsed, setCollapsed] = useState(false)

  useEffect(() => {
    if (localStorage.getItem(COLLAPSED_KEY) === 'true') setCollapsed(true)
  }, [])
  const navItems = navConfig[role]
  const activeMatch = useCallback((href: string) => pathname === href || pathname.startsWith(href + '/'), [pathname])

  useEffect(() => {
    localStorage.setItem(COLLAPSED_KEY, String(collapsed))
  }, [collapsed])

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

  const NavContent = () => (
    <>
      <div className="flex h-16 items-center gap-2 border-b border-border px-4">
        <Link
          href="/"
          className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-lg shadow-sm"
          aria-label="Lexora Academy"
        >
          <img src="/logo.png" alt="" className="size-9 rounded-lg object-contain" />
        </Link>
        {!collapsed && (
          <span className="text-lg font-extrabold tracking-tight text-on-surface">
            Lex<span className="gradient-text">ora</span> Academy
          </span>
        )}
      </div>

      <nav
        className="flex-1 overflow-y-auto p-3"
        aria-label={roleLabels[role] ?? role}
      >
        <ul className="space-y-1">
          {navItems.map((item) => {
            const Icon = item.icon
            const isActive = activeMatch(item.href)
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  onClick={() => setMobileOpen(false)}
                  aria-current={isActive ? 'page' : undefined}
                  className={cn(
                    'group relative flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-semibold',
                    'transition-all duration-[var(--dur-fast)] ease-[var(--ease-out)]',
                    collapsed && 'justify-center px-2',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                    isActive
                      ? 'bg-primary-soft text-primary'
                      : 'text-on-surface-variant hover:bg-surface-hover hover:text-on-surface'
                  )}
                >
                  {isActive && (
                    <span
                      className="absolute left-0 top-1/2 h-6 w-1 -translate-y-1/2 rounded-r-full bg-primary"
                      aria-hidden="true"
                    />
                  )}
                  <Icon className={cn('shrink-0', collapsed ? 'size-5' : 'size-[18px]')} />
                  {!collapsed && <span className="truncate">{t(item.key)}</span>}
                </Link>
              </li>
            )
          })}
        </ul>
      </nav>

      <div className="border-t border-border p-3">
        <button
          onClick={() => setCollapsed(!collapsed)}
          className={cn(
            'hidden lg:flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium w-full',
            'text-on-surface-variant transition-all duration-[var(--dur-fast)] hover:bg-surface-hover hover:text-on-surface',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
            collapsed && 'justify-center px-2'
          )}
          aria-label={collapsed ? t('sidebar.expandAction') : t('sidebar.collapseAction')}
        >
          {collapsed ? (
            <ChevronRight className="size-5" />
          ) : (
            <>
              <ChevronLeft className="size-5" />
              <span>{t('sidebar.collapse')}</span>
            </>
          )}
        </button>
        <button
          onClick={handleLogout}
          className={cn(
            'mt-1 flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium w-full',
            'text-on-surface-variant transition-all duration-[var(--dur-fast)] hover:bg-destructive-soft hover:text-destructive',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
            collapsed && 'justify-center px-2'
          )}
          aria-label={t('sidebar.logout')}
        >
          <LogOut className="size-5 shrink-0" />
          {!collapsed && <span>{t('sidebar.logout')}</span>}
        </button>
        <div className={cn('mt-1 flex items-center rounded-lg px-3 py-2', collapsed && 'justify-center px-2')}>
          <LanguageSwitcher variant={collapsed ? 'compact' : 'default'} />
        </div>
      </div>
    </>
  )

  return (
    <>
      <button
        onClick={() => setMobileOpen(true)}
        className="fixed left-4 top-3 z-40 flex items-center gap-2 rounded-lg border border-border bg-surface-container-low px-3 py-2 text-sm font-medium text-on-surface shadow-md backdrop-blur lg:hidden"
        aria-label={t('sidebar.openMenu')}
        aria-expanded={mobileOpen}
        aria-controls="sidebar-mobile-panel"
      >
        <Menu className="size-4" />
      </button>

      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-background/70 backdrop-blur-sm lg:hidden animate-fade-in"
          onClick={() => setMobileOpen(false)}
        >
          <div
            id="sidebar-mobile-panel"
            role="dialog"
            aria-modal="true"
            aria-label={t('sidebar.mobileNav')}
            className="fixed left-0 top-0 flex h-full w-72 flex-col border-r border-border bg-background shadow-xl animate-slide-up"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => setMobileOpen(false)}
              className="absolute right-3 top-3.5 z-10 rounded-md p-1.5 text-muted hover:bg-surface-hover hover:text-on-surface"
              aria-label={t('sidebar.closeMenu')}
            >
              <X className="size-5" />
            </button>
            <NavContent />
          </div>
        </div>
      )}

      <aside
        className={cn(
          'fixed left-0 top-0 z-30 hidden h-screen flex-col border-r border-border bg-surface-container-low transition-[width] duration-[var(--dur)] ease-[var(--ease-out)] lg:flex',
          collapsed ? 'w-[72px]' : 'w-60'
        )}
        aria-label={t(roleLabels[role] ?? '') ?? role}
      >
        <NavContent />
      </aside>

      <nav
        className="fixed bottom-0 left-0 right-0 z-30 flex items-center justify-around border-t border-border bg-surface-container-lowest px-2 py-1.5 shadow-md lg:hidden"
        aria-label={t('sidebar.mobileNav')}
      >
        {navItems.slice(0, 5).map((item) => {
          const Icon = item.icon
          const isActive = pathname === item.href || pathname.startsWith(item.href + '/')
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'flex flex-col items-center gap-0.5 rounded-md px-2 py-1.5 text-[10px] font-semibold transition-colors',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                isActive ? 'text-primary' : 'text-muted hover:text-on-surface'
              )}
              aria-current={isActive ? 'page' : undefined}
              title={t(item.key)}
            >
              <Icon className="size-5" />
              <span className="truncate max-w-[4rem]">{t(item.key).split(' ')[0]}</span>
            </Link>
          )
        })}
      </nav>
    </>
  )
}
