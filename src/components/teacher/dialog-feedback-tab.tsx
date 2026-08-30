'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { createClient } from '@/lib/supabase-client'
import { WaveformPlayer } from '@/components/shared/waveform-player'
import { Loader2, Phone } from 'lucide-react'

interface SessionRow {
  id: string
  user_id: string
  task_id: string
  topic: string
  character_name: string | null
  status: string
  started_at: string
  ends_at: string | null
  turns: Array<Record<string, unknown>>
  feedback: Record<string, unknown> | null
  language_code?: string
  student_name?: string
  task_title?: string
}

export function DialogFeedbackTab({ courseId, batchId }: { courseId: string; batchId: string }) {
  const supabase = createClient()
  const [sessions, setSessions] = useState<SessionRow[]>([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<SessionRow | null>(null)
  const [generating, setGenerating] = useState(false)

  useEffect(() => {
    if (!courseId || !batchId) return
    fetchSessions()
  }, [courseId, batchId])

  async function fetchSessions() {
    setLoading(true)
    try {
      const { data: tasks } = await supabase.from('course_tasks').select('id, title').eq('course_id', courseId)
      const taskIds = (tasks || []).map(t => t.id)
      const taskMap = new Map((tasks || []).map(t => [t.id, t.title]))
      if (taskIds.length === 0) { setSessions([]); setLoading(false); return }
      const { data } = await supabase.from('dialog_sessions').select('*').eq('batch_id', batchId).in('task_id', taskIds).order('created_at', { ascending: false }).limit(50)
      const rows = (data || []) as SessionRow[]
      const uids = [...new Set(rows.map(r => r.user_id))]
      if (uids.length > 0) {
        const { data: users } = await supabase.from('users').select('id, display_name, email').in('id', uids)
        const m = new Map((users || []).map(u => [u.id, u]))
        for (const r of rows) {
          const u: any = m.get(r.user_id)
          r.student_name = u?.display_name || u?.email || 'Unknown'
          r.task_title = taskMap.get(r.task_id) || r.topic
        }
      }
      setSessions(rows)
    } catch (e) { console.error(e) }
    setLoading(false)
  }

  async function generateFeedback() {
    if (!selected) return
    setGenerating(true)
    try {
      const res = await fetch('/api/dialog/complete', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sessionId: selected.id }) })
      const data = await res.json()
      if (res.ok && data.feedback) {
        setSelected({ ...selected, feedback: data.feedback, status: 'completed' })
        fetchSessions()
      }
    } catch {}
    setGenerating(false)
  }

  if (loading) return <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-muted" /></div>

  if (selected) {
    const fb: any = selected.feedback || {}
    const hasFeedback = fb && (fb.summary || fb.grammar || fb.pronunciation)
    const turns = (selected.turns as Array<{ role: string; text: string; drive_file_id?: string }>) || []
    const lang = (selected as any).language_code || 'en'
    // build dual waveform pairs: for each user turn, find next bot turn
    const pairs = turns.map((t, idx) => ({ t, idx })).filter(({ t }) => t.role === 'user').slice(0, 5)
    return (
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">{selected.student_name} • {selected.task_title}</CardTitle>
          <Button variant="ghost" size="sm" onClick={() => setSelected(null)}>Kembali</Button>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-2 items-center">
            <Badge variant={selected.status === 'completed' ? 'success' : selected.status === 'active' ? 'warning' : 'outline'}>{selected.status}</Badge>
            <span className="text-xs text-muted">{new Date(selected.started_at).toLocaleString()}</span>
            {selected.status === 'expired' && !hasFeedback && <Button size="sm" variant="outline" onClick={generateFeedback} disabled={generating}>{generating ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : null} Generate Feedback</Button>}
          </div>

          {!hasFeedback ? (
            <div className="rounded-xl border border-border bg-surface-container-low p-4 text-center">
              <p className="text-sm text-muted">Belum ada feedback — sesi {selected.status} belum di-generate. {selected.status === 'expired' ? 'Klik Generate Feedback.' : 'Selesaikan dialog dulu.'}</p>
            </div>
          ) : (
            <>
              {fb.summary && <div className="rounded-xl bg-surface-container-low p-4"><p className="text-sm font-medium text-on-surface">Ringkasan</p><p className="text-sm text-on-surface-variant">{String(fb.summary)}</p></div>}

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-xl border border-border p-3">
                  <p className="text-xs font-semibold text-on-surface">Grammar</p>
                  {fb.grammar?.clarity && <p className="text-xs text-muted">Clarity: {String(fb.grammar.clarity)}</p>}
                  {Array.isArray(fb.grammar?.issues) && fb.grammar.issues.length > 0 ? (
                    <div className="mt-2 space-y-2">
                      {fb.grammar.issues.map((c: any, i: number) => (
                        <div key={i} className="rounded-lg bg-surface-container-low p-2 text-xs">
                          <span className="line-through text-destructive">{c.original}</span> <span className="text-muted">→</span> <span className="text-success font-medium">{c.corrected}</span>
                          {c.explanation && <p className="text-muted mt-1">{c.explanation}</p>}
                        </div>
                      ))}
                    </div>
                  ) : <p className="text-sm text-muted mt-1">{fb.grammar?.tips ? String(fb.grammar.tips) : 'Tidak ada isu grammar terdeteksi.'}</p>}
                </div>
                <div className="rounded-xl border border-border p-3">
                  <p className="text-xs font-semibold text-on-surface">Pronunciation</p>
                  {Array.isArray(fb.pronunciation?.weakWords) && fb.pronunciation.weakWords.length > 0 ? (
                    <div className="flex flex-wrap gap-1 mt-1">{fb.pronunciation.weakWords.map((w: string, i: number) => <Badge key={i} variant="outline">{w}</Badge>)}</div>
                  ) : null}
                  <p className="text-sm text-muted mt-1">{fb.pronunciation?.tips ? String(fb.pronunciation.tips) : 'Pelafalan bagus.'}</p>
                </div>
                <div className="rounded-xl border border-border p-3">
                  <p className="text-xs font-semibold text-on-surface">Fluency</p>
                  <p className="text-sm text-muted">{String(fb.fluency || '-')}</p>
                </div>
                <div className="rounded-xl border border-border p-3">
                  <p className="text-xs font-semibold text-on-surface">Confidence</p>
                  <p className="text-sm text-muted">{String(fb.confidence || '-')}</p>
                </div>
              </div>

              {Array.isArray(fb.practiceSuggestions) && (
                <div className="rounded-xl bg-primary-soft border border-primary/20 p-4">
                  <p className="text-sm font-semibold text-primary">Saran Latihan</p>
                  <ul className="list-disc ml-4 text-sm text-on-surface-variant mt-1">{(fb.practiceSuggestions as string[]).map((s, i) => <li key={i}>{s}</li>)}</ul>
                </div>
              )}
            </>
          )}

          <div className="space-y-3">
            <p className="text-sm font-semibold text-on-surface">Gelombang Suara — Student vs Native (terpisah)</p>
            <p className="text-xs text-muted">Klik play — Student dari rekaman mic (hijau), Native dari TTS (ungu) per turn, terpisah.</p>
            {pairs.length === 0 && <p className="text-xs text-muted">Belum ada rekaman student.</p>}
            {pairs.map(({ t, idx }) => {
              const botIdx = turns.findIndex((x, i) => i > idx && x.role === 'bot')
              const bot = botIdx !== -1 ? turns[botIdx] as any : null
              return (
                <div key={idx} className="rounded-xl border border-border p-3 space-y-2 bg-surface-container-low">
                  <WaveformPlayer audioUrl={`/api/dialog/audio/${selected.id}?turn=${idx}`} label={`Student: ${String(t.text).slice(0, 60)}`} color="#10b981" />
                  {bot && (
                    <WaveformPlayer audioUrl={`/api/tts?text=${encodeURIComponent(String(bot.text).slice(0, 500))}&lang=${lang}`} label={`Native: ${String(bot.text).slice(0, 60)}`} color="#6366f1" />
                  )}
                </div>
              )
            })}
            {pairs.length === 0 && turns.filter(t => t.role === 'bot').slice(0, 1).map((t: any, i) => (
              <WaveformPlayer key={i} audioUrl={`/api/tts?text=${encodeURIComponent(String(t.text).slice(0, 500))}&lang=${lang}`} label={`Native: ${String(t.text).slice(0, 60)}`} color="#6366f1" />
            ))}
          </div>

          <div className="space-y-2">
            <p className="text-sm font-semibold text-on-surface">Riwayat Percakapan</p>
            <div className="max-h-[320px] overflow-y-auto space-y-2 rounded-xl border border-border p-3 bg-surface-container-low">
              {turns.map((t, i) => (
                <div key={i} className={`rounded-xl px-3 py-2 text-sm ${t.role === 'user' ? 'bg-primary text-primary-foreground ml-8' : 'bg-surface-container-high mr-8 text-on-surface'}`}>
                  {String(t.text)}
                </div>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><Phone className="h-4 w-4" /> Dialog Feedback</CardTitle>
      </CardHeader>
      <CardContent>
        {sessions.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted">Belum ada sesi dialog untuk batch ini.</p>
        ) : (
          <div className="space-y-2">
            {sessions.map(s => (
              <button key={s.id} onClick={() => setSelected(s)} className="w-full text-left rounded-xl border border-border p-3 hover:bg-surface-container-low transition">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-on-surface">{s.student_name} • {s.task_title}</p>
                    <p className="text-xs text-muted">{s.topic} • {new Date(s.started_at).toLocaleString()}</p>
                  </div>
                  <Badge variant={s.status === 'completed' ? 'success' : s.status === 'active' ? 'warning' : 'outline'}>{s.status}</Badge>
                </div>
                <p className="text-xs text-muted mt-1 line-clamp-2">{String((s.turns?.[s.turns.length - 1] as Record<string, unknown>)?.text || '').slice(0, 80)}</p>
              </button>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
