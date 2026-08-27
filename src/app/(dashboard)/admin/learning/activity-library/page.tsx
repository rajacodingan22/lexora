'use client'

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase-client'
import { useI18n } from '@/lib/i18n/client'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { ACTIVITY_TYPES, getActivityTypeLabel } from '@/lib/learning'
import { getActivityIcon } from '@/components/learning/admin/activity-type-picker'
import type { ActivityLibraryItem, ActivityType } from '@/types'
import { Loader2, Search, Trash2 } from 'lucide-react'

export default function AdminActivityLibraryPage() {
  const { t } = useI18n()
  const supabase = createClient()
  const [items, setItems] = useState<ActivityLibraryItem[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState<'' | ActivityType>('')

  const fetchItems = useCallback(async () => {
    setLoading(true)
    let q = supabase.from('activity_library_items').select('*').order('updated_at', { ascending: false })
    if (typeFilter) q = q.eq('activity_type', typeFilter)
    const { data } = await q
    setItems((data ?? []) as ActivityLibraryItem[])
    setLoading(false)
  }, [typeFilter, supabase])

  useEffect(() => {
    fetchItems()
  }, [fetchItems])

  async function deleteItem(item: ActivityLibraryItem) {
    if (!window.confirm('Delete this item from the library?')) return
    const { error } = await supabase.from('activity_library_items').delete().eq('id', item.id)
    if (error) window.alert(error.message)
    fetchItems()
  }

  const filtered = items.filter((it) => it.title.toLowerCase().includes(search.toLowerCase()))

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">{t('library.title')}</h1>
        <p className="text-sm text-slate-500">{t('library.subtitle')}</p>
      </div>

      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t('library.search')} className="pl-9" />
        </div>
        <Select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value as ActivityType | '')} className="w-48">
          <option value="">{t('library.filterAll')}</option>
          {ACTIVITY_TYPES.map((ty) => (
            <option key={ty} value={ty}>{getActivityTypeLabel(ty).en}</option>
          ))}
        </Select>
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
        </div>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center text-sm text-slate-400">
            {t('library.noItems')}
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((item) => {
            const Icon = getActivityIcon(item.activity_type)
            return (
              <Card key={item.id}>
                <CardContent className="space-y-2 p-4">
                  <div className="flex items-start gap-3">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-indigo-50">
                      <Icon className="h-4.5 w-4.5 text-indigo-600" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium text-slate-800">{item.title}</p>
                      {item.description && <p className="line-clamp-2 text-xs text-slate-500">{item.description}</p>}
                    </div>
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline">{getActivityTypeLabel(item.activity_type).en}</Badge>
                      <span className="text-xs text-slate-400">
                        {item.usage_count || 0}× {t('library.usageCount')}
                      </span>
                    </div>
                    <Button size="sm" variant="ghost" className="text-red-600 hover:bg-red-50" onClick={() => deleteItem(item)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}