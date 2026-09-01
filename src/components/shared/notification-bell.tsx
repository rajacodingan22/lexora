'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { useAuth } from '@/lib/auth-context'
import { createClient } from '@/lib/supabase-client'
import { cn, timeAgo } from '@/lib/utils'
import { renderNotification } from '@/lib/notif-text'
import { Bell, Calendar, FileText, GraduationCap, Star, Info, CheckCheck, ListChecks, Cloud, AlertTriangle } from 'lucide-react'
import type { Notification } from '@/types'
import { useRouter } from 'next/navigation'
import { useI18n } from '@/lib/i18n/client'
import { NotificationToastStack } from '@/components/shared/notification-toast'

const typeConfig: Record<string, { icon: React.ElementType; labelKey: string }> = {
  meeting: { icon: Calendar, labelKey: 'ui2.notif.typeMeeting' },
  assignment: { icon: FileText, labelKey: 'ui2.notif.typeAssignment' },
  quiz: { icon: FileText, labelKey: 'ui2.notif.typeQuiz' },
  exam: { icon: GraduationCap, labelKey: 'ui2.notif.typeExam' },
  grade: { icon: Star, labelKey: 'ui2.notif.typeGrade' },
  certificate: { icon: GraduationCap, labelKey: 'ui2.notif.typeCertificate' },
  warning: { icon: AlertTriangle, labelKey: 'ui2.notif.typeInfo' },
  taskOverdue: { icon: ListChecks, labelKey: 'ui2.notif.typeInfo' },
  driveNotConnected: { icon: Cloud, labelKey: 'ui2.notif.typeInfo' },
  info: { icon: Info, labelKey: 'ui2.notif.typeInfo' },
}

export function NotificationBell() {
  const { user } = useAuth()
  const { t, lang } = useI18n()
  const router = useRouter()
  const supabase = createClient()
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [toasts, setToasts] = useState<Notification[]>([])
  const dropdownRef = useRef<HTMLDivElement>(null)
  const seenIds = useRef<Set<string>>(new Set())
  const initializedRef = useRef(false)

  const pushToast = useCallback((n: Notification) => {
    if (!n?.id || seenIds.current.has(n.id)) return
    seenIds.current.add(n.id)
    setToasts((prev) => [...prev, n].slice(-3))
  }, [])

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
  }, [])

  const fetchNotifications = useCallback(async () => {
    if (!user) return
    try {
      const [notifRes, countRes] = await Promise.all([
        fetch('/api/notifications'),
        fetch('/api/notifications/count'),
      ])
      if (notifRes.ok) {
        const { data } = await notifRes.json()
        const list = (data ?? []) as Notification[]
        setNotifications(list)
        if (!initializedRef.current) {
          initializedRef.current = true
          list.forEach((n) => seenIds.current.add(n.id))
        } else {
          list.forEach((n) => { if (!n.is_read) pushToast(n) })
        }
      }
      if (countRes.ok) {
        const { count } = await countRes.json()
        setUnreadCount(count ?? 0)
      }
    } catch {
      // Silently fail
    }
  }, [user, pushToast])

  useEffect(() => {
    if (!user) return
    fetchNotifications()
  }, [user, fetchNotifications])

  // Subscribe to real-time changes + poll every 30s as fallback
  useEffect(() => {
    if (!user) return

    const channel = supabase
      .channel('notifications-realtime')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${user.id}`,
        },
        () => {
          fetchNotifications()
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${user.id}`,
        },
        (payload) => {
          pushToast(payload.new as Notification)
          fetchNotifications()
        }
      )
      .subscribe()

    const pollInterval = setInterval(fetchNotifications, 30_000)

    return () => {
      supabase.removeChannel(channel)
      clearInterval(pollInterval)
    }
  }, [user, supabase, fetchNotifications, pushToast])

  // Mark individual notification as read on click (handled in handleNotificationClick)

  // Close dropdown on outside click
  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  const handleMarkAllRead = async () => {
    setLoading(true)
    try {
      await fetch('/api/notifications', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ all: true }),
      })
      setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })))
      setUnreadCount(0)
    } catch {
      // Silently fail
    } finally {
      setLoading(false)
    }
  }

  const handleNotificationClick = async (notif: Notification) => {
    // Mark as read
    if (!notif.is_read) {
      try {
        await fetch('/api/notifications', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: notif.id }),
        })
        setNotifications((prev) =>
          prev.map((n) => (n.id === notif.id ? { ...n, is_read: true } : n))
        )
        setUnreadCount((c) => Math.max(0, c - 1))
      } catch {
        // Silently fail
      }
    }
    setOpen(false)
    if (notif.link && notif.link.startsWith('/')) {
      router.push(notif.link)
    } else if (notif.link) {
      // fallback: external link
      window.open(notif.link, '_blank')
    } else {
      // No link — stay, maybe toast already handled
    }
  }

  if (!user) return null

  return (
    <>
      <NotificationToastStack
        notifications={toasts}
        onDismiss={dismissToast}
        onOpen={(n) => {
          setToasts((prev) => prev.filter((t) => t.id !== n.id))
          handleNotificationClick(n)
        }}
      />
      <div ref={dropdownRef} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="relative flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-surface-container-low text-on-surface-variant transition-colors hover:bg-surface-hover hover:text-on-surface"
        aria-label={
          unreadCount > 0
            ? t('ui2.notif.bellUnread', { count: unreadCount })
            : t('ui2.notif.bell')
        }
        aria-expanded={open}
        aria-haspopup="true"
      >
        <Bell className="h-4.5 w-4.5" />
        {unreadCount > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4.5 min-w-[18px] items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold leading-none text-white ring-2 ring-background">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div
          className="absolute right-0 top-full z-50 mt-2 w-80 origin-top-right rounded-xl border border-border bg-surface-container-high shadow-lg sm:w-96"
          role="menu"
          aria-label={t('ui2.notif.listAria')}
        >
          {/* Header */}
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <h3 className="text-sm font-semibold text-on-surface">{t('ui2.notif.title')}</h3>
            {unreadCount > 0 && (
              <button
                onClick={handleMarkAllRead}
                disabled={loading}
                className="flex items-center gap-1 text-xs font-medium text-primary transition-colors hover:text-primary/80 disabled:opacity-50"
              >
                <CheckCheck className="h-3.5 w-3.5" />
                {t('ui2.notif.markAllRead')}
              </button>
            )}
          </div>

          {/* List */}
          <div className="max-h-[360px] overflow-y-auto">
            {notifications.length === 0 ? (
              <div className="px-4 py-8 text-center text-sm text-muted">
                {t('ui2.notif.empty')}
              </div>
            ) : (
              notifications.map((notif) => {
                const config = typeConfig[notif.type] ?? typeConfig.info
                const Icon = config.icon
                const { title, body } = renderNotification(notif, t)
                return (
                  <button
                    key={notif.id}
                    onClick={() => handleNotificationClick(notif)}
                    className={cn(
                      'flex w-full gap-3 px-4 py-3 text-left transition-colors hover:bg-surface-hover',
                      !notif.is_read && 'bg-primary/5'
                    )}
                    role="menuitem"
                  >
                    <div
                      className={cn(
                        'mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full',
                        !notif.is_read
                          ? 'bg-primary-soft text-primary'
                          : 'bg-surface-container text-on-surface-variant'
                      )}
                    >
                      <Icon className="h-4 w-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p
                        className={cn(
                          'truncate text-sm',
                          !notif.is_read ? 'font-semibold text-on-surface' : 'text-on-surface'
                        )}
                      >
                        {title}
                      </p>
                      {body && (
                        <p className="mt-0.5 line-clamp-2 text-xs text-on-surface-variant">
                          {body}
                        </p>
                      )}
                      <p className="mt-1 text-[11px] text-muted">
                        {timeAgo(notif.created_at, lang)}
                      </p>
                    </div>
                    {!notif.is_read && (
                      <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-primary" />
                    )}
                  </button>
                )
              })
            )}
          </div>
        </div>
      )}
      </div>
    </>
  )
}
