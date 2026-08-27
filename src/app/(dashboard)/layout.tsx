'use client'

import { Suspense, lazy, useEffect, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { Sidebar } from '@/components/layout/sidebar'
import { NotificationBell } from '@/components/shared/notification-bell'
import { PlacementPromptPopup } from '@/components/shared/placement-prompt-popup'
import { LanguageSwitcher } from '@/components/shared/language-switcher'
import { AccessibilityToggle } from '@/components/shared/accessibility-toggle'
import { useAuth } from '@/lib/auth-context'
import { useI18n } from '@/lib/i18n/client'
import { createClient } from '@/lib/supabase-client'
import { cn } from '@/lib/utils'
import { Loader2 } from 'lucide-react'

const AIChatbot = lazy(() => import('@/components/shared/ai-chatbot').then(m => ({ default: m.AIChatbot })))
const SessionReminder = lazy(() => import('@/components/shared/session-reminder').then(m => ({ default: m.SessionReminder })))

const roleLabels = {
  student: { label: 'sidebar.studentRole', href: '/student/dashboard' },
  teacher: { label: 'sidebar.teacherRole', href: '/teacher/dashboard' },
  admin: { label: 'sidebar.adminRole', href: '/admin/dashboard' },
} as const

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const { t } = useI18n()
  const isTeacherApply = pathname === '/teacher/apply'
  const role: 'student' | 'teacher' | 'admin' = pathname.startsWith('/teacher') && !isTeacherApply
    ? 'teacher'
    : pathname.startsWith('/admin')
      ? 'admin'
      : 'student'
  const [scrolled, setScrolled] = useState(false)
  const { user } = useAuth()
  const router = useRouter()
  const [checkingTeacher, setCheckingTeacher] = useState(false)

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 4)
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  useEffect(() => {
    if (role !== 'teacher' || pathname === '/teacher/apply' || !user) return
    setCheckingTeacher(true)
    const checkTeacherStatus = async () => {
      const supabase = createClient()
      const { data } = await supabase
        .from('teachers')
        .select('status')
        .eq('user_id', user.id)
        .maybeSingle()
      if (!data || data.status !== 'active') {
        router.replace('/teacher/apply')
      }
      setCheckingTeacher(false)
    }
    checkTeacherStatus()
  }, [role, user, router])

  if (checkingTeacher) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }

  return (
    <>
      {!isTeacherApply && <Sidebar role={role} />}

      <main
        id="main-content"
        className={cn(
          'min-h-screen bg-background overflow-x-clip',
          !isTeacherApply && 'lg:pl-60'
        )}
      >
        <div
          className={cn(
            'sticky top-0 z-20 -mx-4 mb-6 border-b border-border bg-background/80 px-4 py-3 backdrop-blur transition-shadow sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8',
            scrolled ? 'shadow-sm' : 'shadow-none'
          )}
        >
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <span className="rounded-full bg-primary-soft px-3 py-1 text-xs font-bold uppercase tracking-wider text-primary">
                {isTeacherApply ? t('teacher1.apply.pendingStatusActive') : t(roleLabels[role].label)}
              </span>
              <span className="hidden text-sm text-on-surface-variant sm:inline">
                {t('shell.welcome')}
              </span>
            </div>
            <div className="flex items-center gap-1.5 sm:gap-2">
              <AccessibilityToggle />
              <LanguageSwitcher variant="default" />
              <Suspense fallback={null}>
                <NotificationBell />
              </Suspense>
            </div>
          </div>
        </div>

          <div className="mx-auto max-w-7xl px-4 pb-24 sm:px-6 lg:px-8 lg:pb-10">
            {children}
          </div>
      </main>

      <Suspense fallback={null}>
        <AIChatbot />
      </Suspense>

      {(role === 'student' || role === 'teacher') && (
        <Suspense fallback={null}>
          <SessionReminder role={role} />
        </Suspense>
      )}

      {!isTeacherApply && (
        <Suspense fallback={null}>
          <PlacementPromptPopup />
        </Suspense>
      )}
    </>
  )
}