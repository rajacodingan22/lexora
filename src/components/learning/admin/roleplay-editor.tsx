'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase-client'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { ImageUpload } from '@/components/ui/image-upload'
import { validateScriptTurns } from '@/lib/text-similarity'
import type { DialogQuiz, DialogScript, DialogScriptCharacter, DialogScriptTurn } from '@/types'
import { Plus, Trash2, Loader2, ChevronUp, ChevronDown, Eye, EyeOff, Save } from 'lucide-react'

interface Props {
  taskId: string
  courseId: string
}

function newCharId(name: string, existing: string[]): string {
  const base = name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'tokoh'
  let id = base
  let n = 2
  while (existing.includes(id)) id = `${base}-${n++}`
  return id
}

function QuizEditor({ quiz, courseId, onChange }: { quiz: DialogQuiz; courseId: string; onChange: (q: DialogQuiz) => void }) {
  return (
    <div className="mt-2 space-y-2">
      <Label className="text-xs">Gambar pilihan ({quiz.images.length})</Label>
      {quiz.images.map((img, i) => (
        <div key={i} className="flex items-center gap-2">
          {img.url ? (
            <img src={img.url} alt="" className="h-12 w-16 rounded-md border border-border object-cover" />
          ) : (
            <span className="flex h-12 w-16 items-center justify-center rounded-md border border-border text-[10px] text-muted">kosong</span>
          )}
          <Input
            value={img.caption} onChange={(e) => onChange({ ...quiz, images: quiz.images.map((x, j) => (j === i ? { ...x, caption: e.target.value } : x)) })}
            placeholder={`Caption gambar ${i + 1}`} className="flex-1"
          />
          <Button size="sm" variant="ghost" onClick={() => onChange({ ...quiz, images: quiz.images.filter((_, j) => j !== i) })} aria-label="Hapus gambar">
            <Trash2 className="h-4 w-4 text-destructive" />
          </Button>
        </div>
      ))}
      <ImageUpload
        value="" onUpload={(url) => onChange({ ...quiz, images: [...quiz.images, { url, caption: '' }] })} onRemove={() => {}}
        bucket="materials" pathPrefix={`tasks/${courseId}/roleplay`}
      />
      <Label className="text-xs">Opsi jawaban (radio = benar)</Label>
      {quiz.options.map((opt, i) => (
        <div key={i} className="flex items-center gap-2">
          <input
            type="radio" name={`correct-${quiz.images.length}-${opt}`} checked={quiz.correctIndex === i}
            onChange={() => onChange({ ...quiz, correctIndex: i })}
            aria-label={`Opsi ${i + 1} benar`} className="h-4 w-4"
          />
          <Input
            value={opt} onChange={(e) => onChange({ ...quiz, options: quiz.options.map((o, j) => (j === i ? e.target.value : o)) })}
            placeholder={`Opsi ${i + 1}`} className="flex-1"
          />
          {quiz.options.length > 2 && (
            <Button size="sm" variant="ghost" onClick={() => onChange({ ...quiz, options: quiz.options.filter((_, j) => j !== i), correctIndex: Math.min(quiz.correctIndex, quiz.options.length - 2) })} aria-label="Hapus opsi">
              <Trash2 className="h-4 w-4 text-destructive" />
            </Button>
          )}
        </div>
      ))}
      <Button size="sm" variant="outline" onClick={() => onChange({ ...quiz, options: [...quiz.options, ''] })}><Plus className="mr-1 h-3.5 w-3.5" /> Opsi</Button>
    </div>
  )
}

export function RoleplayEditor({ taskId, courseId }: Props) {
  const supabase = useMemo(() => createClient(), [])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saveMsg, setSaveMsg] = useState<string | null>(null)
  const [preview, setPreview] = useState(false)

  const [title, setTitle] = useState('')
  const [sceneImage, setSceneImage] = useState('')
  const [settingDesc, setSettingDesc] = useState('')
  const [characters, setCharacters] = useState<DialogScriptCharacter[]>([])
  const [studentChar, setStudentChar] = useState('')
  const [scriptStatus, setScriptStatus] = useState<'draft' | 'published'>('draft')
  const [turns, setTurns] = useState<(DialogScriptTurn & { _key: string })[]>([])

  const [newCharName, setNewCharName] = useState('')
  const [newCharRole, setNewCharRole] = useState('')

  const fetchAll = useCallback(async () => {
    setLoading(true)
    try {
      const { data: script } = await supabase.from('dialog_scripts').select('*').eq('task_id', taskId).maybeSingle()
      const s = script as DialogScript | null
      if (s) {
        setTitle(s.title || '')
        setSceneImage(s.scene_image_url || '')
        setSettingDesc(s.setting_desc || '')
        setCharacters(Array.isArray(s.characters) ? s.characters : [])
        setStudentChar(s.student_character_id || '')
        setScriptStatus(s.status)
        const { data: tData } = await supabase
          .from('dialog_script_turns')
          .select('*')
          .eq('script_id', s.id)
          .order('turn_number', { ascending: true })
        setTurns(((tData ?? []) as DialogScriptTurn[]).map((t) => ({ ...t, _key: t.id })))
      }
    } catch (e) {
      console.error('Failed to load roleplay script', e)
    }
    setLoading(false)
  }, [supabase, taskId])

  useEffect(() => { fetchAll() }, [fetchAll])

  const charName = useCallback((id: string) => characters.find((c) => c.id === id)?.name || id || '—', [characters])

  function addCharacter() {
    if (!newCharName.trim()) return
    const id = newCharId(newCharName, characters.map((c) => c.id))
    setCharacters((prev) => [...prev, { id, name: newCharName.trim(), role: newCharRole.trim() || null, voice: null }])
    if (characters.length === 0) setStudentChar(id)
    setNewCharName('')
    setNewCharRole('')
  }

  function removeCharacter(id: string) {
    setCharacters((prev) => prev.filter((c) => c.id !== id))
    if (studentChar === id) setStudentChar('')
  }

  function addTurn() {
    setTurns((prev) => [...prev, {
      id: '', script_id: '', turn_number: prev.length + 1, reader: studentChar || characters[0]?.id || '',
      text: '', image_url: null, keywords: [], quiz: null, created_at: '', _key: `new-${Date.now()}-${prev.length}`,
    }])
  }

  function patchTurn(key: string, patch: Partial<DialogScriptTurn>) {
    setTurns((prev) => prev.map((x) => (x._key === key ? { ...x, ...patch } : x)))
  }

  function moveTurn(idx: number, dir: -1 | 1) {
    setTurns((prev) => {
      const next = [...prev]
      const j = idx + dir
      if (j < 0 || j >= next.length) return prev
      ;[next[idx], next[j]] = [next[j], next[idx]]
      return next.map((t, i) => ({ ...t, turn_number: i + 1 }))
    })
  }

  const errors = useMemo(
    () => validateScriptTurns(
      turns.map((t) => ({ reader: t.reader, text: t.text, image_url: t.image_url, quiz: t.quiz ?? null })),
      studentChar || null,
    ),
    [turns, studentChar],
  )

  async function save(mode: 'draft' | 'publish') {
    const publish = mode === 'publish'
    setSaving(true)
    setSaveMsg(null)
    try {
      const errs = validateScriptTurns(
        turns.map((t) => ({ reader: t.reader, text: t.text, image_url: t.image_url, quiz: t.quiz ?? null })),
        studentChar || null,
      )
      if (publish && errs.length > 0) throw new Error(errs[0])
      const status = publish ? 'published' : 'draft'
      let scriptId: string
      const { data: existing } = await supabase.from('dialog_scripts').select('id').eq('task_id', taskId).maybeSingle()
      if (existing) {
        scriptId = existing.id
        const { error } = await supabase.from('dialog_scripts').update({
          title, scene_image_url: sceneImage || null, setting_desc: settingDesc || null,
          characters, student_character_id: studentChar || null, status,
        }).eq('id', scriptId)
        if (error) throw error
        await supabase.from('dialog_script_turns').delete().eq('script_id', scriptId)
      } else {
        const { data, error } = await supabase.from('dialog_scripts').insert({
          task_id: taskId, title, scene_image_url: sceneImage || null, setting_desc: settingDesc || null,
          characters, student_character_id: studentChar || null, status,
        }).select('id').single()
        if (error || !data) throw error || new Error('Gagal membuat naskah')
        scriptId = data.id
      }
      if (turns.length > 0) {
        const rows = turns.map((t, i) => ({
          script_id: scriptId,
          turn_number: i + 1,
          reader: t.reader,
          text: t.text,
          image_url: t.image_url || null,
          keywords: t.keywords ?? [],
          quiz: t.quiz ?? null,
        }))
        const { error } = await supabase.from('dialog_script_turns').insert(rows)
        if (error) throw error
      }
      setScriptStatus(status)
      setSaveMsg(publish ? 'Naskah dipublish.' : 'Tersimpan sebagai draft.')
      fetchAll()
    } catch (e) {
      setSaveMsg(e instanceof Error ? e.message : 'Gagal menyimpan')
    }
    setSaving(false)
  }

  if (loading) {
    return <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-muted" /></div>
  }

  return (
    <div className="space-y-4 border-t border-border pt-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h4 className="font-semibold text-on-surface">Naskah Roleplay + Casting</h4>
        <div className="flex items-center gap-2">
          <Badge variant={scriptStatus === 'published' ? 'success' : 'outline'}>
            {scriptStatus === 'published' ? 'Published' : 'Draft'}
          </Badge>
          <Button size="sm" variant="outline" onClick={() => setPreview((p) => !p)}>
            {preview ? <EyeOff className="mr-1 h-3.5 w-3.5" /> : <Eye className="mr-1 h-3.5 w-3.5" />}
            {preview ? 'Tutup Preview' : 'Preview'}
          </Button>
        </div>
      </div>

      {preview ? (
        <Card><CardContent className="space-y-3 p-5">
          {sceneImage && <img src={sceneImage} alt="" className="max-h-48 w-full rounded-xl border border-border object-cover" />}
          {settingDesc && <p className="text-sm italic text-on-surface-variant">{settingDesc}</p>}
          <div className="flex gap-2 overflow-x-auto pb-1">
            {turns.map((t, i) => (
              <div key={t._key} className="w-28 shrink-0">
                {t.image_url ? (
                  <img src={t.image_url} alt="" className="h-20 w-28 rounded-lg border border-border object-cover" />
                ) : (
                  <div className="flex h-20 w-28 items-center justify-center rounded-lg border border-border text-[10px] text-muted">tanpa gambar</div>
                )}
                <p className="mt-1 truncate text-[11px] text-on-surface-variant">{i + 1}. {t.text || '—'}</p>
              </div>
            ))}
          </div>
          <ol className="space-y-2">
            {turns.length === 0 && <p className="text-sm text-muted">Belum ada baris.</p>}
            {turns.map((t, i) => {
              const mine = t.reader === studentChar
              return (
                <li key={t._key} className={`rounded-xl border p-3 text-sm ${mine ? 'border-primary bg-primary-soft/40' : 'border-border bg-surface-container-low'}`}>
                  <p className="ed-mono text-[11px] font-bold uppercase tracking-widest text-muted">
                    {i + 1}. {charName(t.reader)}{mine ? ' (murid)' : ''}
                  </p>
                  <p className="mt-1 text-on-surface">{t.text || <span className="text-muted">— kosong —</span>}</p>
                  {t.image_url && <img src={t.image_url} alt="" className="mt-2 max-h-32 rounded-lg border border-border object-cover" />}
                </li>
              )
            })}
          </ol>
        </CardContent></Card>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-1">
              <Label className="text-xs">Judul naskah</Label>
              <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="misal: At the Restaurant" />
            </div>
            <div className="flex flex-col gap-1">
              <Label className="text-xs">Murid bermain sebagai</Label>
              <select value={studentChar} onChange={(e) => setStudentChar(e.target.value)} className="rounded-lg border border-border bg-background px-3 py-2 text-sm">
                <option value="">— pilih tokoh —</option>
                {characters.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
          </div>
          <div className="flex flex-col gap-1">
            <Label className="text-xs">Deskripsi setting (dibaca murid sebelum mulai)</Label>
            <Textarea rows={2} value={settingDesc} onChange={(e) => setSettingDesc(e.target.value)} placeholder="Malam hari di restoran... pelayan menyambut..." />
          </div>
          <div className="flex flex-col gap-1">
            <Label className="text-xs">Gambar scene</Label>
            <ImageUpload value={sceneImage} onUpload={setSceneImage} onRemove={() => setSceneImage('')} bucket="materials" pathPrefix={`tasks/${courseId}/roleplay`} />
          </div>

          <div className="space-y-2">
            <Label className="text-xs">Tokoh ({characters.length})</Label>
            {characters.map((c) => (
              <div key={c.id} className="flex flex-wrap items-center gap-2 rounded-xl border border-border p-2.5">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold">{c.name}</p>
                  <p className="ed-mono text-[11px] text-muted">{c.id}{c.role ? ` · ${c.role}` : ''}</p>
                </div>
                <Input
                  value={c.voice || ''} onChange={(e) => setCharacters((prev) => prev.map((x) => x.id === c.id ? { ...x, voice: e.target.value || null } : x))}
                  placeholder="Voice URI (opsional)" className="w-44"
                />
                <Button size="sm" variant="ghost" onClick={() => removeCharacter(c.id)} aria-label={`Hapus ${c.name}`}>
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </div>
            ))}
            <div className="flex flex-wrap gap-2">
              <Input value={newCharName} onChange={(e) => setNewCharName(e.target.value)} placeholder="Nama tokoh baru" className="w-44" />
              <Input value={newCharRole} onChange={(e) => setNewCharRole(e.target.value)} placeholder="Peran (opsional)" className="w-44" />
              <Button size="sm" variant="outline" onClick={addCharacter}><Plus className="mr-1 h-3.5 w-3.5" /> Tokoh</Button>
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs">Baris naskah ({turns.length}) — urutan = urutan baca</Label>
              <Button size="sm" variant="outline" onClick={addTurn}><Plus className="mr-1 h-3.5 w-3.5" /> Baris</Button>
            </div>
            {turns.map((t, i) => (
              <div key={t._key} className={`space-y-2 rounded-xl border p-3 ${t.reader === studentChar && studentChar ? 'border-primary' : 'border-border'}`}>
                <div className="flex items-center gap-2">
                  <span className="ed-mono text-xs font-bold text-muted">{i + 1}</span>
                  <select
                    value={t.reader}
                    onChange={(e) => setTurns((prev) => prev.map((x) => x._key === t._key ? { ...x, reader: e.target.value } : x))}
                    className="flex-1 rounded-lg border border-border bg-background px-2 py-1.5 text-sm"
                    aria-label={`Dibaca oleh (baris ${i + 1})`}
                  >
                    <option value="">— dibaca oleh —</option>
                    {characters.map((c) => <option key={c.id} value={c.id}>{c.name}{c.id === studentChar ? ' (murid)' : ''}</option>)}
                  </select>
                  <Button size="sm" variant="ghost" onClick={() => moveTurn(i, -1)} disabled={i === 0} aria-label="Naik"><ChevronUp className="h-4 w-4" /></Button>
                  <Button size="sm" variant="ghost" onClick={() => moveTurn(i, 1)} disabled={i === turns.length - 1} aria-label="Turun"><ChevronDown className="h-4 w-4" /></Button>
                  <Button size="sm" variant="ghost" onClick={() => setTurns((prev) => prev.filter((x) => x._key !== t._key).map((x, j) => ({ ...x, turn_number: j + 1 })))} aria-label="Hapus baris">
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
                <Textarea
                  rows={2} value={t.text}
                  onChange={(e) => setTurns((prev) => prev.map((x) => x._key === t._key ? { ...x, text: e.target.value } : x))}
                  placeholder={t.reader === studentChar && studentChar ? 'Teks harapan — yang wajib dibaca murid' : 'Kalimat yang dibacakan sistem'}
                />
                {t.reader === studentChar && studentChar !== '' && (
                  <Input
                    value={(t.keywords ?? []).join(', ')}
                    onChange={(e) => setTurns((prev) => prev.map((x) => x._key === t._key ? { ...x, keywords: e.target.value.split(',').map((k) => k.trim()).filter(Boolean) } : x))}
                    placeholder="Keywords (opsional, pisah koma)"
                  />
                )}
                <ImageUpload
                  value={t.image_url || ''}
                  onUpload={(url) => patchTurn(t._key, { image_url: url })}
                  onRemove={() => patchTurn(t._key, { image_url: null })}
                  bucket="materials" pathPrefix={`tasks/${courseId}/roleplay`}
                />
                <div className="rounded-lg border border-dashed border-border p-2.5">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs">Kunci pilihan (fase pilih sebelum baca)</Label>
                    {t.quiz ? (
                      <Button size="sm" variant="ghost" onClick={() => patchTurn(t._key, { quiz: null })}>Hapus kunci</Button>
                    ) : (
                      <Button size="sm" variant="outline" onClick={() => patchTurn(t._key, { quiz: { images: [], options: ['', ''], correctIndex: 0 } })}>+ Kunci pilihan</Button>
                    )}
                  </div>
                  {t.quiz && (
                    <QuizEditor
                      quiz={t.quiz}
                      courseId={courseId}
                      onChange={(quiz) => patchTurn(t._key, { quiz })}
                    />
                  )}
                </div>
              </div>
            ))}
          </div>

          {errors.length > 0 && (
            <ul className="space-y-1 rounded-xl border border-amber-500/30 bg-amber-500/5 p-3 text-xs text-amber-500">
              {errors.map((e, i) => <li key={i}>• {e}</li>)}
            </ul>
          )}

          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" variant="outline" disabled={saving} onClick={() => save('draft')}>
              {saving ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Save className="mr-1 h-3.5 w-3.5" />}
              Simpan Draft
            </Button>
            <Button size="sm" disabled={saving} onClick={() => save('publish')}>Publish Naskah</Button>
            {saveMsg && <span className="text-xs text-on-surface-variant">{saveMsg}</span>}
          </div>
          <p className="text-[11px] text-muted">Catatan: tombol di atas tidak memakai autosave — klik Simpan/Publish agar tersimpan.</p>
        </>
      )}
    </div>
  )
}
