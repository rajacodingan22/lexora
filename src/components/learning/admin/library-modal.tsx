'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase-client'
import { useI18n } from '@/lib/i18n/client'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { ACTIVITY_TYPES, getActivityTypeLabel } from '@/lib/learning'
import { getActivityIcon } from '@/components/learning/admin/activity-type-picker'
import type { ActivityLibraryItem, ActivityType } from '@/types'
import { Loader2, Search, X, Copy } from 'lucide-react'

export function LibraryModal({
  open,
  onClose,
  onUse,
}: {
  open: boolean
  onClose: () => void
  onUse: (item: ActivityLibraryItem) => void
}) {
  const supabase = createClient()
  const { t } = useI18n()
  const [items, setItems] = useState<ActivityLibraryItem[]>([])
  const [loading, setLoading] = useState(false)
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState<'' | ActivityType>('')
  const [usedId, setUsedId] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    ;(async () => {
      setLoading(true)
      let q = supabase.from('activity_library_items').select('*').order('updated_at', { ascending: false })
      if (typeFilter) q = q.eq('activity_type', typeFilter)
      const { data } = await q
      setItems((data ?? []) as ActivityLibraryItem[])
      setLoading(false)
    })()
  }, [open, typeFilter, supabase])

  if (!open) return null

  const filtered = items.filter((it) => it.title.toLowerCase().includes(search.toLowerCase()))

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/60 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="flex h-[70vh] w-full max-w-3xl flex-col rounded-2xl bg-surface border border-border shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-border px-5 py-3">
          <h3 className="text-lg font-semibold text-on-surface">{t('library.title')}</h3>
          <Button size="sm" variant="ghost" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>
        <div className="flex items-center gap-2 border-b border-border px-5 py-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t('library.search')} className="pl-9" />
          </div>
        <Select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value as ActivityType | '')} className="w-44">
          <option value="">{t('library.filterAll')}</option>
            {ACTIVITY_TYPES.map((t) => (
              <option key={t} value={t}>{getActivityTypeLabel(t).en}</option>
            ))}
          </Select>
        </div>
        <div className="flex-1 space-y-2 overflow-y-auto p-5">
          {loading ? (
            <div className="flex justify-center py-10">
              <Loader2 className="h-6 w-6 animate-spin text-muted" />
            </div>
          ) : filtered.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted">{t('library.noItems')}</p>
          ) : (
            filtered.map((item) => {
              const Icon = getActivityIcon(item.activity_type)
              return (
                <div key={item.id} className="flex items-center gap-3 rounded-xl border border-border p-3">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary-soft">
                    <Icon className="h-4.5 w-4.5 text-primary" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-on-surface">{item.title}</p>
                    <p className="text-xs text-on-surface-variant">
                      {getActivityTypeLabel(item.activity_type).en} • {item.usage_count} {t('library.usageCount')}
                    </p>
                  </div>
                  <Badge variant="outline">{getActivityTypeLabel(item.activity_type).en}</Badge>
                  <Button
                    size="sm"
                    disabled={usedId === item.id}
                    onClick={() => {
                      setUsedId(item.id)
                      onUse(item)
                    }}
                  >
                    {usedId === item.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Copy className="mr-1 h-3.5 w-3.5" />}
                    {t('library.duplicate')}
                  </Button>
                </div>
              )
            })
          )}
        </div>
      </div>
    </div>
  )
}
