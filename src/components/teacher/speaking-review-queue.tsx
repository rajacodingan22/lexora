'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Loader2, Clock, CheckCircle2, MessageSquare } from 'lucide-react'
import { TeacherReviewPanel } from './speaking-review-panel'

interface Submission {
  id: string
  student_name: string
  transcript: string
  word_scores: { word: string; accuracy: number }[]
  auto_score: number
  audio_drive_link: string
  review_status: string
  overall_score: number | null
  created_at: string
}

export function SpeakingReviewQueue() {
  const [submissions, setSubmissions] = useState<Submission[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<'pending' | 'reviewed' | 'all'>('pending')
  const [selected, setSelected] = useState<Submission | null>(null)

  async function fetchSubmissions() {
    setLoading(true)
    try {
      const res = await fetch(`/api/speaking-review/queue?status=${filter}`)
      const data = await res.json()
      setSubmissions(data.submissions || [])
    } catch (e) {
      console.error('Failed to fetch queue', e)
    }
    setLoading(false)
  }

  useEffect(() => { fetchSubmissions() }, [filter])

  async function handleReview(review: { scoreFluency: number; scoreIntonation: number; scorePronunciation: number; scoreConfidence: number; scoreComprehension: number; teacherFeedback: string }) {
    if (!selected) return
    try {
      await fetch(`/api/speaking-review/${selected.id}/review`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(review),
      })
      setSelected(null)
      fetchSubmissions()
    } catch (e) {
      console.error('Failed to submit review', e)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-on-surface">Speaking Review Queue</h2>
        <div className="flex gap-1">
          {(['pending', 'reviewed', 'all'] as const).map(s => (
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
          <p className="text-sm text-muted">
            {filter === 'pending' ? 'Tidak ada review yang menunggu.' : 'Tidak ada data.'}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {submissions.map(s => (
            <div
              key={s.id}
              className="flex items-center justify-between rounded-xl border border-border bg-surface p-3 hover:shadow-sm transition-shadow cursor-pointer"
              onClick={() => setSelected(s)}
            >
              <div className="flex items-center gap-3">
                <div className={`flex h-9 w-9 items-center justify-center rounded-full ${
                  s.review_status === 'reviewed' ? 'bg-emerald-100' : 'bg-amber-100'
                }`}>
                  {s.review_status === 'reviewed'
                    ? <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                    : <Clock className="h-4 w-4 text-amber-600" />
                  }
                </div>
                <div>
                  <p className="text-sm font-medium text-on-surface">{s.student_name}</p>
                  <p className="text-xs text-muted truncate max-w-[200px]">&quot;{s.transcript}&quot;</p>
                </div>
              </div>
              <div className="text-right">
                {s.overall_score != null && (
                  <p className="text-xs font-bold text-slate-600">{Math.round(s.overall_score)}%</p>
                )}
                <p className="text-[10px] text-muted">
                  {new Date(s.created_at).toLocaleDateString(typeof navigator !== 'undefined' ? navigator.language : 'id-ID', { day: 'numeric', month: 'short' })}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}

      {selected && (
        <TeacherReviewPanel
          submission={selected}
          onSubmit={handleReview}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  )
}
