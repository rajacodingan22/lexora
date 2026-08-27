'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { createClient } from '@/lib/supabase-client'
import { formatDateOnly } from '@/lib/utils'
import { useI18n } from '@/lib/i18n/client'
import { Hourglass, Loader2, UserCircle, UserPlus } from 'lucide-react'

interface WaitRow {
  id: string
  course_id: string
  user_id: string
  status: string
  notes: string | null
  created_at: string
  course: { title: { id: string; en: string } } | null
  user: { display_name: string | null; email: string | null; photo_url: string | null } | null
}

export default function AdminWaitingListPage() {
  const supabase = createClient()
  const { t } = useI18n()
  const [rows, setRows] = useState<WaitRow[]>([])
  const [loading, setLoading] = useState(true)
  const [assigning, setAssigning] = useState<string | null>(null)
  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null)

  useEffect(() => {
    fetchData()
  }, [])

  async function fetchData() {
    setLoading(true)
    try {
      const { data, error } = await supabase
        .from('waiting_list')
        .select(`
          *,
          course:courses(title),
          user:users(id, display_name, email, photo_url)
        `)
        .eq('status', 'waiting')
        .order('created_at', { ascending: false })
      if (error) throw error
      setRows((data || []) as unknown as WaitRow[])
    } catch (err) {
      console.error('Failed to fetch waiting list', err)
    } finally {
      setLoading(false)
    }
  }

  async function resolve(id: string) {
    try {
      await supabase.from('waiting_list').update({ status: 'resolved' }).eq('id', id)
      setRows((prev) => prev.filter((r) => r.id !== id))
    } catch (err) {
      console.error('Failed to update', err)
    }
  }

  async function assign(id: string) {
    setAssigning(id)
    try {
      const res = await fetch('/api/waiting-list/assign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ waitingId: id }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || t('admin2.waitingList.assignFailed', { msg: '' }))
      setToast({ type: 'success', message: t('admin2.waitingList.assignSuccess') })
      await fetchData()
    } catch (err: any) {
      console.error('Assign failed', err)
      setToast({ type: 'error', message: t('admin2.waitingList.assignFailed', { msg: err.message || '' }) })
    } finally {
      setAssigning(null)
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-on-surface">{t('admin2.waitingList.title')}</h1>
        <p className="text-on-surface-variant">
          {t('admin2.waitingList.subtitle')}
        </p>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20 text-muted">
          <Loader2 className="h-5 w-5 animate-spin mr-2" /> {t('common.loading')}
        </div>
      ) : rows.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center py-16 text-center">
            <div className="rounded-full bg-surface-container-low p-4 mb-3">
              <Hourglass className="h-8 w-8 text-muted" />
            </div>
            <p className="text-sm font-medium text-on-surface">{t('admin2.waitingList.emptyTitle')}</p>
            <p className="text-xs text-on-surface-variant mt-1">{t('admin2.waitingList.emptyDesc')}</p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm flex items-center gap-2">
              <Hourglass className="h-4 w-4 text-primary" /> {t('admin2.waitingList.queue', { count: rows.length })}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {rows.map((r) => {
              const title = r.course?.title?.id || r.course?.title?.en || t('admin2.waitingList.unknownClass')
              return (
                <div key={r.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-surface-container-low p-4">
                  <div className="flex items-center gap-3 min-w-0">
                    {r.user?.photo_url ? (
                      <img src={r.user.photo_url} alt="" className="h-10 w-10 rounded-full object-cover" />
                    ) : (
                      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-indigo-500/20 text-indigo-400">
                        <UserCircle className="h-6 w-6" />
                      </div>
                    )}
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-on-surface truncate">
                        {r.user?.display_name || t('admin2.waitingList.student')}
                      </p>
                      <p className="text-xs text-on-surface-variant truncate">{r.user?.email}</p>
                      <p className="text-xs text-muted mt-0.5">
                        {title} • {t('admin2.waitingList.registeredOn', { date: formatDateOnly(r.created_at) })}
                      </p>
                      {r.notes && <p className="text-xs text-orange-400 mt-0.5">{r.notes}</p>}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Badge variant="warning">{t('admin2.waitingList.waiting')}</Badge>
                    <Button
                      size="sm"
                      onClick={() => assign(r.id)}
                      disabled={assigning === r.id}
                      className="inline-flex items-center gap-1.5"
                    >
                      {assigning === r.id ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <UserPlus className="h-3.5 w-3.5" />
                      )}
                      {t('admin2.waitingList.assignBtn')}
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => resolve(r.id)}>
                      {t('admin2.waitingList.removeBtn')}
                    </Button>
                  </div>
                </div>
              )
            })}
          </CardContent>
        </Card>
      )}

      {toast && (
        <div className={`fixed bottom-4 right-4 z-50 rounded-lg px-4 py-3 text-sm font-medium text-white shadow-lg ${toast.type === 'success' ? 'bg-green-600' : 'bg-red-600'}`}>
          {toast.message}
        </div>
      )}
    </div>
  )
}