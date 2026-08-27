'use client'

import { Fragment, useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase-client'
import { useI18n } from '@/lib/i18n/client'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Search, ChevronLeft, ChevronRight, ChevronDown, ChevronUp } from 'lucide-react'

const PER_PAGE = 20

const LOCALE_MAP: Record<string, string> = { en: 'en-US', id: 'id-ID', zh: 'zh-CN' }

interface AuditLogRow {
  id: string
  action: string
  user_id: string | null
  role: string | null
  timestamp: string
  ip_address: string | null
  details: Record<string, unknown> | null
  users: { display_name: string | null; email: string | null }[] | null
}

export default function AdminAuditPage() {
  const { t, lang } = useI18n()
  const supabase = createClient()
  const [logs, setLogs] = useState<AuditLogRow[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [actionFilter, setActionFilter] = useState('all')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [page, setPage] = useState(0)
  const [total, setTotal] = useState(0)
  const [actions, setActions] = useState<string[]>([])
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const fetchActions = useCallback(async () => {
    try {
      const { data } = await supabase.from('audit_logs').select('action')
      if (data) {
        const unique = [...new Set(data.map(a => a.action).filter(Boolean) as string[])].sort()
        setActions(unique)
      }
    } catch (err) {
      console.error('Failed to fetch actions:', err)
    }
  }, [])

  useEffect(() => { fetchActions() }, [fetchActions])

  const fetchLogs = useCallback(async () => {
    setLoading(true)
    try {
      let query = supabase
        .from('audit_logs')
        .select('id, action, user_id, role, timestamp, ip_address, details, users:user_id(display_name, email)', { count: 'exact' })

      if (search.trim()) {
        query = query.ilike('action', '%' + search + '%')
      }
      if (actionFilter !== 'all') {
        query = query.eq('action', actionFilter)
      }
      if (dateFrom) {
        query = query.gte('timestamp', dateFrom + 'T00:00:00')
      }
      if (dateTo) {
        query = query.lte('timestamp', dateTo + 'T23:59:59')
      }

      const { data, count, error } = await query
        .order('timestamp', { ascending: false })
        .range(page * PER_PAGE, (page + 1) * PER_PAGE - 1)

      if (!error && data) {
        setLogs(data as AuditLogRow[])
        setTotal(count ?? 0)
      }
    } catch (err) {
      console.error('Failed to fetch logs:', err)
      setLogs([])
    }
    setLoading(false)
  }, [search, actionFilter, dateFrom, dateTo, page])

  useEffect(() => { fetchLogs() }, [fetchLogs])
  useEffect(() => { setPage(0) }, [search, actionFilter, dateFrom, dateTo])

  const totalPages = Math.ceil(total / PER_PAGE)

  function formatTimestamp(ts: string) {
    return new Date(ts).toLocaleString(LOCALE_MAP[lang] || 'en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      timeZoneName: 'short',
    })
  }

  function actionBadge(action: string) {
    const lower = action.toLowerCase()
    if (lower.includes('login') || lower.includes('logout') || lower.includes('register')) return 'info'
    if (lower.includes('create') || lower.includes('upload') || lower.includes('submit')) return 'success'
    if (lower.includes('update') || lower.includes('edit') || lower.includes('change')) return 'warning'
    if (lower.includes('delete') || lower.includes('remove') || lower.includes('archive')) return 'destructive'
    if (lower.includes('payment') || lower.includes('purchase')) return 'accent'
    return 'default'
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-on-surface">{t('admin1.audit.title')}</h1>
          <p className="text-on-surface-variant">{t('admin1.audit.subtitle')}</p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-4 flex-wrap">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted" />
              <Input
                placeholder={t('admin1.audit.searchPlaceholder')}
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="pl-10"
              />
            </div>
            <Select value={actionFilter} onChange={e => setActionFilter(e.target.value)} className="w-40">
              <option value="all">{t('admin1.audit.allActions')}</option>
              {actions.map(a => (
                <option key={a} value={a}>{a}</option>
              ))}
            </Select>
            <div className="flex items-center gap-2">
              <Input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="w-36" />
              <span className="text-xs text-muted">-</span>
              <Input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="w-36" />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="flex items-center justify-between rounded-lg border border-border bg-surface-container-low p-4 animate-pulse">
                  <div className="flex items-center gap-3">
                    <div className="h-5 w-5 rounded-full bg-surface-container-high" />
                    <div className="space-y-2">
                      <div className="h-4 w-48 rounded bg-surface-container-high" />
                      <div className="h-3 w-32 rounded bg-surface-container-high" />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <div className="h-3 w-28 rounded bg-surface-container-high" />
                    <div className="h-3 w-20 rounded bg-surface-container-high" />
                  </div>
                </div>
              ))}
            </div>
          ) : logs.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-muted">
              <Search className="h-8 w-8 mb-3" />
              {search || actionFilter !== 'all' || dateFrom || dateTo ? (
                <p className="text-sm">{t('admin1.audit.noLogsMatch')}</p>
              ) : (
                <>
                  <p className="text-sm font-medium text-on-surface">{t('admin1.audit.noLogs')}</p>
                  <p className="text-xs mt-1">{t('admin1.audit.noLogsDesc')}</p>
                </>
              )}
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-left text-xs text-muted uppercase">
                      <th className="pb-3 font-medium w-10"></th>
                      <th className="pb-3 font-medium">{t('admin1.audit.colAction')}</th>
                      <th className="pb-3 font-medium">{t('admin1.audit.colUser')}</th>
                      <th className="pb-3 font-medium">{t('admin1.audit.colRole')}</th>
                      <th className="pb-3 font-medium">{t('admin1.audit.colTimestamp')}</th>
                      <th className="pb-3 font-medium">{t('admin1.audit.colIp')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {logs.map(log => {
                      const user = log.users as { display_name?: string | null; email?: string | null } | null
                      const isExpanded = expandedId === log.id
                      return (
                        <Fragment key={log.id}>
                          <tr className="border-b border-border hover:bg-surface/50 transition-colors">
                            <td className="py-3">
                              {log.details && (
                                <Button variant="ghost" size="icon-sm" onClick={() => setExpandedId(isExpanded ? null : log.id)}>
                                  {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                                </Button>
                              )}
                            </td>
                            <td className="py-3">
                              <Badge variant={actionBadge(log.action)} size="sm">{log.action}</Badge>
                            </td>
                            <td className="py-3">
                              <p className="font-medium text-on-surface">{user?.display_name || t('admin1.audit.unknown')}</p>
                              {user?.email && <p className="text-xs text-muted">{user.email}</p>}
                            </td>
                            <td className="py-3 text-on-surface-variant">{log.role || '-'}</td>
                            <td className="py-3 text-on-surface-variant text-xs whitespace-nowrap">
                              {formatTimestamp(log.timestamp)}
                            </td>
                            <td className="py-3 text-xs font-mono text-on-surface-variant">{log.ip_address || '-'}</td>
                          </tr>
                          {isExpanded && log.details && (
                            <tr className="bg-surface-container-low">
                              <td colSpan={6} className="py-3 px-4">
                                <pre className="text-xs text-on-surface-variant whitespace-pre-wrap font-mono max-h-40 overflow-y-auto rounded border border-border bg-surface-container-lowest p-3">
                                  {JSON.stringify(log.details, null, 2)}
                                </pre>
                              </td>
                            </tr>
                          )}
                        </Fragment>
                      )
                    })}
                  </tbody>
                </table>
              </div>

{totalPages > 1 && (
                <div className="flex flex-col items-center justify-between gap-3 pt-4 sm:flex-row">
                  <p className="text-xs text-muted">
                    {t('admin1.audit.showing', { start: page * PER_PAGE + 1, end: Math.min((page + 1) * PER_PAGE, total), total })}
                  </p>
                  <div className="flex items-center gap-1 overflow-x-auto">
                    <Button variant="ghost" size="sm" disabled={page === 0} onClick={() => setPage(p => p - 1)}>
                      <ChevronLeft className="h-4 w-4" />
                    </Button>
                    {Array.from({ length: totalPages }, (_, i) => (
                      <Button key={i} variant={i === page ? 'default' : 'ghost'} size="sm" className="w-8" onClick={() => setPage(i)}>
                        {i + 1}
                      </Button>
                    ))}
                    <Button variant="ghost" size="sm" disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)}>
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
