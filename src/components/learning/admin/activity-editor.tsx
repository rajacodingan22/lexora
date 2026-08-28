'use client'

import { useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase-client'
import { useI18n } from '@/lib/i18n/client'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { useAutosave, SaveIndicator } from '@/components/learning/admin/autosave'
import { defaultActivityContent } from '@/lib/learning'
import type { ActivityType, LessonActivity } from '@/types'
import { Loader2, Plus, X, Play } from 'lucide-react'

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <Label className="text-xs text-slate-500">{label}</Label>
      {children}
    </div>
  )
}

function ReadingEditor({ content, onChange }: { content: any; onChange: (c: any) => void }) {
  return (
    <div className="space-y-4">
      <Field label="Passage Text">
        <Textarea
          rows={10}
          value={content.text ?? ''}
          onChange={(e) => onChange({ ...content, text: e.target.value })}
          placeholder="Enter the reading passage here. The student will read this and write a summary in their own words..."
        />
      </Field>
      <Field label="Instructions (optional)">
        <Textarea
          rows={2}
          value={content.instructions ?? ''}
          onChange={(e) => onChange({ ...content, instructions: e.target.value })}
          placeholder="e.g. Read the passage carefully, then summarize it in your own words."
        />
      </Field>
    </div>
  )
}

function ListeningEditor({ content, onChange, t }: { content: any; onChange: (c: any) => void; t: (k: string) => string }) {
  const supabase = createClient()
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([])
  const [mode, setMode] = useState<'tts' | 'upload'>(content.audio_url ? 'upload' : 'tts')
  const [uploading, setUploading] = useState(false)

  useEffect(() => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return
    const load = () => setVoices(window.speechSynthesis.getVoices())
    load()
    window.speechSynthesis.addEventListener('voiceschanged', load)
    return () => window.speechSynthesis.removeEventListener('voiceschanged', load)
  }, [])

  async function handleAudioFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    try {
      const path = `tasks/audio/${crypto.randomUUID()}-${file.name}`
      const { error } = await supabase.storage.from('materials').upload(path, file)
      if (error) throw error
      const { data } = supabase.storage.from('materials').getPublicUrl(path)
      onChange({ ...content, audio_url: data.publicUrl, audio_text: null })
    } catch (err: any) {
      window.alert(err?.message || 'Upload failed')
    }
    setUploading(false)
  }

  function previewTts() {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return
    if (!content.audio_text?.trim()) return
    const u = new SpeechSynthesisUtterance(content.audio_text)
    const voice = voices.find((v) => v.name === content.voice)
    if (voice) u.voice = voice
    if (content.speed) u.rate = Number(content.speed)
    window.speechSynthesis.cancel()
    window.speechSynthesis.speak(u)
  }

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <Button type="button" size="sm" variant={mode === 'tts' ? 'default' : 'outline'} onClick={() => { setMode('tts'); onChange({ ...content, audio_url: null }) }}>
          {t('common.useTts')}
        </Button>
        <Button type="button" size="sm" variant={mode === 'upload' ? 'default' : 'outline'} onClick={() => { setMode('upload'); onChange({ ...content, audio_text: null }) }}>
          {t('common.useAudioUpload')}
        </Button>
      </div>

      {mode === 'tts' ? (
        <>
          <Field label="Audio Text (what the student will hear)">
            <Textarea rows={3} value={content.audio_text ?? ''} onChange={(e) => onChange({ ...content, audio_text: e.target.value })} />
          </Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Voice">
              <Select value={content.voice ?? ''} onChange={(e) => onChange({ ...content, voice: e.target.value })}>
                <option value="">{voices.length === 0 ? 'No voices available' : 'Default voice'}</option>
                {voices.map((v) => (
                  <option key={v.name} value={v.name}>{v.name} ({v.lang})</option>
                ))}
              </Select>
            </Field>
            <Field label="Speed">
              <Input
                type="number"
                min={0.5}
                max={2}
                step={0.1}
                value={content.speed ?? 1}
                onChange={(e) => onChange({ ...content, speed: Number(e.target.value) })}
              />
            </Field>
          </div>
          <Button type="button" size="sm" variant="outline" onClick={previewTts} disabled={!content.audio_text?.trim()}>
            <Play className="mr-1 h-3.5 w-3.5" /> {t('common.previewAudio')}
          </Button>
        </>
      ) : (
        <div className="flex flex-col gap-2">
          <Label className="text-xs">Audio File</Label>
          {content.audio_url ? (
            <div className="flex items-center gap-2">
              <audio controls src={content.audio_url} className="h-9 flex-1" />
              <Button type="button" size="sm" variant="ghost" className="text-red-600" onClick={() => onChange({ ...content, audio_url: null })}>
                <X className="h-4 w-4" />
              </Button>
            </div>
          ) : (
            <label className="flex cursor-pointer items-center justify-center rounded-lg border border-dashed border-slate-300 p-4 text-sm text-slate-500 hover:bg-slate-50">
              {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="mr-1 h-4 w-4" />}
              <input type="file" accept="audio/*" className="hidden" onChange={handleAudioFile} />
              {t('common.upload')}
            </label>
          )}
        </div>
      )}

      <Field label="Transcript (required for AI grading)">
        <Textarea
          rows={3}
          value={content.transcript ?? ''}
          onChange={(e) => onChange({ ...content, transcript: e.target.value || null })}
          placeholder={mode === 'upload' ? 'Type exactly what the audio says — AI uses this to grade students...' : 'Optional reference transcript...'}
        />
        {mode === 'upload' && !content.transcript?.trim() && (
          <p className="mt-1 text-xs text-amber-600">Required for AI grading. Type what the audio says.</p>
        )}
      </Field>

      <Field label="Instructions (optional)">
        <Textarea
          rows={2}
          value={content.instructions ?? ''}
          onChange={(e) => onChange({ ...content, instructions: e.target.value })}
          placeholder="e.g. Listen carefully, then explain what you heard in your own words."
        />
      </Field>
    </div>
  )
}

function ImageSpeakEditor({ content, onChange, t }: { content: any; onChange: (c: any) => void; t: (k: string) => string }) {
  const supabase = createClient()
  const [uploadingIdx, setUploadingIdx] = useState<number | null>(null)
  const images: string[] = Array.isArray(content.images) && content.images.length === 4 ? content.images : ['', '', '', '']

  async function handleImageUpload(e: React.ChangeEvent<HTMLInputElement>, idx: number) {
    const file = e.target.files?.[0]
    if (!file) return
    // Validasi tipe & size (maks 5MB)
    if (!file.type.startsWith('image/')) {
      window.alert('Hanya file gambar yang diperbolehkan')
      return
    }
    if (file.size > 5 * 1024 * 1024) {
      window.alert('Ukuran gambar maksimal 5MB')
      return
    }
    setUploadingIdx(idx)
    try {
      const ext = file.name.split('.').pop() || 'jpg'
      const path = `tasks/image_speak/${crypto.randomUUID()}.${ext}`
      const { error } = await supabase.storage.from('task-covers').upload(path, file, { contentType: file.type })
      if (error) throw error
      const { data } = supabase.storage.from('task-covers').getPublicUrl(path)
      const next = [...images]
      next[idx] = data.publicUrl
      onChange({ ...content, images: next })
    } catch (err: any) {
      window.alert(err?.message || 'Upload failed')
    }
    setUploadingIdx(null)
    // reset input value biar bisa upload file sama lagi
    e.target.value = ''
  }

  function removeImage(idx: number) {
    const next = [...images]
    next[idx] = ''
    onChange({ ...content, images: next })
  }

  return (
    <div className="space-y-4">
      <Field label="Prompt (kalimat yang diucapkan)">
        <Input
          value={content.prompt ?? ''}
          onChange={(e) => onChange({ ...content, prompt: e.target.value, expectedText: content.expectedText || e.target.value })}
          placeholder="The girl is running."
        />
      </Field>
      <Field label="Expected Text (untuk ASR, default sama dengan prompt)">
        <Input
          value={content.expectedText ?? content.prompt ?? ''}
          onChange={(e) => onChange({ ...content, expectedText: e.target.value })}
          placeholder="The girl is running."
        />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        {[0, 1, 2, 3].map((idx) => (
          <div key={idx} className="space-y-1 rounded-xl border border-slate-200 p-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold">Gambar {idx + 1}</span>
              <label className="flex items-center gap-1 text-xs cursor-pointer">
                <input
                  type="radio"
                  name="correctIndex"
                  checked={Number(content.correctIndex ?? 0) === idx}
                  onChange={() => onChange({ ...content, correctIndex: idx })}
                />
                Benar
              </label>
            </div>
            {images[idx] ? (
              <div className="space-y-2">
                <img src={images[idx]} alt={`Preview ${idx + 1}`} className="h-28 w-full rounded-lg object-cover border border-slate-200" />
                <Button type="button" size="sm" variant="ghost" className="w-full text-red-600" onClick={() => removeImage(idx)}>
                  Hapus & Ganti
                </Button>
              </div>
            ) : (
              <label className="flex cursor-pointer flex-col items-center justify-center rounded-lg border border-dashed border-slate-300 p-6 text-sm text-slate-500 hover:bg-slate-50 hover:border-indigo-300 transition-colors">
                {uploadingIdx === idx ? <Loader2 className="h-5 w-5 animate-spin text-indigo-500" /> : <Plus className="h-5 w-5 mb-1" />}
                <span className="text-xs">{uploadingIdx === idx ? 'Mengupload...' : 'Klik untuk Upload'}</span>
                <span className="text-[10px] text-slate-400 mt-1">PNG, JPG, WebP (maks 5MB)</span>
                <input type="file" accept="image/*" className="hidden" onChange={(e) => handleImageUpload(e, idx)} />
              </label>
            )}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Threshold (0.5-1.0, default 0.9)">
          <Input
            type="number"
            min={0.5}
            max={1}
            step={0.05}
            value={content.threshold ?? 0.9}
            onChange={(e) => onChange({ ...content, threshold: Number(e.target.value) })}
          />
        </Field>
        <Field label="Instructions (opsional)">
          <Input
            value={content.instructions ?? ''}
            onChange={(e) => onChange({ ...content, instructions: e.target.value })}
            placeholder="Pilih gambar yang benar lalu ucapkan kalimatnya"
          />
        </Field>
      </div>
      <p className="text-xs text-slate-500">Siswa: tap gambar → fullscreen ✓ jika benar → mic → warna per kata ≥90% baru lanjut. <span className="font-semibold text-amber-600">Hanya upload, tidak ada URL.</span></p>
    </div>
  )
}

function SpeakingReviewEditor({ content, onChange }: { content: any; onChange: (c: any) => void }) {
  return (
    <div className="space-y-4">
      <Field label="Teks yang Harus Dibaca *">
        <Textarea
          rows={4}
          value={content.text ?? ''}
          onChange={(e) => onChange({ ...content, text: e.target.value })}
          placeholder="The quick brown fox jumps over the lazy dog"
        />
      </Field>
      <div className="grid grid-cols-2 gap-4">
        <Field label="TTS Rate">
          <input
            type="range"
            min={0.5}
            max={1.5}
            step={0.1}
            value={content.rate ?? 0.9}
            onChange={(e) => onChange({ ...content, rate: Number(e.target.value) })}
            className="w-full"
          />
          <span className="text-xs text-slate-400">{content.rate ?? 0.9}x</span>
        </Field>
      </div>
      <Field label="Instructions (opsional)">
        <Input
          value={content.instructions ?? ''}
          onChange={(e) => onChange({ ...content, instructions: e.target.value })}
          placeholder="Baca teks dengan jelas dan natural"
        />
      </Field>
      <p className="text-xs text-slate-500">Siswa: lihat teks → dengarkan TTS referensi → rekam 1 kali → bandingkan waveform → kirim untuk review guru. <span className="font-semibold text-amber-600">Hanya bisa rekam 1 kali.</span></p>
    </div>
  )
}

export function ActivityEditorModal({
  open,
  activity,
  content,
  onSave,
  onClose,
  title,
}: {
  open: boolean
  activity: LessonActivity
  content: Record<string, unknown>
  onSave: (patch: { activity: Partial<LessonActivity>; content: Record<string, unknown> }) => Promise<void>
  onClose: () => void
  title: string
}) {
  const { t } = useI18n()
  const [draft, setDraft] = useState<Record<string, unknown>>(content)
  const [actForm, setActForm] = useState<Partial<LessonActivity>>({ title: activity.title, instruction: activity.instruction ?? '' })
  const [saving, setSaving] = useState(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')

  useEffect(() => {
    if (open) {
      setDraft(content)
      setActForm({ title: activity.title, instruction: activity.instruction ?? '' })
      setSaveStatus('idle')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, activity.id])

  useEffect(() => {
    if (!open) return
    if (timerRef.current) clearTimeout(timerRef.current)
    setSaveStatus('saving')
    timerRef.current = setTimeout(async () => {
      try {
        await onSave({ activity: actForm, content: draft })
        setSaveStatus('saved')
        setTimeout(() => setSaveStatus('idle'), 2000)
      } catch {
        setSaveStatus('error')
      }
    }, 800)
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft, actForm, open])

  if (!open) return null

  function renderEditor() {
    const props = { content: draft, onChange: setDraft, t }
    switch (activity.activity_type) {
      case 'reading': return <ReadingEditor {...props} />
      case 'listening': return <ListeningEditor {...props} />
      case 'image_speak': return <ImageSpeakEditor {...props} />
      case 'speaking_review': return <SpeakingReviewEditor {...props} />
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/40 p-4">
      <div className="mt-8 w-full max-w-3xl rounded-2xl bg-white shadow-xl">
        <div className="flex items-center justify-between rounded-t-2xl border-b border-slate-200 px-5 py-3">
          <div>
            <p className="text-sm font-semibold text-slate-900">{title}</p>
            <p className="text-xs text-slate-500">{activity.activity_type}</p>
          </div>
          <div className="flex items-center gap-2">
            <SaveIndicator status={saveStatus} />
            {saveStatus === 'error' && (
              <Button size="sm" variant="outline" onClick={() => {}}>{t('builder.retry')}</Button>
            )}
            <Button size="sm" variant="ghost" onClick={onClose}>
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>
        <div className="max-h-[70vh] space-y-4 overflow-y-auto p-5">
          <div className="grid grid-cols-2 gap-3">
            <Field label={t('builder.activityTitle')}>
              <Input value={actForm.title ?? ''} onChange={(e) => setActForm({ ...actForm, title: e.target.value })} />
            </Field>
            <Field label={t('builder.instruction')}>
              <Input value={actForm.instruction ?? ''} onChange={(e) => setActForm({ ...actForm, instruction: e.target.value })} />
            </Field>
          </div>
          {renderEditor()}
        </div>
        <div className="flex items-center justify-between rounded-b-2xl border-t border-slate-200 px-5 py-3">
          <Badge variant="outline">{activity.status}</Badge>
          <Button
            disabled={saving}
            onClick={async () => {
              setSaving(true)
              try {
                await onSave({ activity: actForm, content: draft })
              } finally {
                setSaving(false)
              }
            }}
          >
            {saving ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null}
            {t('common.save')}
          </Button>
        </div>
      </div>
    </div>
  )
}

export function defaultContentFor(type: ActivityType): Record<string, unknown> {
  return defaultActivityContent(type) as unknown as Record<string, unknown>
}
