'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase-client'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { useI18n } from '@/lib/i18n/client'
import { Plus, Pencil, Trash2, Search, X, Loader2 } from 'lucide-react'

interface PlacementQuestion {
  id: string
  test_id: string
  language_code: string
  question_type: string
  question_text: string
  passage_text: string
  audio_url: string
  options: string[]
  correct_answer: string
  difficulty_level: string
  created_at: string
}

interface Language {
  code: string
  name: { id: string; en: string }
  native_name: string
}

const DIFFICULTIES = ['basic', 'advance', 'expert']
const QUESTION_TYPES = [
  { value: 'grammar', labelKey: 'admin1.placement.typeGrammar', color: 'text-emerald-400' },
  { value: 'reading', labelKey: 'admin1.placement.typeReading', color: 'text-blue-400' },
  { value: 'listening', labelKey: 'admin1.placement.typeListening', color: 'text-purple-400' },
]

export default function AdminPlacementPage() {
  const { t } = useI18n()
  const supabase = createClient()
  const [questions, setQuestions] = useState<PlacementQuestion[]>([])
  const [languages, setLanguages] = useState<Language[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filterLang, setFilterLang] = useState('all')
  const [showModal, setShowModal] = useState(false)
  const [editing, setEditing] = useState<PlacementQuestion | null>(null)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({
    language_code: '',
    question_type: 'grammar',
    question_text: '',
    passage_text: '',
    audio_url: '',
    option0: '',
    option1: '',
    option2: '',
    option3: '',
    correct_answer: '0',
    difficulty_level: 'basic',
  })

  useEffect(() => {
    Promise.all([fetchQuestions(), fetchLanguages()])
  }, [])

  async function fetchQuestions() {
    setLoading(true)
    try {
      const { data } = await supabase.from('placement_questions_admin').select('*').order('created_at', { ascending: false })
      if (data) setQuestions(data as PlacementQuestion[])
    } catch (err) {
      console.error('Failed to fetch questions:', err)
    }
    setLoading(false)
  }

  async function fetchLanguages() {
    try {
      const { data } = await supabase.from('languages').select('code, name, native_name').eq('is_active', true).order('sort_order')
      if (data) setLanguages(data as Language[])
    } catch (err) {
      console.error('Failed to fetch languages:', err)
    }
  }

  function openAdd() {
    setEditing(null)
    setForm({
      language_code: languages[0]?.code || '',
      question_type: 'grammar',
      question_text: '',
      passage_text: '',
      audio_url: '',
      option0: '',
      option1: '',
      option2: '',
      option3: '',
      correct_answer: '0',
      difficulty_level: 'basic',
    })
    setShowModal(true)
  }

  function openEdit(q: PlacementQuestion) {
    setEditing(q)
    setForm({
      language_code: q.language_code,
      question_type: q.question_type || 'grammar',
      question_text: q.question_text,
      passage_text: q.passage_text || '',
      audio_url: q.audio_url || '',
      option0: q.options?.[0] || '',
      option1: q.options?.[1] || '',
      option2: q.options?.[2] || '',
      option3: q.options?.[3] || '',
      correct_answer: q.correct_answer || '0',
      difficulty_level: q.difficulty_level,
    })
    setShowModal(true)
  }

  async function handleSave() {
    if (form.question_type !== 'listening' && !form.question_text) return
    if (!form.language_code) return
    setSaving(true)

    try {
      // Ensure a placement_test exists for the selected language
      let testId: string | null = editing ? null : null

      if (!editing) {
        const { data: existingTest } = await supabase
          .from('placement_tests')
          .select('id')
          .eq('language_code', form.language_code)
          .eq('is_active', true)
          .maybeSingle()

        if (existingTest) {
          testId = existingTest.id
        } else {
          const { data: newTest, error: testError } = await supabase
            .from('placement_tests')
            .insert({
              language_code: form.language_code,
              title: `${form.language_code.toUpperCase()} Placement Test`,
              is_active: true,
            })
            .select('id')
            .single()

          if (testError) throw testError
          testId = newTest.id
        }
      }

      const payload: Record<string, any> = {
        language_code: form.language_code,
        question_type: form.question_type,
        question_text: form.question_text,
        options: [form.option0, form.option1, form.option2, form.option3],
        correct_answer: form.correct_answer,
        difficulty_level: form.difficulty_level,
      }

      // Type-specific fields
      if (form.question_type === 'reading') {
        payload.passage_text = form.passage_text
      }
      if (form.question_type === 'listening') {
        payload.audio_url = form.audio_url
      }

      if (editing) {
        const { error: updateError } = await supabase
          .from('placement_questions')
          .update(payload)
          .eq('id', editing.id)
        if (updateError) throw updateError
      } else {
        payload.test_id = testId
        const { error: insertError } = await supabase
          .from('placement_questions')
          .insert(payload)
        if (insertError) throw insertError
      }

      setSaving(false)
      setShowModal(false)
      fetchQuestions()
    } catch (err) {
      console.error('Failed to save question:', err)
      setSaving(false)
    }
  }

  async function handleDelete(id: string) {
    if (!confirm(t('admin1.placement.deleteConfirm'))) return
    const { error } = await supabase.from('placement_questions').delete().eq('id', id)
    if (error) {
      console.error('Failed to delete question:', error)
      return
    }
    fetchQuestions()
  }

  const filtered = questions.filter(q => {
    const matchSearch = q.question_text.toLowerCase().includes(search.toLowerCase())
    const matchLang = filterLang === 'all' || q.language_code === filterLang
    return matchSearch && matchLang
  })

  function getLangName(code: string) {
    const lang = languages.find(l => l.code === code)
    return lang?.name?.en || lang?.native_name || code
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-on-surface">{t('admin1.placement.title')}</h1>
          <p className="text-on-surface-variant">{t('admin1.placement.subtitle')}</p>
        </div>
        <Button size="sm" onClick={openAdd}><Plus className="mr-1 h-4 w-4" /> {t('admin1.placement.addQuestion')}</Button>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-4 flex-wrap">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted" />
              <Input
                placeholder={t('admin1.placement.searchPlaceholder')}
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="pl-10"
              />
            </div>
            <Select value={filterLang} onChange={e => setFilterLang(e.target.value)} className="w-40">
              <option value="all">{t('admin1.placement.allLanguages')}</option>
              {languages.map(l => (
                <option key={l.code} value={l.code}>{l.name?.en || l.native_name}</option>
              ))}
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-12 text-muted">
              <Loader2 className="h-5 w-5 animate-spin mr-2" /> {t('admin1.placement.loading')}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs text-muted uppercase">
                    <th className="pb-3 font-medium">{t('admin1.placement.colQuestion')}</th>
                    <th className="pb-3 font-medium">{t('admin1.placement.colType')}</th>
                    <th className="pb-3 font-medium">{t('admin1.placement.colLanguage')}</th>
                    <th className="pb-3 font-medium">{t('admin1.placement.colDifficulty')}</th>
                    <th className="pb-3 font-medium">{t('admin1.placement.colOptions')}</th>
                    <th className="pb-3 font-medium">{t('admin1.placement.colCorrect')}</th>
                    <th className="pb-3 font-medium">{t('admin1.placement.colActions')}</th>
                  </tr>
                </thead>
                <tbody>
                    {filtered.map(q => {
                      const qType = QUESTION_TYPES.find(t => t.value === q.question_type)
                      const correctIdx = parseInt(q.correct_answer, 10)
                      return (
                        <tr key={q.id} className="border-b border-border last:border-0">
                          <td className="py-3 max-w-xs">
                            <p className="text-on-surface truncate">{q.question_text || t('admin1.placement.audioQuestion')}</p>
                          </td>
                          <td className="py-3">
                            <span className={`text-xs font-medium ${qType?.color || 'text-muted'}`}>
                              {qType ? t(qType.labelKey as any) : q.question_type || 'grammar'}
                            </span>
                          </td>
                          <td className="py-3">
                            <Badge variant="default">{getLangName(q.language_code)}</Badge>
                          </td>                            <td className="py-3">
                              <Badge variant="outline">{t(`common.tier.${q.difficulty_level === 'advanced' ? 'advance' : q.difficulty_level || 'unknown'}`)}</Badge>
                            </td>

                          <td className="py-3">
                            <div className="flex flex-wrap gap-1">
                              {q.options?.map((opt, i) => (
                                <span key={i} className={`inline-block rounded-md px-2 py-0.5 text-xs border ${i === correctIdx ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400' : 'border-border text-on-surface-variant'}`}>
                                  {opt}
                                </span>
                              ))}
                            </div>
                          </td>
                          <td className="py-3 text-xs font-mono text-on-surface-variant">{q.correct_answer}</td>
                          <td className="py-3">
                            <div className="flex items-center gap-1">
                              <Button variant="ghost" size="sm" onClick={() => openEdit(q)}>
                                <Pencil className="h-4 w-4" />
                              </Button>
                              <Button variant="ghost" size="sm" onClick={() => handleDelete(q.id)}>
                                <Trash2 className="h-4 w-4 text-red-400" />
                              </Button>
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                  {filtered.length === 0 && (
                    <tr>
                      <td colSpan={7} className="py-12 text-center text-muted">{t('admin1.placement.noQuestions')}</td>
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
          <div className="w-full max-w-lg rounded-xl border border-border bg-surface p-6 shadow-lg max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-on-surface">{editing ? t('admin1.placement.editQuestion') : t('admin1.placement.addQuestion')}</h2>
              <button onClick={() => setShowModal(false)}><X className="h-5 w-5 text-muted hover:text-on-surface" /></button>
            </div>
            <div className="space-y-4">
              <div>
                <Label>{t('admin1.placement.languageLabel')}</Label>
                <Select value={form.language_code} onChange={e => setForm({ ...form, language_code: e.target.value })}>
                  <option value="">{t('admin1.placement.selectLanguage')}</option>
                  {languages.map(l => (
                    <option key={l.code} value={l.code}>{l.name?.en || l.native_name}</option>
                  ))}
                </Select>
              </div>

              {/* Question Type */}
              <div>
                <Label>{t('admin1.placement.questionTypeLabel')}</Label>
                <Select
                  value={form.question_type}
                  onChange={e => setForm({ ...form, question_type: e.target.value })}
                >
                  {QUESTION_TYPES.map(tp => (
                    <option key={tp.value} value={tp.value}>{t(tp.labelKey as any)}</option>
                  ))}
                </Select>
              </div>

              {/* Passage Text — only for reading */}
              {form.question_type === 'reading' && (
                <div>
                  <Label>{t('admin1.placement.readingPassageLabel')}</Label>
                  <Textarea
                    placeholder={t('admin1.placement.passagePlaceholder')}
                    value={form.passage_text}
                    onChange={e => setForm({ ...form, passage_text: e.target.value })}
                    rows={5}
                  />
                </div>
              )}

              {/* Audio URL — only for listening */}
              {form.question_type === 'listening' && (
                <div>
                  <Label>{t('admin1.placement.audioUrlLabel')}</Label>
                  <Input
                    placeholder={t('admin1.placement.audioUrlPlaceholder')}
                    value={form.audio_url}
                    onChange={e => setForm({ ...form, audio_url: e.target.value })}
                  />
                </div>
              )}

              {/* Question Text — hidden for listening (audio only) */}
              {form.question_type !== 'listening' && (
                <div>
                  <Label>{t('admin1.placement.questionTextLabel')}</Label>
                  <Textarea
                    placeholder={t('admin1.placement.questionTextPlaceholder')}
                    value={form.question_text}
                    onChange={e => setForm({ ...form, question_text: e.target.value })}
                  />
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                {[0, 1, 2, 3].map(i => (
                  <div key={i}>
                    <Label className={form.correct_answer === String(i) ? 'text-emerald-400' : ''}>
                      {t('admin1.placement.optionLabel', { number: i + 1 })} {form.correct_answer === String(i) ? t('admin1.placement.optionCorrect') : ''}
                    </Label>
                    <Input
                      placeholder={t('admin1.placement.optionLabel', { number: i + 1 })}
                      value={(form as any)[`option${i}`]}
                      onChange={e => setForm({ ...form, [`option${i}`]: e.target.value })}
                    />
                  </div>
                ))}
              </div>
              <div>
                <Label>{t('admin1.placement.correctAnswerLabel')}</Label>
                <Select
                  value={form.correct_answer}
                  onChange={e => setForm({ ...form, correct_answer: e.target.value })}
                >
                  <option value="0">{t('admin1.placement.optionLabel', { number: 1 })}</option>
                  <option value="1">{t('admin1.placement.optionLabel', { number: 2 })}</option>
                  <option value="2">{t('admin1.placement.optionLabel', { number: 3 })}</option>
                  <option value="3">{t('admin1.placement.optionLabel', { number: 4 })}</option>
                </Select>
              </div>
              <div>
                <Label>{t('admin1.placement.difficultyLabel')}</Label>
                <Select
                  value={form.difficulty_level}
                  onChange={e => setForm({ ...form, difficulty_level: e.target.value })}
                >
                  {DIFFICULTIES.map(d => (
                    <option key={d} value={d}>{t(`common.tier.${d}`)}</option>
                  ))}
                </Select>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <Button variant="outline" onClick={() => setShowModal(false)}>{t('admin1.placement.cancel')}</Button>
                <Button onClick={handleSave} disabled={saving}>
                  {saving ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
                  {editing ? t('admin1.placement.update') : t('admin1.placement.create')}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
