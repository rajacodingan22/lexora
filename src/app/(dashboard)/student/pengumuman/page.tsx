'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { createClient } from '@/lib/supabase-client'
import { useAuth } from '@/lib/auth-context'
import { useI18n } from '@/lib/i18n/client'
import { formatDateOnly } from '@/lib/utils'
import {
  Loader2, AlertTriangle, Info, AlertCircle, Inbox
} from 'lucide-react'

interface Announcement {
  id: string
  title: string
  content: string
  priority: string
  author_id: string
  created_at: string
  author?: {
    id: string
    display_name: string | null
    photo_url: string | null
  }
}

const priorityConfig: Record<string, { icon: React.ReactNode; badge: 'destructive' | 'warning' | 'default'; label: string; border: string }> = {
  high: {
    icon: <AlertCircle className="h-5 w-5 text-red-400" />,
    badge: 'destructive',
    label: 'High',
    border: 'border-l-red-500/50',
  },
  medium: {
    icon: <AlertTriangle className="h-5 w-5 text-amber-400" />,
    badge: 'warning',
    label: 'Medium',
    border: 'border-l-amber-500/50',
  },
  low: {
    icon: <Info className="h-5 w-5 text-blue-400" />,
    badge: 'default',
    label: 'Low',
    border: 'border-l-blue-500/50',
  },
}

export default function StudentAnnouncementsPage() {
  const { user } = useAuth()
  const { t, lang } = useI18n()
  const locale = lang === 'en' ? 'en-US' : lang === 'zh' ? 'zh-CN' : 'id-ID'
  const supabase = createClient()

  const [announcements, setAnnouncements] = useState<Announcement[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!user) return
    fetchAnnouncements()
  }, [user])

  async function fetchAnnouncements() {
    setLoading(true)

    try {
      const { data } = await supabase
        .from('announcements')
        .select('*, author:users(id, display_name, photo_url)')
        .eq('is_active', true)
        .order('published_at', { ascending: false })

      setAnnouncements((data || []) as Announcement[])
    } catch (err) {
      console.error('Failed to fetch announcements:', err)
      setAnnouncements([])
    }
    setLoading(false)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 text-indigo-400 animate-spin" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-on-surface">{t('student1.pengumuman.title')}</h1>
        <p className="text-on-surface-variant">{t('student1.pengumuman.subtitle')}</p>
      </div>

      {announcements.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <Inbox className="h-12 w-12 text-muted mb-3" />
            <p className="text-sm text-on-surface-variant">{t('student1.pengumuman.empty')}</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {announcements.map((a) => {
            const priority = priorityConfig[a.priority] || priorityConfig.low
            const initial = a.author?.display_name?.[0] || '?'

            return (
              <Card key={a.id}>
                <div className={`border-l-4 ${priority.border} pl-4`}>
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-start gap-3 flex-1 min-w-0">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-indigo-500/20 text-sm font-medium text-indigo-400">
                        {initial}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="font-semibold text-on-surface">{a.title}</h3>
                          <Badge variant={priority.badge} className="text-[10px] px-1.5 py-0">
                            {priority.label}
                          </Badge>
                        </div>
                        <div className="flex items-center gap-2 mt-0.5 text-xs text-muted">
                          <span>{a.author?.display_name || t('student1.pengumuman.adminFallback')}</span>
                          <span className="w-1 h-1 rounded-full bg-border" />
                          <span>{formatDateOnly(a.created_at, locale)}</span>
                        </div>
                        <div className="mt-3 text-sm text-on-surface-variant whitespace-pre-wrap leading-relaxed">
                          {a.content}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
