'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Loader2, Send, X } from 'lucide-react'
import dynamic from 'next/dynamic'

const WaveformPlayer = dynamic(() => import('@/components/shared/waveform-player').then(m => ({ default: m.WaveformPlayer })), { ssr: false })

interface ReviewData {
  id: string
  student_name: string
  transcript: string
  word_scores: { word: string; accuracy: number }[]
  auto_score: number
  audio_drive_link: string
  created_at: string
}

interface TeacherReviewPanelProps {
  submission: ReviewData
  onSubmit: (review: { scoreFluency: number; scoreIntonation: number; scorePronunciation: number; scoreConfidence: number; scoreComprehension: number; teacherFeedback: string }) => void
  onClose: () => void
}

const ASPECTS = [
  { key: 'fluency', label: 'Kelancaran', description: 'Seberapa lancar tanpa jeda berlebih' },
  { key: 'intonation', label: 'Intonasi', description: 'Nada bicara, stress, rising/falling' },
  { key: 'pronunciation', label: 'Pronunciation', description: 'Kejelasan pengucapan kata' },
  { key: 'confidence', label: 'Confidence', description: 'Yakin tidaknya saat berbicara' },
  { key: 'comprehension', label: 'Comprehension', description: 'Pemahaman makna dari teks' },
] as const

export function TeacherReviewPanel({ submission, onSubmit, onClose }: TeacherReviewPanelProps) {
  const [scores, setScores] = useState<Record<string, number>>({
    fluency: 75,
    intonation: 75,
    pronunciation: 75,
    confidence: 75,
    comprehension: 75,
  })
  const [feedback, setFeedback] = useState('')
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit() {
    setSubmitting(true)
    await onSubmit({
      scoreFluency: scores.fluency,
      scoreIntonation: scores.intonation,
      scorePronunciation: scores.pronunciation,
      scoreConfidence: scores.confidence,
      scoreComprehension: scores.comprehension,
      teacherFeedback: feedback,
    })
    setSubmitting(false)
  }

  const avg = Math.round(Object.values(scores).reduce((a, b) => a + b, 0) / Object.values(scores).length)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-slate-800 p-6 shadow-2xl">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-bold text-white">Review: {submission.student_name}</h3>
          <button onClick={onClose} className="text-white/40 hover:text-white"><X className="h-5 w-5" /></button>
        </div>

        {/* Transcript */}
        <div className="mb-4 rounded-xl bg-white/5 p-3">
          <p className="text-xs text-white/40 mb-1">Transcript:</p>
          <p className="text-sm text-white/80">&quot;{submission.transcript}&quot;</p>
        </div>

        {/* Word scores */}
        {submission.word_scores && (
          <div className="mb-4 flex flex-wrap gap-1">
            {submission.word_scores.map((w, i) => (
              <span key={i} className={`rounded px-1.5 py-0.5 text-xs font-medium ${
                w.accuracy >= 0.9 ? 'bg-emerald-500/20 text-emerald-300' :
                w.accuracy >= 0.7 ? 'bg-amber-500/20 text-amber-300' :
                'bg-red-500/20 text-red-300'
              }`}>{w.word}</span>
            ))}
          </div>
        )}

        {/* Auto score */}
        <p className="mb-3 text-xs text-white/40">Skor Otomatis: {Math.round((submission.auto_score || 0) * 100)}%</p>

        {/* Audio player */}
        {submission.audio_drive_link && (
          <div className="mb-4">
            <WaveformPlayer
              audioUrl={`/api/speaking-review/audio/${submission.id}`}
              label="Rekaman Student"
              color="#10b981"
              height={56}
            />
          </div>
        )}

        {/* Scoring aspects */}
        <div className="mb-4 space-y-3">
          <p className="text-sm font-semibold text-white">Penilaian</p>
          {ASPECTS.map(({ key, label, description }) => (
            <div key={key}>
              <div className="flex items-center justify-between mb-1">
                <div>
                  <span className="text-xs text-white/70">{label}</span>
                  <span className="ml-1 text-[10px] text-white/30">{description}</span>
                </div>
                <span className="text-xs font-bold text-white">{scores[key]}</span>
              </div>
              <input
                type="range"
                min={0}
                max={100}
                value={scores[key]}
                onChange={(e) => setScores(prev => ({ ...prev, [key]: Number(e.target.value) }))}
                className="w-full h-1.5 rounded-full appearance-none bg-white/10 accent-indigo-500 cursor-pointer"
              />
            </div>
          ))}
        </div>

        {/* Average */}
        <div className="mb-4 flex items-center gap-2">
          <span className="text-xs text-white/40">Overall:</span>
          <div className="h-2 flex-1 overflow-hidden rounded-full bg-white/10">
            <div className="h-full bg-gradient-to-r from-amber-400 to-emerald-400" style={{ width: `${avg}%` }} />
          </div>
          <span className="text-xs font-bold text-white">{avg}</span>
        </div>

        {/* Feedback textarea */}
        <div className="mb-4">
          <label className="mb-1 block text-xs text-white/40">Feedback untuk student:</label>
          <textarea
            rows={3}
            value={feedback}
            onChange={(e) => setFeedback(e.target.value)}
            placeholder="Tulis feedback tentang kelancaran, intonasi, dan saran perbaikan..."
            className="w-full rounded-lg bg-white/5 px-3 py-2 text-sm text-white placeholder:text-white/20 border border-white/10 focus:border-indigo-500 focus:outline-none"
          />
        </div>

        {/* Submit */}
        <Button onClick={handleSubmit} disabled={submitting} className="w-full bg-emerald-600 hover:bg-emerald-700 text-white">
          {submitting ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Send className="mr-1 h-4 w-4" />}
          Kirim Review
        </Button>
      </div>
    </div>
  )
}
