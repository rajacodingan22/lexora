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
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { createClient } from '@/lib/supabase-client'
import { useI18n } from '@/lib/i18n/client'
import { formatDateOnly } from '@/lib/utils'
import {
  Plus, Edit, Trash2, Search, Loader2, X, Save, FileText, Megaphone,
  CalendarDays, GraduationCap, Trophy
} from 'lucide-react'

interface NewsItem {
  id: string
  title: string
  slug: string
  content: string
  category: string
  status: string
  image_url: string | null
  published_at: string | null
  author_id: string | null
  created_at: string
  updated_at: string
}

const tabs = [
  { id: 'news', labelKey: 'admin1.berita.tabNews', icon: FileText },
  { id: 'announcement', labelKey: 'admin1.berita.tabAnnouncement', icon: Megaphone },
  { id: 'event', labelKey: 'admin1.berita.tabEvent', icon: CalendarDays },
  { id: 'scholarship', labelKey: 'admin1.berita.tabScholarship', icon: GraduationCap },
  { id: 'competition', labelKey: 'admin1.berita.tabCompetition', icon: Trophy },
]

type FormState = {
  title: string
  content: string
  category: string
  status: 'draft' | 'published'
  publish_date: string
  image_url: string
}

const emptyForm: FormState = {
  title: '',
  content: '',
  category: 'news',
  status: 'draft',
  publish_date: '',
  image_url: '',
}

export default function AdminBeritaPage() {
  const { t, lang } = useI18n()
  const locale = lang === 'en' ? 'en-US' : lang === 'zh' ? 'zh-CN' : 'id-ID'
  const supabase = createClient()
  const [activeTab, setActiveTab] = useState('news')
  const [items, setItems] = useState<NewsItem[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [modalOpen, setModalOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<FormState>(emptyForm)
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null)

  useEffect(() => {
    fetchItems()
  }, [activeTab])

  async function fetchItems() {
    setLoading(true)
    try {
      let query = supabase.from('news').select('*').order('created_at', { ascending: false })
      if (activeTab !== 'news') {
        query = query.eq('category', activeTab)
      }
      const { data } = await query
      setItems((data as NewsItem[]) || [])
    } catch (err) {
      console.error('Failed to fetch news items', err)
    } finally {
      setLoading(false)
    }
  }

  function openCreate() {
    setForm({ ...emptyForm, category: activeTab === 'news' ? 'news' : activeTab })
    setEditingId(null)
    setModalOpen(true)
  }

  function openEdit(item: NewsItem) {
    setForm({
      title: item.title,
      content: item.content,
      category: item.category,
      status: item.status as 'draft' | 'published',
      publish_date: item.published_at ? item.published_at.slice(0, 16) : '',
      image_url: item.image_url || '',
    })
    setEditingId(item.id)
    setModalOpen(true)
  }

  async function handleDelete(id: string) {
    if (!confirm(t('admin1.berita.deleteConfirm'))) return
    try {
      const { error } = await supabase.from('news').delete().eq('id', id)
      if (error) throw error
      setToast({ type: 'success', message: t('admin1.berita.deletedSuccess') })
      fetchItems()
    } catch (err) {
      console.error('Failed to delete item', err)
      setToast({ type: 'error', message: t('admin1.berita.deleteError') })
    }
  }

  function slugify(text: string) {
    return text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')
  }

  async function handleSave() {
    if (!form.title.trim()) {
      setToast({ type: 'error', message: t('admin1.berita.titleRequired') })
      return
    }
    setSaving(true)
    try {
      const payload = {
        title: form.title,
        slug: slugify(form.title),
        content: form.content,
        category: form.category,
        status: form.status,
        image_url: form.image_url || null,
        published_at: form.publish_date || null,
      }

      const result = editingId
        ? await supabase.from('news').update(payload).eq('id', editingId)
        : await supabase.from('news').insert(payload)
      if (result.error) throw result.error

      setToast({ type: 'success', message: editingId ? t('admin1.berita.updatedSuccess') : t('admin1.berita.createdSuccess') })
      setModalOpen(false)
      fetchItems()
    } catch (err) {
      console.error('Failed to save item', err)
      setToast({ type: 'error', message: t('admin1.berita.saveError') })
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
          <h1 className="text-2xl font-bold text-on-surface">{t('admin1.berita.title')}</h1>
          <p className="text-on-surface-variant">{t('admin1.berita.subtitle')}</p>
        </div>
        <Button size="sm" onClick={openCreate}><Plus className="h-4 w-4" /> {t('admin1.berita.create')}</Button>
      </div>

      {toast && (
        <div className={`rounded-lg px-4 py-3 text-sm ${toast.type === 'success' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-red-500/10 text-red-400'}`}>
          {toast.message}
          <button className="float-right" onClick={() => setToast(null)}><X className="h-4 w-4" /></button>
        </div>
      )}

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          {tabs.map((tab) => (
            <TabsTrigger key={tab.id} value={tab.id}>
              <tab.icon className="h-4 w-4" /> {t(tab.labelKey)}
            </TabsTrigger>
          ))}
        </TabsList>

        {tabs.map((tab) => (
          <TabsContent key={tab.id} value={tab.id}>
            <Card>
              <CardHeader>
                <div className="flex items-center gap-4">
                  <div className="relative flex-1 max-w-md">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted" />
                    <Input
                      placeholder={t('admin1.berita.searchPlaceholder')}
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      className="pl-10"
                    />
                  </div>
                  <Badge variant="outline" className="text-xs">
                    {t('admin1.berita.itemCount', { count: filtered.length })}
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
                    <FileText className="h-10 w-10 text-muted mb-3" />
                    <p className="text-sm text-muted">{t('admin1.berita.noItemsTab', { tab: t(tab.labelKey).toLowerCase() })}</p>
                    <Button variant="outline" size="sm" className="mt-3" onClick={openCreate}>
                      <Plus className="h-4 w-4" /> {t('admin1.berita.createFirst')}
                    </Button>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-border text-left text-xs text-muted uppercase">
                          <th className="pb-3 font-medium">{t('admin1.berita.colTitle')}</th>
                          <th className="pb-3 font-medium">{t('admin1.berita.colStatus')}</th>
                          <th className="pb-3 font-medium">{t('admin1.berita.colPublishDate')}</th>
                          <th className="pb-3 font-medium">{t('admin1.berita.colCreated')}</th>
                          <th className="pb-3 font-medium">{t('admin1.berita.colActions')}</th>
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
                              <Badge variant={item.status === 'published' ? 'success' : 'warning'}>
                                {item.status}
                              </Badge>
                            </td>
                            <td className="py-3 text-on-surface-variant">
                              {item.published_at ? formatDateOnly(item.published_at, locale) : '-'}
                            </td>
                            <td className="py-3 text-on-surface-variant">
                              {formatDateOnly(item.created_at, locale)}
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
          </TabsContent>
        ))}
      </Tabs>

      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => !saving && setModalOpen(false)}>
          <div className="w-full max-w-lg rounded-xl border border-border bg-surface p-6 shadow-xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-on-surface">
                {editingId ? t('admin1.berita.editTitle') : t('admin1.berita.createTitle')}
              </h2>
              <Button variant="ghost" size="sm" onClick={() => setModalOpen(false)} disabled={saving}>
                <X className="h-4 w-4" />
              </Button>
            </div>
            <div className="space-y-4">
              <div>
                <Label htmlFor="berita-title">{t('admin1.berita.titleLabel')}</Label>
                <Input id="berita-title" value={form.title} onChange={(e) => setForm(p => ({ ...p, title: e.target.value }))} placeholder={t('admin1.berita.titlePlaceholder')} />
              </div>
              <div>
                <Label htmlFor="berita-content">{t('admin1.berita.contentLabel')}</Label>
                <Textarea id="berita-content" value={form.content} onChange={(e) => setForm(p => ({ ...p, content: e.target.value }))} rows={5} placeholder={t('admin1.berita.contentPlaceholder')} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="berita-category">{t('admin1.berita.categoryLabel')}</Label>
                  <Select id="berita-category" value={form.category} onChange={(e) => setForm(p => ({ ...p, category: e.target.value }))}>
                    <option value="news">{t('admin1.berita.catNews')}</option>
                    <option value="announcement">{t('admin1.berita.catAnnouncement')}</option>
                    <option value="event">{t('admin1.berita.catEvent')}</option>
                    <option value="scholarship">{t('admin1.berita.catScholarship')}</option>
                    <option value="competition">{t('admin1.berita.catCompetition')}</option>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="berita-status">{t('admin1.berita.statusLabel')}</Label>
                  <Select id="berita-status" value={form.status} onChange={(e) => setForm(p => ({ ...p, status: e.target.value as 'draft' | 'published' }))}>
                    <option value="draft">{t('admin1.berita.draft')}</option>
                    <option value="published">{t('admin1.berita.published')}</option>
                  </Select>
                </div>
              </div>
              <div>
                <Label htmlFor="berita-publish-date">{t('admin1.berita.publishDateLabel')}</Label>
                <Input id="berita-publish-date" type="datetime-local" value={form.publish_date} onChange={(e) => setForm(p => ({ ...p, publish_date: e.target.value }))} />
              </div>
              <div>
                <Label>{t('admin1.berita.imageLabel')}</Label>
                <ImageUpload
                  bucket="news-images"
                  pathPrefix={`berita/${Date.now()}`}
                  value={form.image_url || null}
                  onUpload={(url) => setForm(p => ({ ...p, image_url: url }))}
                  onRemove={() => setForm(p => ({ ...p, image_url: '' }))}
                />
              </div>
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => setModalOpen(false)} disabled={saving}>{t('admin1.berita.cancel')}</Button>
              <Button size="sm" onClick={handleSave} disabled={saving}>
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                {editingId ? t('admin1.berita.update') : t('admin1.berita.createShort')}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
