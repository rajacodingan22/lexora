'use client'

import { useEffect } from 'react'
import { Calendar, FileText, GraduationCap, Star, Info, X } from 'lucide-react'
import { cn, timeAgo } from '@/lib/utils'
import { renderNotification } from '@/lib/notif-text'
import { useI18n } from '@/lib/i18n/client'
import type { Notification } from '@/types'

const typeConfig: Record<string, { icon: React.ElementType; color: string }> = {
  meeting: { icon: Calendar, color: 'text-sky-400' },
  assignment: { icon: FileText, color: 'text-amber-400' },
  quiz: { icon: FileText, color: 'text-violet-400' },
  exam: { icon: GraduationCap, color: 'text-rose-400' },
  grade: { icon: Star, color: 'text-yellow-400' },
  certificate: { icon: GraduationCap, color: 'text-emerald-400' },
  info: { icon: Info, color: 'text-blue-400' },
}

export function NotificationToastStack({
  notifications,
  onDismiss,
  onOpen,
}: {
  notifications: Notification[]
  onDismiss: (id: string) => void
  onOpen: (n: Notification) => void
}) {
  if (notifications.length === 0) return null

  return (
    <div
      className="fixed right-4 top-4 z-[80] flex w-[min(24rem,calc(100vw-2rem))] flex-col gap-2"
      role="status"
      aria-live="polite"
    >
      {notifications.map((n) => (
        <ToastItem key={n.id} notif={n} onDismiss={onDismiss} onOpen={onOpen} />
      ))}
    </div>
  )
}

function ToastItem({
  notif,
  onDismiss,
  onOpen,
}: {
  notif: Notification
  onDismiss: (id: string) => void
  onOpen: (n: Notification) => void
}) {
  const { t, lang } = useI18n()

  useEffect(() => {
    const timer = setTimeout(() => onDismiss(notif.id), 5000)
    return () => clearTimeout(timer)
  }, [notif.id, onDismiss])

  const config = typeConfig[notif.type] ?? typeConfig.info
  const Icon = config.icon
  const { title, body } = renderNotification(notif, t)

  return (
    <div className="pointer-events-auto flex items-start gap-3 rounded-xl border border-border bg-surface-container-high p-3 shadow-xl animate-toast-in">
      <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary-soft">
        <Icon className={cn('h-4.5 w-4.5', config.color)} />
      </div>
      <button className="min-w-0 flex-1 text-left" onClick={() => onOpen(notif)}>
        <p className="truncate text-sm font-semibold text-on-surface">{title}</p>
        {body && (
          <p className="mt-0.5 line-clamp-2 text-xs text-on-surface-variant">{body}</p>
        )}
        <p className="mt-1 text-[11px] text-muted">{timeAgo(notif.created_at, lang)}</p>
      </button>
      <button
        onClick={() => onDismiss(notif.id)}
        aria-label={t('ui2.notif.dismissToast')}
        className="mt-0.5 shrink-0 text-muted transition-colors hover:text-on-surface"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  )
}
