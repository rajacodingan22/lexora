'use client'

import { useAuth } from '@/lib/auth-context'
import { useRouter } from 'next/navigation'
import { useEffect } from 'react'
import { useI18n } from '@/lib/i18n/client'

export function ProtectedRoute({ children, roles }: { children: React.ReactNode; roles?: string[] }) {
  const { user, loading } = useAuth()
  const { t } = useI18n()
  const router = useRouter()

  useEffect(() => {
    if (!loading && !user) router.replace('/masuk')
    if (!loading && user && roles && !roles.includes(user.role)) router.replace('/')
  }, [user, loading, roles])

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3">
          <div className="h-10 w-10 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          <p className="text-sm text-muted">{t('ui2.route.loading')}</p>
        </div>
      </div>
    )
  }

  if (!user) return null
  if (roles && !roles.includes(user.role)) return null

  return <>{children}</>
}
