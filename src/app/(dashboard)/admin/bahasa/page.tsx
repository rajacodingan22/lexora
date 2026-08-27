'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase-client'
import { useI18n } from '@/lib/i18n/client'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Plus, Pencil, Trash2, Search, X, Check, Globe, Loader2 } from 'lucide-react'

interface Language {
  code: string
  name: { id: string; en: string }
  native_name: string
  is_active: boolean
  flag_emoji?: string
  is_rtl?: boolean
  sort_order?: number
  created_at?: string
}

const LOCALE_MAP: Record<string, string> = { en: 'en-US', id: 'id-ID', zh: 'zh-CN' }

export default function AdminBahasaPage() {
  const { t, lang } = useI18n()
  const supabase = createClient()
  const [languages, setLanguages] = useState<Language[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [showModal, setShowModal] = useState(false)
  const [editing, setEditing] = useState<Language | null>(null)
  const [form, setForm] = useState({ code: '', name_id: '', name_en: '', native_name: '' })
  const [saving, setSaving] = useState(false)
  const [actionError, setActionError] = useState('')

  useEffect(() => {
    fetchLanguages()
  }, [])

  async function fetchLanguages() {
    setLoading(true)
    try {
      const { data } = await supabase.from('languages').select('*').order('sort_order')
      if (data) setLanguages(data as Language[])
    } catch (err) {
      console.error('Failed to fetch languages:', err)
    }
    setLoading(false)
  }

  function openAdd() {
    setEditing(null)
    setForm({ code: '', name_id: '', name_en: '', native_name: '' })
    setShowModal(true)
  }

  function openEdit(lang: Language) {
    setEditing(lang)
    setForm({
      code: lang.code,
      name_id: lang.name?.id || '',
      name_en: lang.name?.en || '',
      native_name: lang.native_name || '',
    })
    setShowModal(true)
  }

  async function handleSave() {
    if (!form.code || !form.name_id) return
    setSaving(true)
    setActionError('')
    const payload = {
      code: form.code,
      name: { id: form.name_id, en: form.name_en || form.name_id },
      native_name: form.native_name,
    }
    const { error } = editing
      ? await supabase.from('languages').update(payload).eq('code', editing.code)
      : await supabase.from('languages').insert(payload)
    if (error) {
      setActionError(error.message)
      setSaving(false)
      return
    }
    setSaving(false)
    setShowModal(false)
    fetchLanguages()
  }

  async function toggleActive(lang: Language) {
    setActionError('')
    const { error } = await supabase.from('languages').update({ is_active: !lang.is_active }).eq('code', lang.code)
    if (error) {
      setActionError(error.message)
      return
    }
    fetchLanguages()
  }

  async function handleDelete(code: string) {
    if (!confirm(t('admin1.bahasa.deleteConfirm'))) return
    setActionError('')
    const { error } = await supabase.from('languages').delete().eq('code', code)
    if (error) {
      setActionError(error.message)
      return
    }
    fetchLanguages()
  }

  const filtered = languages.filter(l =>
    l.code.toLowerCase().includes(search.toLowerCase()) ||
    l.native_name?.toLowerCase().includes(search.toLowerCase()) ||
    l.name?.en?.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-on-surface">{t('admin1.bahasa.title')}</h1>
          <p className="text-on-surface-variant">{t('admin1.bahasa.subtitle')}</p>
        </div>
        <Button size="sm" onClick={openAdd}><Plus className="mr-1 h-4 w-4" /> {t('admin1.bahasa.add')}</Button>
      </div>

      <Card>
        <CardHeader>
          <div className="relative max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted" />
            <Input
              placeholder={t('admin1.bahasa.searchPlaceholder')}
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-10"
            />
          </div>
        </CardHeader>
        <CardContent>
          {actionError && (
            <div className="mb-4 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
              {actionError}
            </div>
          )}
          {loading ? (
            <div className="flex items-center justify-center py-12 text-muted">
              <Loader2 className="h-5 w-5 animate-spin mr-2" /> {t('admin1.bahasa.loading')}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs text-muted uppercase">
                    <th className="pb-3 font-medium">{t('admin1.bahasa.colCode')}</th>
                    <th className="pb-3 font-medium">{t('admin1.bahasa.colName')}</th>
                    <th className="pb-3 font-medium">{t('admin1.bahasa.colNativeName')}</th>
                    <th className="pb-3 font-medium">{t('admin1.bahasa.colStatus')}</th>
                    <th className="pb-3 font-medium">{t('admin1.bahasa.colCreated')}</th>
                    <th className="pb-3 font-medium">{t('admin1.bahasa.colActions')}</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(l => (
                    <tr key={l.code} className="border-b border-border last:border-0">
                      <td className="py-3 font-mono text-xs text-on-surface-variant">{l.code}</td>
                      <td className="py-3">
                        <div className="flex items-center gap-2">
                          <Globe className="h-4 w-4 text-muted" />
                          <span className="font-medium text-on-surface">{l.name?.en || l.code}</span>
                        </div>
                      </td>
                      <td className="py-3 text-on-surface-variant">{l.native_name}</td>
                      <td className="py-3">
                        <Badge variant={l.is_active ? 'success' : 'outline'}>
                          {l.is_active ? t('admin1.bahasa.active') : t('admin1.bahasa.inactive')}
                        </Badge>
                      </td>
                      <td className="py-3 text-xs text-muted">
                        {l.created_at ? new Date(l.created_at).toLocaleDateString(LOCALE_MAP[lang] || 'en-US') : '-'}
                      </td>
                      <td className="py-3">
                        <div className="flex items-center gap-1">
                          <Button variant="ghost" size="sm" onClick={() => openEdit(l)}>
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="sm" onClick={() => toggleActive(l)}>
                            {l.is_active ? <X className="h-4 w-4 text-amber-400" /> : <Check className="h-4 w-4 text-emerald-400" />}
                          </Button>
                          <Button variant="ghost" size="sm" onClick={() => handleDelete(l.code)}>
                            <Trash2 className="h-4 w-4 text-red-400" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {filtered.length === 0 && (
                    <tr>
                      <td colSpan={6} className="py-12 text-center text-muted">{t('admin1.bahasa.noLanguages')}</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setShowModal(false)}>
          <div className="w-full max-w-md rounded-xl border border-border bg-surface p-6 shadow-lg" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-on-surface">{editing ? t('admin1.bahasa.editTitle') : t('admin1.bahasa.add')}</h2>
              <button onClick={() => setShowModal(false)}><X className="h-5 w-5 text-muted hover:text-on-surface" /></button>
            </div>
            <div className="space-y-4">
              <div>
                <Label>{t('admin1.bahasa.codeLabel')}</Label>
                <Input
                  placeholder={t('admin1.bahasa.codePlaceholder')}
                  value={form.code}
                  onChange={e => setForm({ ...form, code: e.target.value })}
                  disabled={!!editing}
                />
              </div>
              <div>
                <Label>{t('admin1.bahasa.nameEnLabel')}</Label>
                <Input
                  placeholder={t('admin1.bahasa.nameEnPlaceholder')}
                  value={form.name_en}
                  onChange={e => setForm({ ...form, name_en: e.target.value })}
                />
              </div>
              <div>
                <Label>{t('admin1.bahasa.nameLocalLabel')}</Label>
                <Input
                  placeholder={t('admin1.bahasa.nameLocalPlaceholder')}
                  value={form.name_id}
                  onChange={e => setForm({ ...form, name_id: e.target.value })}
                />
              </div>
              <div>
                <Label>{t('admin1.bahasa.nativeNameLabel')}</Label>
                <Input
                  placeholder={t('admin1.bahasa.nativeNamePlaceholder')}
                  value={form.native_name}
                  onChange={e => setForm({ ...form, native_name: e.target.value })}
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <Button variant="outline" onClick={() => setShowModal(false)}>{t('admin1.bahasa.cancel')}</Button>
                <Button onClick={handleSave} disabled={saving}>
                  {saving ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
                  {editing ? t('admin1.bahasa.update') : t('admin1.bahasa.create')}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
