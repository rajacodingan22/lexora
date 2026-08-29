'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { createClient } from '@/lib/supabase-client'
import { WaveformPlayer } from '@/components/shared/waveform-player'
import { Loader2, Phone, CheckCircle2, Clock, XCircle } from 'lucide-react'

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
  student_name?: string
  task_title?: string
}

export function DialogFeedbackTab({ courseId, batchId }: { courseId: string; batchId: string }) {
  const supabase = createClient()
  const [sessions, setSessions] = useState<SessionRow[]>([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<SessionRow | null>(null)

  useEffect(() => {
    if (!courseId || !batchId) return
    fetchSessions()
  }, [courseId, batchId])

  async function fetchSessions() {
    setLoading(true)
    try {
      // get tasks for course
      const { data: tasks } = await supabase.from('course_tasks').select('id, title').eq('course_id', courseId)
      const taskIds = (tasks || []).map(t => t.id)
      const taskMap = new Map((tasks || []).map(t => [t.id, t.title]))
      if (taskIds.length === 0) { setSessions([]); setLoading(false); return }
      const { data } = await supabase.from('dialog_sessions').select('*').eq('batch_id', batchId).in('task_id', taskIds).order('created_at', { ascending: false }).limit(50)
      const rows = (data || []) as SessionRow[]
      // enrich student names
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

  if (loading) return <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-indigo-400" /></div>

  if (selected) {
    const fb: any = selected.feedback || {}
    const turns = (selected.turns as Array<{ role: string; text: string; drive_file_id?: string }>) || []
    return (
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">{selected.student_name} • {selected.task_title}</CardTitle>
          <Button variant="ghost" size="sm" onClick={() => setSelected(null)}>Kembali</Button>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-2">
            <Badge variant={selected.status === 'completed' ? 'success' : selected.status === 'active' ? 'warning' : 'outline'}>{selected.status}</Badge>
            <span className="text-xs text-muted">{new Date(selected.started_at).toLocaleString()}</span>
          </div>

          {fb.summary && <div className="rounded-xl bg-surface-container-low p-4"><p className="text-sm font-medium">Ringkasan</p><p className="text-sm text-on-surface-variant">{String(fb.summary)}</p></div>}

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl border border-border p-3">
              <p className="text-xs font-semibold">Grammar</p>
              <p className="text-sm whitespace-pre-wrap">{JSON.stringify(fb.grammar || {}, null, 2)}</p>
            </div>
            <div className="rounded-xl border border-border p-3">
              <p className="text-xs font-semibold">Pronunciation</p>
              <p className="text-sm whitespace-pre-wrap">{JSON.stringify(fb.pronunciation || {}, null, 2)}</p>
            </div>
            <div className="rounded-xl border border-border p-3">
              <p className="text-xs font-semibold">Fluency</p>
              <p className="text-sm">{String(fb.fluency || '-')}</p>
            </div>
            <div className="rounded-xl border border-border p-3">
              <p className="text-xs font-semibold">Confidence</p>
              <p className="text-sm">{String(fb.confidence || '-')}</p>
            </div>
          </div>

          {Array.isArray(fb.practiceSuggestions) && (
            <div className="rounded-xl bg-indigo-50 dark:bg-indigo-950/20 p-4">
              <p className="text-sm font-semibold">Saran Latihan</p>
              <ul className="list-disc ml-4 text-sm">{(fb.practiceSuggestions as string[]).map((s, i) => <li key={i}>{s}</li>)}</ul>
            </div>
          )}

          <div className="space-y-2">
            <p className="text-sm font-semibold">Gelombang Suara — Student vs Native</p>
            {turns.filter(t => t.role === 'user' && (t as any).drive_file_id).slice(0, 3).map((t, i) => {
              const idx = turns.indexOf(t)
              return <WaveformPlayer key={i} audioUrl={`/api/dialog/audio/${selected.id}?turn=${idx}`} label={`Student: ${String(t.text).slice(0, 50)}`} color="#10b981" />
            })}
            {turns.filter(t => t.role === 'bot').slice(-1).map((t, i) => (
              <div key={i} className="rounded-xl bg-surface-container-low p-3">
                <p className="text-xs text-muted">Native: {String(t.text).slice(0, 120)}</p>
              </div>
            ))}
          </div>

          <div className="space-y-2">
            <p className="text-sm font-semibold">Riwayat Percakapan</p>
            <div className="max-h-[320px] overflow-y-auto space-y-2 rounded-xl border border-border p-3 bg-surface">
              {turns.map((t, i) => (
                <div key={i} className={`rounded-xl px-3 py-2 text-sm ${t.role === 'user' ? 'bg-primary text-primary-foreground ml-8' : 'bg-surface-container-high mr-8'}`}>
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
                    <p className="text-sm font-medium">{s.student_name} • {s.task_title}</p>
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
