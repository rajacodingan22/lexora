'use client'

import { cn } from '@/lib/utils'
import { useI18n } from '@/lib/i18n/client'
import type { UserRole } from '@/types'

interface DashboardLayoutProps {
  children: React.ReactNode
  className?: string
  /** Reserved for legacy callers passing an unused role; renders the same regardless. */
  role?: UserRole
}

export function DashboardLayout({ children, className }: DashboardLayoutProps) {
  const { t } = useI18n()
  return (
    <section id="main-content" className={cn('space-y-6', className)} aria-label={t('shell.content')}>
      {children}
    </section>
  )
}
