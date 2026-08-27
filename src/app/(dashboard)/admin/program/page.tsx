'use client'

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase-client'
import { useI18n } from '@/lib/i18n/client'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Flag } from '@/components/ui/flag'
import { catalogDetailsToForm, catalogFormToDetails } from '@/lib/course-catalog'
import {
  Search, Plus, Loader2, Trash2, Pencil, ChevronLeft, ChevronRight, X, Globe, BookOpen
} from 'lucide-react'

const PER_PAGE = 10
const PROGRAM_TYPES = ['fast_track', 'regular', 'intensive'] as const
const PROGRAM_TIERS = ['basic', 'advance', 'expert'] as const

interface Language {
  code: string
  name: { en: string; id: string }
  native_name: string
  flag_emoji: string | null
  is_active: boolean
}

interface Program {
  id: string
  language_code: string | null
  slug: string
  name: { en: string; id: string }
  description: { en: string; id: string } | null
  program_type: string | null
  tier: string | null
  track_type: string | null
  details: Record<string, unknown> | null
  display_order: number | null
  passing_score: number | null
  attendance_weight: number | null
  quiz_weight: number | null
  exam_weight: number | null
  is_active: boolean | null
}

interface ProgramRow extends Program {
  languages: Pick<Language, 'name' | 'native_name' | 'flag_emoji'> | null
  subjects_count: number
}

type FormData = {
  language_code: string
  name_id: string
  name_en: string
  description_id: string
  description_en: string
  slug: string
  tier: string
  track_type: string
  topics_text: string
  projects_text: string
  certificates_text: string
  passing_score: string
  attendance_weight: string
  quiz_weight: string
  exam_weight: string
  is_active: boolean
}

const EMPTY_FORM: FormData = {
  language_code: '',
  name_id: '',
  name_en: '',
  description_id: '',
  description_en: '',
  slug: '',
  tier: 'basic',
  track_type: 'regular',
  topics_text: '',
  projects_text: '',
  certificates_text: '',
  passing_score: '',
  attendance_weight: '',
  quiz_weight: '',
  exam_weight: '',
  is_active: true,
}

export default function AdminProgramPage() {
  const supabase = createClient()
  const { t } = useI18n()

  const [programs, setPrograms] = useState<ProgramRow[]>([])
  const [languages, setLanguages] = useState<Language[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [langFilter, setLangFilter] = useState('all')
  const [page, setPage] = useState(0)
  const [total, setTotal] = useState(0)

  const [showModal, setShowModal] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<FormData>(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')

  const [deleteTarget, setDeleteTarget] = useState<ProgramRow | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState('')

  const fetchPrograms = useCallback(async () => {
    setLoading(true)
    try {
      let query = supabase
        .from('programs')
        .select('*, languages!left(name, native_name, flag_emoji)', { count: 'exact' })

      if (search.trim()) {
        query = query.or(
          'slug.ilike.%' + search + '%,name->>en.ilike.%' + search + '%,name->>id.ilike.%' + search + '%'
        )
      }
      if (langFilter !== 'all') {
        query = query.eq('language_code', langFilter)
      }

      const { data, count, error } = await query
        .order('display_order', { ascending: true, nullsFirst: false })
        .range(page * PER_PAGE, (page + 1) * PER_PAGE - 1)

      if (!error && data) {
        const rows = data as unknown as ProgramRow[]
        const rowsWithCounts = await Promise.all(
          rows.map(async (r) => {
            const { count: subjCount } = await supabase
              .from('courses')
              .select('*', { count: 'exact', head: true })
              .eq('program_id', r.id)
            return { ...r, subjects_count: subjCount ?? 0 }
          })
        )
        setPrograms(rowsWithCounts)
        setTotal(count ?? 0)
      }
    } catch (err) {
      console.error('Failed to fetch programs:', err)
      setPrograms([])
    }
    setLoading(false)
  }, [search, langFilter, page, supabase])

  const fetchLanguages = useCallback(async () => {
    try {
      const { data } = await supabase
        .from('languages')
        .select('code, name, native_name, flag_emoji, is_active')
        .order('sort_order', { ascending: true })
      if (data) setLanguages(data as Language[])
    } catch (err) {
      console.error('Failed to fetch languages:', err)
    }
  }, [supabase])

  useEffect(() => {
    fetchLanguages()
  }, [fetchLanguages])

  useEffect(() => {
    fetchPrograms()
  }, [fetchPrograms])

  useEffect(() => {
    setPage(0)
  }, [search, langFilter])

  function openCreateModal() {
    setEditingId(null)
    setForm(EMPTY_FORM)
    setSaveError('')
    setShowModal(true)
  }

  function openEditModal(program: ProgramRow) {
    setEditingId(program.id)
    setForm({
      language_code: program.language_code ?? '',
      name_id: program.name?.id ?? '',
      name_en: program.name?.en ?? '',
      description_id: program.description?.id ?? '',
      description_en: program.description?.en ?? '',
      slug: program.slug,
      tier: program.tier ?? 'basic',
      track_type: program.track_type ?? program.program_type ?? 'regular',
      ...catalogDetailsToForm(program.details),
      passing_score: program.passing_score?.toString() ?? '',
      attendance_weight: program.attendance_weight?.toString() ?? '',
      quiz_weight: program.quiz_weight?.toString() ?? '',
      exam_weight: program.exam_weight?.toString() ?? '',
      is_active: program.is_active ?? true,
    })
    setSaveError('')
    setShowModal(true)
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setSaveError('')

    const payload = {
      language_code: form.language_code || null,
      slug: form.slug,
      name: { id: form.name_id, en: form.name_en },
      description: { id: form.description_id, en: form.description_en },
      tier: form.tier || null,
      track_type: form.track_type || 'regular',
      details: catalogFormToDetails(form.topics_text, form.projects_text, form.certificates_text),
      passing_score: form.passing_score ? parseFloat(form.passing_score) : null,
      attendance_weight: form.attendance_weight ? parseFloat(form.attendance_weight) : null,
      quiz_weight: form.quiz_weight ? parseFloat(form.quiz_weight) : null,
      exam_weight: form.exam_weight ? parseFloat(form.exam_weight) : null,
      is_active: form.is_active,
    }

    if (editingId) {
      const { error } = await supabase.from('programs').update(payload).eq('id', editingId)
      if (error) { setSaveError(error.message); setSaving(false); return }
    } else {
      const { error } = await supabase.from('programs').insert(payload)
      if (error) { setSaveError(error.message); setSaving(false); return }
    }

    setShowModal(false)
    setSaving(false)
    fetchPrograms()
  }

  async function handleDelete() {
    if (!deleteTarget) return
    setDeleting(true)
    setDeleteError('')

    if (deleteTarget.subjects_count > 0) {
      setDeleteError(
        t('admin2.program.cannotDelete', { count: deleteTarget.subjects_count })
      )
      setDeleting(false)
      return
    }

    const { error } = await supabase.from('programs').delete().eq('id', deleteTarget.id)
    if (error) {
      setDeleteError(error.message)
      setDeleting(false)
      return
    }

    setDeleteTarget(null)
    setDeleting(false)
    fetchPrograms()
  }

  const totalPages = Math.ceil(total / PER_PAGE)

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-on-surface">{t('admin2.program.title')}</h1>
          <p className="text-on-surface-variant">{t('admin2.program.subtitle')}</p>
        </div>
        <Button size="sm" onClick={openCreateModal}>
          <Plus className="mr-1 h-4 w-4" /> {t('admin2.program.addBtn')}
        </Button>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-4 flex-wrap">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted" />
              <Input
                placeholder={t('admin2.program.searchPlaceholder')}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-10"
              />
            </div>
            <Select
              value={langFilter}
              onChange={(e) => setLangFilter(e.target.value)}
              className="w-40"
            >
              <option value="all">{t('admin2.program.allLanguages')}</option>
              {languages.map((l) => (
                <option key={l.code} value={l.code}>
                  {l.flag_emoji ? <Flag emoji={l.flag_emoji} className="h-3.5" /> : null} {l.name?.en ?? l.code}
                </option>
              ))}
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <LoadingSkeleton />
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-left text-xs text-muted uppercase">
                      <th className="pb-3 font-medium">{t('admin2.program.colLanguage')}</th>
                      <th className="pb-3 font-medium">{t('admin2.program.colName')}</th>
                      <th className="pb-3 font-medium">{t('admin2.program.colSlug')}</th>
                      <th className="pb-3 font-medium">{t('admin2.program.colType')}</th>
                      <th className="pb-3 font-medium">{t('admin2.program.colStatus')}</th>
                      <th className="pb-3 font-medium">{t('admin2.program.colCourses')}</th>
                      <th className="pb-3 font-medium">{t('admin2.program.colActions')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {programs.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="py-16 text-center text-muted">
                          <div className="flex flex-col items-center gap-2">
                            <Globe className="h-10 w-10 text-muted/50" />
                            <p>
                              {search || langFilter !== 'all'
                                ? t('admin2.program.noMatch')
                                : t('admin2.program.noPrograms')}
                            </p>
                            {!search && langFilter === 'all' && (
                              <Button size="sm" variant="outline" onClick={openCreateModal}>
                                <Plus className="mr-1 h-4 w-4" /> {t('admin2.program.createFirst')}
                              </Button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ) : (
                      programs.map((p) => {
                        const lang = languages.find((l) => l.code === p.language_code)
                        return (
                          <tr
                            key={p.id}
                            className="border-b border-border hover:bg-surface/50"
                          >
                            <td className="py-3">
                              <div className="flex items-center gap-2">
                                {lang?.flag_emoji ? <Flag emoji={lang.flag_emoji} className="h-4" /> : null}
                                <span className="text-on-surface-variant text-xs">
                                  {p.language_code?.toUpperCase() ?? '-'}
                                </span>
                              </div>
                            </td>
                            <td className="py-3">
                              <p className="font-medium text-on-surface">
                                {p.name?.id ?? p.name?.en ?? '-'}
                              </p>
                              <p className="text-xs text-muted">{p.name?.en ?? ''}</p>
                            </td>
                            <td className="py-3 text-on-surface-variant text-xs font-mono">
                              {p.slug}
                            </td>
                            <td className="py-3">
                              <Badge variant="ghost" size="sm">
                                {t(`common.track.${p.track_type ?? p.program_type ?? 'regular'}`)}
                              </Badge>
                            </td>
                            <td className="py-3">
                              <Badge
                                variant={p.is_active ? 'success' : 'destructive'}
                                size="sm"
                              >
                                {p.is_active ? t('admin2.program.active') : t('admin2.program.inactive')}
                              </Badge>
                            </td>
                            <td className="py-3">
                              <div className="flex items-center gap-1.5 text-on-surface-variant">
                                <BookOpen className="h-3.5 w-3.5" />
                                <span>{p.subjects_count}</span>
                              </div>
                            </td>
                            <td className="py-3">
                              <div className="flex items-center gap-1">
                                <Button
                                  variant="ghost"
                                  size="icon-sm"
                                  onClick={() => openEditModal(p)}
                                  title={t('admin2.program.editProgram')}
                                >
                                  <Pencil className="h-4 w-4" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon-sm"
                                  onClick={() => setDeleteTarget(p)}
                                  title={t('admin2.program.deleteProgram')}
                                >
                                  <Trash2 className="h-4 w-4 text-destructive" />
                                </Button>
                              </div>
                            </td>
                          </tr>
                        )
                      })
                    )}
                  </tbody>
                </table>
              </div>

              {totalPages > 1 && (
                <div className="flex flex-col items-center justify-between gap-3 pt-4 sm:flex-row">
                  <p className="text-xs text-muted">
                    {t('admin2.program.showing', { start: page * PER_PAGE + 1, end: Math.min((page + 1) * PER_PAGE, total), total })}
                  </p>
                  <div className="flex items-center gap-1 overflow-x-auto">
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={page === 0}
                      onClick={() => setPage((p) => p - 1)}
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </Button>
                    {Array.from({ length: totalPages }, (_, i) => (
                      <Button
                        key={i}
                        variant={i === page ? 'default' : 'ghost'}
                        size="sm"
                        className="w-8"
                        onClick={() => setPage(i)}
                      >
                        {i + 1}
                      </Button>
                    ))}
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={page >= totalPages - 1}
                      onClick={() => setPage((p) => p + 1)}
                    >
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-surface-container-lowest rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto p-6 mx-4">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-on-surface">
                {editingId ? t('admin2.program.editModalTitle') : t('admin2.program.addModalTitle')}
              </h2>
              <Button variant="ghost" size="sm" onClick={() => setShowModal(false)}>
                <X className="h-4 w-4" />
              </Button>
            </div>
            <form onSubmit={handleSave} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="language_code">{t('admin2.program.languageLabel')}</Label>
                  <Select
                    id="language_code"
                    value={form.language_code}
                    onChange={(e) => setForm((f) => ({ ...f, language_code: e.target.value }))}
                    required
                  >
                    <option value="">{t('admin2.program.selectLanguage')}</option>
                    {languages.map((l) => (
                      <option key={l.code} value={l.code}>
                        {l.flag_emoji ? <Flag emoji={l.flag_emoji} className="h-3.5" /> : null} {l.name?.en ?? l.code}
                      </option>
                    ))}
                  </Select>
                </div>
                <div>
                  <Label htmlFor="slug">{t('admin2.program.slugLabel')}</Label>
                  <Input
                    id="slug"
                    value={form.slug}
                    onChange={(e) => setForm((f) => ({ ...f, slug: e.target.value }))}
                    required
                    placeholder={t('admin2.program.slugPlaceholder')}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="name_id">{t('admin2.program.nameIdLabel')}</Label>
                  <Input
                    id="name_id"
                    value={form.name_id}
                    onChange={(e) => setForm((f) => ({ ...f, name_id: e.target.value }))}
                    required
                    placeholder={t('admin2.program.nameIdPlaceholder')}
                  />
                </div>
                <div>
                  <Label htmlFor="name_en">{t('admin2.program.nameEnLabel')}</Label>
                  <Input
                    id="name_en"
                    value={form.name_en}
                    onChange={(e) => setForm((f) => ({ ...f, name_en: e.target.value }))}
                    required
                    placeholder={t('admin2.program.nameEnPlaceholder')}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="description_id">{t('admin2.program.descIdLabel')}</Label>
                  <Input
                    id="description_id"
                    value={form.description_id}
                    onChange={(e) => setForm((f) => ({ ...f, description_id: e.target.value }))}
                    placeholder={t('admin2.program.descIdPlaceholder')}
                  />
                </div>
                <div>
                  <Label htmlFor="description_en">{t('admin2.program.descEnLabel')}</Label>
                  <Input
                    id="description_en"
                    value={form.description_en}
                    onChange={(e) => setForm((f) => ({ ...f, description_en: e.target.value }))}
                    placeholder={t('admin2.program.descEnPlaceholder')}
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <div>
                  <Label htmlFor="tier">{t('admin2.program.tierLabel')}</Label>
                  <Select
                    id="tier"
                    value={form.tier}
                    onChange={(e) => setForm((f) => ({ ...f, tier: e.target.value }))}
                  >
                    {PROGRAM_TIERS.map((tier) => <option key={tier} value={tier}>{t(`common.tier.${tier}`)}</option>)}
                  </Select>
                </div>
                <div>
                  <Label htmlFor="track_type">{t('admin2.program.trackLabel')}</Label>
                  <Select
                    id="track_type"
                    value={form.track_type}
                    onChange={(e) => setForm((f) => ({ ...f, track_type: e.target.value }))}
                  >
                    {PROGRAM_TYPES.map((track) => <option key={track} value={track}>{t(`common.track.${track}`)}</option>)}
                  </Select>
                </div>
                <div>
                  <Label htmlFor="passing_score">{t('admin2.program.passingScore')}</Label>
                  <Input
                    id="passing_score"
                    type="number"
                    min="0"
                    max="100"
                    value={form.passing_score}
                    onChange={(e) => setForm((f) => ({ ...f, passing_score: e.target.value }))}
                    placeholder="e.g. 70"
                  />
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-3">
                <div>
                  <Label htmlFor="topics_text">{t('admin2.program.topicsLabel')}</Label>
                  <Textarea id="topics_text" value={form.topics_text} onChange={(e) => setForm((f) => ({ ...f, topics_text: e.target.value }))} placeholder={t('admin2.program.topicsPlaceholder')} rows={5} />
                </div>
                <div>
                  <Label htmlFor="projects_text">{t('admin2.program.projectsLabel')}</Label>
                  <Textarea id="projects_text" value={form.projects_text} onChange={(e) => setForm((f) => ({ ...f, projects_text: e.target.value }))} placeholder={t('admin2.program.projectsPlaceholder')} rows={5} />
                </div>
                <div>
                  <Label htmlFor="certificates_text">{t('admin2.program.certificatesLabel')}</Label>
                  <Textarea id="certificates_text" value={form.certificates_text} onChange={(e) => setForm((f) => ({ ...f, certificates_text: e.target.value }))} placeholder={t('admin2.program.certificatesPlaceholder')} rows={5} />
                </div>
              </div>

              <div>
                <p className="text-sm font-medium text-on-surface mb-2">{t('admin2.program.gradeWeights')}</p>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                  <div>
                    <Label htmlFor="attendance_weight">{t('admin2.program.attendance')}</Label>
                    <Input
                      id="attendance_weight"
                      type="number"
                      min="0"
                      max="100"
                      value={form.attendance_weight}
                      onChange={(e) => setForm((f) => ({ ...f, attendance_weight: e.target.value }))}
                      placeholder="%"
                    />
                  </div>

                  <div>
                    <Label htmlFor="quiz_weight">{t('admin2.program.quiz')}</Label>
                    <Input
                      id="quiz_weight"
                      type="number"
                      min="0"
                      max="100"
                      value={form.quiz_weight}
                      onChange={(e) => setForm((f) => ({ ...f, quiz_weight: e.target.value }))}
                      placeholder="%"
                    />
                  </div>
                  <div>
                    <Label htmlFor="exam_weight">{t('admin2.program.exam')}</Label>
                    <Input
                      id="exam_weight"
                      type="number"
                      min="0"
                      max="100"
                      value={form.exam_weight}
                      onChange={(e) => setForm((f) => ({ ...f, exam_weight: e.target.value }))}
                      placeholder="%"
                    />
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <input
                  id="is_active"
                  type="checkbox"
                  checked={form.is_active}
                  onChange={(e) => setForm((f) => ({ ...f, is_active: e.target.checked }))}
                  className="h-4 w-4 rounded border-border text-primary focus:ring-primary"
                />
                <Label htmlFor="is_active" className="mb-0">
                  {t('admin2.program.active')}
                </Label>
              </div>

              {saveError && <p className="text-xs text-destructive">{saveError}</p>}

              <div className="flex justify-end gap-2 pt-2">
                <Button type="button" variant="outline" onClick={() => setShowModal(false)}>
                  {t('admin2.program.cancel')}
                </Button>
                <Button type="submit" disabled={saving}>
                  {saving ? (
                    <><Loader2 className="h-4 w-4 animate-spin mr-1" /> {t('admin2.program.saving')}</>
                  ) : editingId ? (
                    t('admin2.program.saveChanges')
                  ) : (
                    t('admin2.program.createProgram')
                  )}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-surface-container-lowest rounded-xl shadow-xl w-full max-w-sm p-6 mx-4">
            <h2 className="text-lg font-semibold text-on-surface mb-2">{t('admin2.program.deleteModalTitle')}</h2>
            <p className="text-sm text-on-surface-variant mb-4">
              {t('admin2.program.deleteConfirmBefore')}{' '}
              <strong>{deleteTarget.name?.id ?? deleteTarget.slug}</strong>?
              {' '}{t('admin2.program.deleteConfirmAfter')}
            </p>
            {deleteError && <p className="text-xs text-destructive mb-4">{deleteError}</p>}
            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                onClick={() => {
                  setDeleteTarget(null)
                  setDeleteError('')
                }}
              >
                {t('admin2.program.cancel')}
              </Button>
              <Button variant="destructive" onClick={handleDelete} disabled={deleting}>
                {deleting ? (
                  <><Loader2 className="h-4 w-4 animate-spin mr-1" /> {t('admin2.program.deleting')}</>
                ) : (
                  t('admin2.program.delete')
                )}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function LoadingSkeleton() {
  return (
    <div className="space-y-3 animate-pulse">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="flex items-center gap-4 py-3 border-b border-border">
          <div className="h-6 w-16 bg-surface-container-highest rounded" />
          <div className="flex-1 space-y-1">
            <div className="h-4 w-40 bg-surface-container-highest rounded" />
            <div className="h-3 w-24 bg-surface-container-highest rounded" />
          </div>
          <div className="h-4 w-24 bg-surface-container-highest rounded" />
          <div className="h-4 w-16 bg-surface-container-highest rounded" />
          <div className="h-5 w-14 bg-surface-container-highest rounded-full" />
          <div className="h-4 w-8 bg-surface-container-highest rounded" />
          <div className="flex gap-1">
            <div className="h-8 w-8 bg-surface-container-highest rounded" />
            <div className="h-8 w-8 bg-surface-container-highest rounded" />
          </div>
        </div>
      ))}
    </div>
  )
}
