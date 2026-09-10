'use client'

import { useEffect, useState } from 'react'
import dynamic from 'next/dynamic'
import { Button } from '@/components/ui/button'
import { Loader2, Clock, CheckCircle2, MessageSquare, X, Send } from 'lucide-react'
import { createClient } from '@/lib/supabase-client'

const WaveformPlayer = dynamic(() => import('@/components/shared/waveform-player').then((m) => ({ default: m.WaveformPlayer })), { ssr: false })

interface AttemptTurn {
  turn_id: string
  transcript: string
  similarity: number
  drive_file_id: string | null
  drive_link: string | null
}

interface Attempt {
  id: string
  student_name: string
  task_title: string
  script_id: string
  turns: AttemptTurn[]
  auto_score: number | null
  status: string
  overall_score: number | null
  created_at: string
  score_pronunciation?: number | null
  score_fluency?: number | null
  score_confidence?: number | null
  score_comprehension?: number | null
  teacher_feedback?: string | null
}

interface ScriptTurn {
  id: string
  turn_number: number
  text: string
}

const ASPECTS = [
  { key: 'pronunciation', label: 'Pronunciation' },
  { key: 'fluency', label: 'Kelancaran' },
  { key: 'confidence', label: 'Confidence' },
  { key: 'comprehension', label: 'Comprehension' },
] as const

export function RoleplayReviewQueue() {
  const [submissions, setSubmissions] = useState<Attempt[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<'pending' | 'reviewed' | 'all'>('pending')
  const [selected, setSelected] = useState<Attempt | null>(null)
  const [expectedMap, setExpectedMap] = useState<Record<string, string>>({})
  const [scores, setScores] = useState<Record<string, number>>({ pronunciation: 75, fluency: 75, confidence: 75, comprehension: 75 })
  const [feedback, setFeedback] = useState('')
  const [submitting, setSubmitting] = useState(false)

  async function fetchQueue() {
    setLoading(true)
    try {
      const res = await fetch(`/api/dialog/queue?status=${filter}`)
      const data = await res.json()
      setSubmissions(data.submissions || [])
    } catch (e) {
      console.error('Failed to fetch roleplay queue', e)
    }
    setLoading(false)
  }

  useEffect(() => { fetchQueue() }, [filter])

  async function openDetail(s: Attempt) {
    setSelected(s)
    setScores({
      pronunciation: s.score_pronunciation ?? 75,
      fluency: s.score_fluency ?? 75,
      confidence: s.score_confidence ?? 75,
      comprehension: s.score_comprehension ?? 75,
    })
    setFeedback(s.teacher_feedback || '')
    try {
      const supabase = createClient()
      const { data } = await supabase.from('dialog_script_turns').select('id, turn_number, text').eq('script_id', s.script_id).order('turn_number', { ascending: true })
      const map: Record<string, string> = {}
      for (const t of (data ?? []) as ScriptTurn[]) map[t.id] = t.text
      setExpectedMap(map)
    } catch { setExpectedMap({}) }
  }

  async function handleReview() {
    if (!selected) return
    setSubmitting(true)
    try {
      await fetch(`/api/dialog/attempt/${selected.id}/review`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          scorePronunciation: scores.pronunciation,
          scoreFluency: scores.fluency,
          scoreConfidence: scores.confidence,
          scoreComprehension: scores.comprehension,
          teacherFeedback: feedback,
        }),
      })
      setSelected(null)
      fetchQueue()
    } catch (e) {
      console.error('Failed to submit roleplay review', e)
    }
    setSubmitting(false)
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-on-surface">Roleplay Review Queue</h2>
        <div className="flex gap-1">
          {(['pending', 'reviewed', 'all'] as const).map((s) => (
            <button
              key={s}
              onClick={() => setFilter(s)}
              className={`rounded-lg px-3 py-1 text-xs font-medium transition-colors ${
                filter === s ? 'bg-indigo-600 text-white' : 'bg-surface-container-low text-slate-600 hover:bg-slate-200'
              }`}
            >
              {s === 'pending' ? 'Menunggu' : s === 'reviewed' ? 'Selesai' : 'Semua'}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-muted" /></div>
      ) : submissions.length === 0 ? (
        <div className="rounded-xl bg-surface-container-low py-8 text-center">
          <MessageSquare className="mx-auto mb-2 h-8 w-8 text-muted/40" />
          <p className="text-sm text-muted">{filter === 'pending' ? 'Tidak ada roleplay menunggu.' : 'Tidak ada data.'}</p>
        </div>
      ) : (
        <div className="space-y-2">
          {submissions.map((s) => (
            <div
              key={s.id}
              className="flex cursor-pointer items-center justify-between rounded-xl border border-border bg-surface p-3 transition-shadow hover:shadow-sm"
              onClick={() => openDetail(s)}
            >
              <div className="flex min-w-0 items-center gap-3">
                <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${s.status === 'reviewed' ? 'bg-emerald-100' : 'bg-amber-100'}`}>
                  {s.status === 'reviewed' ? <CheckCircle2 className="h-4 w-4 text-emerald-600" /> : <Clock className="h-4 w-4 text-amber-600" />}
                </div>
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-on-surface">{s.student_name}</p>
                  <p className="truncate text-xs text-muted">{s.task_title} · {s.turns?.length ?? 0} baris · auto {s.auto_score ?? '-'}</p>
                </div>
              </div>
              {s.overall_score != null && <span className="text-sm font-bold text-on-surface">{Math.round(s.overall_score)}</span>}
            </div>
          ))}
        </div>
      )}

      {selected && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="max-h-[90vh] w-full max-w-2xl space-y-4 overflow-y-auto rounded-2xl bg-slate-800 p-6 shadow-2xl">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold text-white">Roleplay: {selected.student_name}</h3>
              <button onClick={() => setSelected(null)} className="text-white/40 hover:text-white"><X className="h-5 w-5" /></button>
            </div>

            <div className="space-y-3">
              {(selected.turns ?? []).map((t, i) => (
                <div key={t.turn_id} className="rounded-xl bg-white/5 p-3">
                  <p className="text-[11px] font-bold uppercase tracking-widest text-white/40">Baris {i + 1} · teks harapan</p>
                  <p className="mt-0.5 text-sm font-medium text-emerald-200">{expectedMap[t.turn_id] || '—'}</p>
                  <p className="mt-2 text-[11px] font-bold uppercase tracking-widest text-white/40">Yang terbaca · cocok {Math.round((t.similarity || 0) * 100)}%</p>
                  <p className="mt-0.5 text-sm text-white">{t.transcript || '—'}</p>
                  {t.drive_file_id && (
                    <div className="mt-2">
                      <WaveformPlayer audioUrl={`/api/dialog/roleplay-audio?submissionId=${selected.id}&turn=${i}`} label={`Rekaman baris ${i + 1}`} color="#10b981" />
                    </div>
                  )}
                </div>
              ))}
            </div>

            <div className="grid grid-cols-2 gap-2">
              {ASPECTS.map((a) => (
                <label key={a.key} className="rounded-xl bg-white/5 p-3">
                  <span className="text-xs text-white/60">{a.label}</span>
                  <span className="ml-2 text-sm font-bold text-white">{scores[a.key]}</span>
                  <input
                    type="range" min={0} max={100} value={scores[a.key]}
                    onChange={(e) => setScores((p) => ({ ...p, [a.key]: Number(e.target.value) }))}
                    className="mt-1 w-full"
                  />
                </label>
              ))}
            </div>
            <textarea
              value={feedback} onChange={(e) => setFeedback(e.target.value)}
              placeholder="Feedback untuk murid..."
              rows={3}
              className="w-full rounded-xl border border-white/10 bg-white/5 p-3 text-sm text-white placeholder:text-white/30"
            />
            <Button onClick={handleReview} disabled={submitting} className="w-full rounded-full">
              {submitting ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Send className="mr-1 h-4 w-4" />}
              Simpan Review
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
