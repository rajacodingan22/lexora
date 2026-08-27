'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Select } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { Label } from '@/components/ui/label'
import { ImageUpload } from '@/components/ui/image-upload'
import { createClient } from '@/lib/supabase-client'
import { useI18n } from '@/lib/i18n/client'
import { formatDateOnly } from '@/lib/utils'
import {
  Plus, Edit, Trash2, Search, Loader2, X, Save, CalendarDays,
} from 'lucide-react'

interface EventItem {
  id: string
  title: string
  slug: string
  description: string | null
  content: string | null
  image_url: string | null
  event_date: string | null
  event_time: string | null
  location: string | null
  event_type: string | null
  registration_link: string | null
  status: string
  created_at: string
  updated_at: string
}

type FormState = {
  title: string
  description: string
  content: string
  event_date: string
  event_time: string
  location: string
  event_type: string
  registration_link: string
  image_url: string
  status: 'draft' | 'published'
}

const emptyForm: FormState = {
  title: '',
  description: '',
  content: '',
  event_date: '',
  event_time: '',
  location: '',
  event_type: 'Webinar',
  registration_link: '',
  image_url: '',
  status: 'draft',
}

export default function AdminEventPage() {
  const { t } = useI18n()
  const supabase = createClient()
  const [items, setItems] = useState<EventItem[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [modalOpen, setModalOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<FormState>(emptyForm)
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null)

  useEffect(() => {
    fetchEvents()
  }, [])

  async function fetchEvents() {
    setLoading(true)
    try {
      const { data } = await supabase
        .from('events')
        .select('*')
        .order('event_date', { ascending: false })
      setItems((data as EventItem[]) || [])
    } catch (err) {
      console.error('Failed to fetch events', err)
    } finally {
      setLoading(false)
    }
  }

  function openCreate() {
    setForm(emptyForm)
    setEditingId(null)
    setModalOpen(true)
  }

  function openEdit(item: EventItem) {
    setForm({
      title: item.title,
      description: item.description || '',
      content: item.content || '',
      event_date: item.event_date ? item.event_date.slice(0, 10) : '',
      event_time: item.event_time || '',
      location: item.location || '',
      event_type: item.event_type || 'Webinar',
      registration_link: item.registration_link || '',
      image_url: item.image_url || '',
      status: item.status as 'draft' | 'published',
    })
    setEditingId(item.id)
    setModalOpen(true)
  }

  async function handleDelete(id: string) {
    if (!confirm(t('admin1.event.deleteConfirm'))) return
    try {
      await supabase.from('events').delete().eq('id', id)
      setToast({ type: 'success', message: t('admin1.event.deletedSuccess') })
      fetchEvents()
    } catch (err) {
      console.error('Failed to delete event', err)
      setToast({ type: 'error', message: t('admin1.event.deleteError') })
    }
  }

  function slugify(text: string) {
    return text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')
  }

  async function handleSave() {
    if (!form.title.trim()) {
      setToast({ type: 'error', message: t('admin1.event.titleRequired') })
      return
    }
    setSaving(true)
    try {
      const payload = {
        title: form.title,
        slug: slugify(form.title),
        description: form.description || null,
        content: form.content || null,
        event_date: form.event_date || null,
        event_time: form.event_time || null,
        location: form.location || null,
        event_type: form.event_type || null,
        registration_link: form.registration_link || null,
        image_url: form.image_url || null,
        status: form.status,
      }

      if (editingId) {
        await supabase.from('events').update(payload).eq('id', editingId)
      } else {
        await supabase.from('events').insert(payload)
      }

      setToast({ type: 'success', message: editingId ? t('admin1.event.updatedSuccess') : t('admin1.event.createdSuccess') })
      setModalOpen(false)
      fetchEvents()
    } catch (err) {
      console.error('Failed to save event', err)
      setToast({ type: 'error', message: t('admin1.event.saveError') })
    } finally {
      setSaving(false)
    }
  }

  const filtered = items.filter(i =>
    i.title.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-on-surface">{t('admin1.event.title')}</h1>
          <p className="text-on-surface-variant">{t('admin1.event.subtitle')}</p>
        </div>
        <Button size="sm" onClick={openCreate}><Plus className="h-4 w-4" /> {t('admin1.event.create')}</Button>
      </div>

      {toast && (
        <div className={`rounded-lg px-4 py-3 text-sm ${toast.type === 'success' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-red-500/10 text-red-400'}`}>
          {toast.message}
          <button className="float-right" onClick={() => setToast(null)}><X className="h-4 w-4" /></button>
        </div>
      )}

      <Card>
        <CardHeader>
          <div className="flex items-center gap-4">
            <div className="relative flex-1 max-w-md">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted" />
                    <Input
                      placeholder={t('admin1.event.searchPlaceholder')}
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      className="pl-10"
                    />
            </div>
            <Badge variant="outline" className="text-xs">
              {t('admin1.event.eventCount', { count: filtered.length })}
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-indigo-400" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <CalendarDays className="h-10 w-10 text-muted mb-3" />
              <p className="text-sm text-muted">{t('admin1.event.noEvents')}</p>
              <Button variant="outline" size="sm" className="mt-3" onClick={openCreate}>
                <Plus className="h-4 w-4" /> {t('admin1.event.createFirst')}
              </Button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs text-muted uppercase">
                    <th className="pb-3 font-medium">{t('admin1.event.colTitle')}</th>
                    <th className="pb-3 font-medium">{t('admin1.event.colType')}</th>
                    <th className="pb-3 font-medium">{t('admin1.event.colDate')}</th>
                    <th className="pb-3 font-medium">{t('admin1.event.colStatus')}</th>
                    <th className="pb-3 font-medium">{t('admin1.event.colCreated')}</th>
                    <th className="pb-3 font-medium">{t('admin1.event.colActions')}</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((item) => (
                    <tr key={item.id} className="border-b border-border last:border-0">
                      <td className="py-3">
                        <p className="font-medium text-on-surface">{item.title}</p>
                        <p className="text-xs text-muted">{item.slug}</p>
                      </td>
                      <td className="py-3">
                        <Badge variant="outline">{item.event_type || '-'}</Badge>
                      </td>
                      <td className="py-3 text-on-surface-variant">
                        {item.event_date ? formatDateOnly(item.event_date) : '-'}
                      </td>
                      <td className="py-3">
                        <Badge variant={item.status === 'published' ? 'success' : 'warning'}>
                          {item.status}
                        </Badge>
                      </td>
                      <td className="py-3 text-on-surface-variant">
                        {formatDateOnly(item.created_at)}
                      </td>
                      <td className="py-3">
                        <div className="flex items-center gap-1">
                          <Button variant="ghost" size="sm" onClick={() => openEdit(item)}>
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="sm" onClick={() => handleDelete(item.id)}>
                            <Trash2 className="h-4 w-4 text-red-400" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => !saving && setModalOpen(false)}>
          <div className="w-full max-w-lg rounded-xl border border-border bg-surface p-6 shadow-xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-on-surface">
                {editingId ? t('admin1.event.editTitle') : t('admin1.event.create')}
              </h2>
              <Button variant="ghost" size="sm" onClick={() => setModalOpen(false)} disabled={saving}>
                <X className="h-4 w-4" />
              </Button>
            </div>
            <div className="space-y-4">
              <div>
                <Label htmlFor="event-title">{t('admin1.event.titleLabel')}</Label>
                <Input id="event-title" value={form.title} onChange={(e) => setForm(p => ({ ...p, title: e.target.value }))} placeholder={t('admin1.event.titlePlaceholder')} />
              </div>
              <div>
                <Label htmlFor="event-description">{t('admin1.event.descriptionLabel')}</Label>
                <Textarea id="event-description" value={form.description} onChange={(e) => setForm(p => ({ ...p, description: e.target.value }))} rows={2} placeholder={t('admin1.event.descriptionPlaceholder')} />
              </div>
              <div>
                <Label htmlFor="event-content">{t('admin1.event.contentLabel')}</Label>
                <Textarea id="event-content" value={form.content} onChange={(e) => setForm(p => ({ ...p, content: e.target.value }))} rows={5} placeholder={t('admin1.event.contentPlaceholder')} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="event-date">{t('admin1.event.eventDateLabel')}</Label>
                  <Input id="event-date" type="date" value={form.event_date} onChange={(e) => setForm(p => ({ ...p, event_date: e.target.value }))} />
                </div>
                <div>
                  <Label htmlFor="event-time">{t('admin1.event.eventTimeLabel')}</Label>
                  <Input id="event-time" value={form.event_time} onChange={(e) => setForm(p => ({ ...p, event_time: e.target.value }))} placeholder={t('admin1.event.timePlaceholder')} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="event-location">{t('admin1.event.locationLabel')}</Label>
                  <Input id="event-location" value={form.location} onChange={(e) => setForm(p => ({ ...p, location: e.target.value }))} placeholder={t('admin1.event.locationPlaceholder')} />
                </div>
                <div>
                  <Label htmlFor="event-type">{t('admin1.event.eventTypeLabel')}</Label>
                  <Select id="event-type" value={form.event_type} onChange={(e) => setForm(p => ({ ...p, event_type: e.target.value }))}>
                    <option value="Webinar">Webinar</option>
                    <option value="Bootcamp">Bootcamp</option>
                    <option value="Workshop">Workshop</option>
                    <option value="Free Class">Free Class</option>
                    <option value="Seminar">Seminar</option>
                    <option value="Competition">Competition</option>
                    <option value="Other">Other</option>
                  </Select>
                </div>
              </div>
              <div>
                <Label htmlFor="event-reg-link">{t('admin1.event.regLinkLabel')}</Label>
                <Input id="event-reg-link" value={form.registration_link} onChange={(e) => setForm(p => ({ ...p, registration_link: e.target.value }))} placeholder={t('admin1.event.regLinkPlaceholder')} />
              </div>
              <div>
                <Label>{t('admin1.event.imageLabel')}</Label>
                <ImageUpload
                  bucket="cms"
                  pathPrefix={`event/${Date.now()}`}
                  value={form.image_url || null}
                  onUpload={(url) => setForm(p => ({ ...p, image_url: url }))}
                  onRemove={() => setForm(p => ({ ...p, image_url: '' }))}
                />
              </div>
              <div>
                <Label htmlFor="event-status">{t('admin1.event.statusLabel')}</Label>
                <Select id="event-status" value={form.status} onChange={(e) => setForm(p => ({ ...p, status: e.target.value as 'draft' | 'published' }))}>
                  <option value="draft">{t('admin1.event.draft')}</option>
                  <option value="published">{t('admin1.event.published')}</option>
                </Select>
              </div>
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => setModalOpen(false)} disabled={saving}>{t('admin1.event.cancel')}</Button>
              <Button size="sm" onClick={handleSave} disabled={saving}>
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                {editingId ? t('admin1.event.update') : t('admin1.event.createShort')}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
