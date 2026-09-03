'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Select } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { Label } from '@/components/ui/label'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { createClient } from '@/lib/supabase-client'
import { useAuth } from '@/lib/auth-context'
import { useI18n } from '@/lib/i18n/client'
import { formatDateOnly } from '@/lib/utils'
import {
  Plus, Edit, Trash2, Loader2, X, Save, Megaphone, Inbox, MailOpen, CheckCheck,
} from 'lucide-react'

interface Announcement {
  id: string
  title: string
  content: string
  priority: string
  is_active: boolean
  published_at: string
  created_at: string
}

interface ContactMessage {
  id: string
  name: string
  email: string
  subject: string | null
  message: string
  is_read: boolean | null
  created_at: string
}

const emptyForm = { title: '', content: '', priority: 'medium', is_active: true }

export default function AdminPengumumanPage() {
  const { t, lang } = useI18n()
  const locale = lang === 'en' ? 'en-US' : lang === 'zh' ? 'zh-CN' : 'id-ID'
  const { user } = useAuth()
  const supabase = createClient()
  const [activeTab, setActiveTab] = useState('announcements')
  const [announcements, setAnnouncements] = useState<Announcement[]>([])
  const [messages, setMessages] = useState<ContactMessage[]>([])
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState(emptyForm)
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null)

  useEffect(() => {
    fetchAll()
  }, [])

  async function fetchAll() {
    setLoading(true)
    try {
      const [annRes, msgRes] = await Promise.all([
        supabase.from('announcements').select('*').order('published_at', { ascending: false }),
        supabase.from('contact_messages').select('*').order('created_at', { ascending: false }),
      ])
      setAnnouncements((annRes.data || []) as Announcement[])
      setMessages((msgRes.data || []) as ContactMessage[])
    } catch (err) {
      console.error('Failed to fetch:', err)
    }
    setLoading(false)
  }

  function showToast(type: 'success' | 'error', message: string) {
    setToast({ type, message })
    setTimeout(() => setToast(null), 4000)
  }

  function openCreate() {
    setEditingId(null)
    setForm(emptyForm)
    setModalOpen(true)
  }

  function openEdit(a: Announcement) {
    setEditingId(a.id)
    setForm({ title: a.title, content: a.content, priority: a.priority, is_active: a.is_active })
    setModalOpen(true)
  }

  async function handleSave() {
    if (!form.title.trim()) return
    setSaving(true)
    try {
      const payload = {
        title: form.title.trim(),
        content: form.content.trim(),
        priority: form.priority,
        is_active: form.is_active,
        author_id: user?.id || null,
      }
      if (editingId) {
        const { error } = await supabase.from('announcements').update(payload).eq('id', editingId)
        if (error) throw error
        showToast('success', t('admin1.pengumuman.updatedSuccess'))
      } else {
        const { error } = await supabase.from('announcements').insert(payload)
        if (error) throw error
        showToast('success', t('admin1.pengumuman.createdSuccess'))
      }
      setModalOpen(false)
      fetchAll()
    } catch (err: any) {
      showToast('error', err?.message || t('admin1.pengumuman.saveError'))
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(id: string) {
    if (!confirm(t('admin1.pengumuman.deleteConfirm'))) return
    const { error } = await supabase.from('announcements').delete().eq('id', id)
    if (error) {
      showToast('error', error.message)
      return
    }
    showToast('success', t('admin1.pengumuman.deletedSuccess'))
    fetchAll()
  }

  async function handleMarkRead(id: string) {
    await supabase.from('contact_messages').update({ is_read: true }).eq('id', id)
    fetchAll()
  }

  async function handleDeleteMessage(id: string) {
    if (!confirm(t('admin1.pengumuman.deleteMessageConfirm'))) return
    await supabase.from('contact_messages').delete().eq('id', id)
    fetchAll()
  }

  const unreadCount = messages.filter(m => !m.is_read).length

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 text-indigo-400 animate-spin" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-on-surface">{t('admin1.pengumuman.title')}</h1>
          <p className="text-on-surface-variant">{t('admin1.pengumuman.subtitle')}</p>
        </div>
        {toast && (
          <div className={`rounded-lg px-4 py-2 text-sm ${toast.type === 'success' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-red-500/10 text-red-400 border border-red-500/20'}`}>
            {toast.message}
          </div>
        )}
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="announcements">
            <Megaphone className="mr-1.5 h-3.5 w-3.5" /> {t('admin1.pengumuman.tabAnnouncements')} ({announcements.length})
          </TabsTrigger>
          <TabsTrigger value="inbox">
            <Inbox className="mr-1.5 h-3.5 w-3.5" /> {t('admin1.pengumuman.tabInbox')} ({messages.length})
            {unreadCount > 0 && (
              <span className="ml-1.5 rounded-full bg-red-500 px-1.5 py-0.5 text-[10px] font-bold text-white">{unreadCount}</span>
            )}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="announcements" className="space-y-3">
          <div className="flex justify-end">
            <Button size="sm" onClick={openCreate}>
              <Plus className="mr-1 h-4 w-4" /> {t('admin1.pengumuman.create')}
            </Button>
          </div>
          {announcements.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12 text-center">
                <Megaphone className="h-12 w-12 text-muted mb-3" />
                <p className="text-sm text-on-surface-variant">{t('admin1.pengumuman.noAnnouncements')}</p>
              </CardContent>
            </Card>
          ) : (
            announcements.map((a) => (
              <Card key={a.id}>
                <CardContent className="flex items-start justify-between gap-3 p-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-semibold text-on-surface">{a.title}</p>
                      <Badge variant={a.priority === 'high' ? 'destructive' : a.priority === 'medium' ? 'warning' : 'default'} className="text-[10px]">
                        {a.priority}
                      </Badge>
                      {!a.is_active && <Badge variant="outline" className="text-[10px]">hidden</Badge>}
                    </div>
                    <p className="mt-1 line-clamp-2 text-sm text-on-surface-variant">{a.content}</p>
                    <p className="mt-1 text-xs text-muted">{formatDateOnly(a.published_at || a.created_at, locale)}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <Button size="sm" variant="ghost" onClick={() => openEdit(a)}>
                      <Edit className="h-4 w-4" />
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => handleDelete(a.id)}>
                      <Trash2 className="h-4 w-4 text-red-400" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </TabsContent>

        <TabsContent value="inbox" className="space-y-3">
          {messages.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12 text-center">
                <MailOpen className="h-12 w-12 text-muted mb-3" />
                <p className="text-sm text-on-surface-variant">{t('admin1.pengumuman.noInbox')}</p>
              </CardContent>
            </Card>
          ) : (
            messages.map((m) => (
              <Card key={m.id} className={!m.is_read ? 'border-indigo-500/30' : ''}>
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-semibold text-on-surface">{m.subject || '(no subject)'}</p>
                        {!m.is_read && <Badge variant="default" className="text-[10px]">{t('admin1.pengumuman.unread')}</Badge>}
                      </div>
                      <p className="mt-0.5 text-xs text-muted">
                        {t('admin1.pengumuman.inboxFrom')}: {m.name} &lt;{m.email}&gt; • {formatDateOnly(m.created_at, locale)}
                      </p>
                      <p className="mt-2 text-sm text-on-surface-variant whitespace-pre-wrap">{m.message}</p>
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      {!m.is_read && (
                        <Button size="sm" variant="ghost" title={t('admin1.pengumuman.markRead')} onClick={() => handleMarkRead(m.id)}>
                          <CheckCheck className="h-4 w-4 text-emerald-400" />
                        </Button>
                      )}
                      <Button size="sm" variant="ghost" onClick={() => handleDeleteMessage(m.id)}>
                        <Trash2 className="h-4 w-4 text-red-400" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </TabsContent>
      </Tabs>

      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4" onClick={() => setModalOpen(false)}>
          <div className="w-full max-w-lg rounded-2xl border border-border bg-surface p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-bold text-on-surface">
                {editingId ? t('admin1.pengumuman.editTitle') : t('admin1.pengumuman.createTitle')}
              </h2>
              <button onClick={() => setModalOpen(false)} className="text-muted hover:text-on-surface">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label>{t('admin1.pengumuman.titleLabel')}</Label>
                <Input
                  placeholder={t('admin1.pengumuman.titlePlaceholder')}
                  value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label>{t('admin1.pengumuman.contentLabel')}</Label>
                <Textarea
                  placeholder={t('admin1.pengumuman.contentPlaceholder')}
                  value={form.content}
                  onChange={(e) => setForm({ ...form, content: e.target.value })}
                  rows={5}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>{t('admin1.pengumuman.priorityLabel')}</Label>
                  <Select value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })}>
                    <option value="high">{t('admin1.pengumuman.priorityHigh')}</option>
                    <option value="medium">{t('admin1.pengumuman.priorityMedium')}</option>
                    <option value="low">{t('admin1.pengumuman.priorityLow')}</option>
                  </Select>
                </div>
                <div className="flex items-end gap-2 pb-2">
                  <input
                    id="ann-active"
                    type="checkbox"
                    checked={form.is_active}
                    onChange={(e) => setForm({ ...form, is_active: e.target.checked })}
                    className="h-4 w-4 rounded"
                  />
                  <Label htmlFor="ann-active">{t('admin1.pengumuman.activeLabel')}</Label>
                </div>
              </div>
            </div>
            <div className="flex items-center justify-end gap-3 mt-6 pt-4 border-t border-border">
              <Button variant="secondary" onClick={() => setModalOpen(false)}>{t('admin1.pengumuman.cancel')}</Button>
              <Button onClick={handleSave} disabled={saving || !form.title.trim()}>
                <Save className="mr-1.5 h-4 w-4" /> {saving ? t('admin1.pengumuman.save') + '...' : t('admin1.pengumuman.save')}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
