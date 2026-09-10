'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Mic, MicOff, X, Loader2, Send, Volume2, VolumeX, RotateCcw, CheckCircle2, Check } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { WaveformPlayer } from '@/components/shared/waveform-player'
import { normalizeText, scoreTurn, similarity } from '@/lib/text-similarity'
import type { DialogScript, DialogScriptCharacter, DialogScriptTurn, DialogScriptSubmission } from '@/types'

interface Props {
  taskId: string
  open: boolean
  onClose: () => void
  onCompleted?: () => void
}

interface BeatResult {
  turn_id: string
  transcript: string
  similarity: number
  score: number
  blob: Blob | null
  mimeType: string
  url: string | null
}

function charName(chars: DialogScriptCharacter[], id: string): string {
  return chars.find((c) => c.id === id)?.name || '???'
}

function shortCaption(text: string, max = 28): string {
  const t = text.trim()
  return t.length > max ? `${t.slice(0, max - 1)}…` : t
}

function matchedWords(expected: string, transcript: string): Set<number> {
  const expWords = normalizeText(expected).split(' ').filter(Boolean)
  const spokWords = new Set(normalizeText(transcript).split(' ').filter(Boolean))
  const hit = new Set<number>()
  expWords.forEach((w, i) => {
    if (spokWords.has(w)) { hit.add(i); return }
    for (const s of spokWords) {
      if (similarity(w, s) > 0.7) { hit.add(i); break }
    }
  })
  return hit
}

async function speakLine(text: string, lang = 'en'): Promise<void> {
  try {
    const res = await fetch('/api/tts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: text.slice(0, 500), lang }),
    })
    if (res.ok) {
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      try {
        await new Promise<void>((resolve) => {
          const audio = new Audio(url)
          audio.onended = () => resolve()
          audio.onerror = () => resolve()
          audio.play().catch(() => resolve())
          setTimeout(resolve, 30000)
        })
      } finally {
        URL.revokeObjectURL(url)
      }
      return
    }
  } catch { /* fallback */ }
  try {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      await new Promise<void>((resolve) => {
        const u = new SpeechSynthesisUtterance(text)
        u.lang = lang === 'id' ? 'id-ID' : lang === 'zh' ? 'zh-CN' : 'en-US'
        u.rate = 0.9
        u.onend = () => resolve()
        u.onerror = () => resolve()
        window.speechSynthesis.cancel()
        window.speechSynthesis.speak(u)
        setTimeout(resolve, 30000)
      })
    }
  } catch { /* diam */ }
}

export default function RoleplayView({ taskId, open, onClose, onCompleted }: Props) {
  const [loading, setLoading] = useState(false)
  const [script, setScript] = useState<DialogScript | null>(null)
  const [turns, setTurns] = useState<DialogScriptTurn[]>([])
  const [latest, setLatest] = useState<DialogScriptSubmission | null>(null)
  const [error, setError] = useState<string | null>(null)

  const [started, setStarted] = useState(false)
  const [beatIdx, setBeatIdx] = useState(0)
  const [phase, setPhase] = useState<'quiz' | 'bot' | 'user' | 'done'>('bot')
  const [unlocked, setUnlocked] = useState<Record<string, boolean>>({})
  const [shakeKey, setShakeKey] = useState(0)
  const [results, setResults] = useState<Record<string, BeatResult>>({})

  const [isRecording, setIsRecording] = useState(false)
  const [transcript, setTranscript] = useState('')
  const [sending, setSending] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [speakingOpt, setSpeakingOpt] = useState<number | null>(null)

  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const recognitionRef = useRef<{ stop: () => void } | null>(null)
  const transcriptRef = useRef('')
  const isRecordingRef = useRef(false)
  const streamRef = useRef<MediaStream | null>(null)

  const studentChar = script?.student_character_id || ''
  const chars = (script?.characters ?? []) as DialogScriptCharacter[]
  const beat = turns[beatIdx]
  const isMine = !!beat && studentChar !== '' && beat.reader === studentChar
  const finished = started && beatIdx >= turns.length && turns.length > 0

  const fetchScript = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/dialog/script?taskId=${taskId}`)
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || 'Gagal memuat naskah')
        return
      }
      setScript(data.script)
      setTurns(data.turns || [])
      setLatest(data.latest || null)
    } catch {
      setError('Koneksi gagal')
    }
    setLoading(false)
  }, [taskId])

  useEffect(() => {
    if (open) {
      setStarted(false)
      setBeatIdx(0)
      setResults({})
      setUnlocked({})
      setTranscript('')
      fetchScript()
    }
    return () => {
      try { mediaRecorderRef.current?.stop() } catch { /* noop */ }
      mediaRecorderRef.current = null
      try { recognitionRef.current?.stop() } catch { /* noop */ }
      recognitionRef.current = null
      if (typeof window !== 'undefined' && 'speechSynthesis' in window) window.speechSynthesis.cancel()
    }
  }, [open, fetchScript])

  // Otomatisasi beat: kuis → bot TTS → giliran murid
  useEffect(() => {
    if (!started || !beat) return
    if (beat.quiz && !unlocked[beat.id]) {
      setPhase('quiz')
      return
    }
    if (isMine) {
      setPhase('user')
      return
    }
    setPhase('bot')
    let cancelled = false
    speakLine(beat.text).then(() => {
      if (!cancelled) setBeatIdx((i) => i + 1)
    })
    return () => { cancelled = true }
  }, [started, beatIdx, turns, studentChar]) // eslint-disable-line react-hooks/exhaustive-deps

  function playOption(text: string, idx: number) {
    setSpeakingOpt(idx)
    speakLine(text).then(() => setSpeakingOpt((cur) => (cur === idx ? null : cur)))
  }

  function pickOption(idx: number) {
    if (!beat?.quiz) return
    if (idx === beat.quiz.correctIndex) {
      setUnlocked((u) => ({ ...u, [beat.id]: true }))
      speakLine(beat.quiz.options[idx])
    } else {
      setShakeKey((k) => k + 1)
    }
  }

  const startRecording = async () => {
    setTranscript('')
    transcriptRef.current = ''
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } })
      streamRef.current = stream
      const mime = MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : 'audio/mp4'
      const mr = new MediaRecorder(stream, { mimeType: mime })
      chunksRef.current = []
      mr.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data) }
      mr.onstop = () => { stream.getTracks().forEach((t) => t.stop()) }
      mr.start()
      mediaRecorderRef.current = mr
      setIsRecording(true)
      isRecordingRef.current = true
    } catch {
      alert('Mikrofon tidak tersedia.')
      return
    }
    const SR = (window as unknown as Record<string, unknown>).SpeechRecognition || (window as unknown as Record<string, unknown>).webkitSpeechRecognition
    if (SR) {
      try {
        const Rec = SR as new () => { lang: string; interimResults: boolean; continuous: boolean; onresult: ((e: { results: Array<Array<{ transcript: string; isFinal?: boolean }>> }) => void) | null; onend: (() => void) | null; onerror: (() => void) | null; start: () => void; stop: () => void }
        const rec = new Rec()
        rec.lang = 'en-US'
        rec.interimResults = true
        rec.continuous = true
        rec.onresult = (e) => {
          let txt = ''
          for (let i = 0; i < e.results.length; i++) txt += `${e.results[i][0].transcript} `
          txt = txt.trim()
          setTranscript(txt)
          transcriptRef.current = txt
        }
        rec.onend = () => { if (isRecordingRef.current) { try { rec.start() } catch { /* noop */ } } }
        rec.onerror = () => { /* diam */ }
        rec.start()
        recognitionRef.current = rec
      } catch { /* tanpa STT, rekaman tetap jalan */ }
    }
  }

  const stopRecording = () => {
    setIsRecording(false)
    isRecordingRef.current = false
    try { mediaRecorderRef.current?.stop() } catch { /* noop */ }
    mediaRecorderRef.current = null
    try { recognitionRef.current?.stop() } catch { /* noop */ }
    recognitionRef.current = null
    if (streamRef.current) { try { streamRef.current.getTracks().forEach((t) => t.stop()) } catch { /* noop */ } streamRef.current = null }
  }

  async function confirmTurn() {
    if (!beat || sending) return
    const text = (transcript || transcriptRef.current).trim()
    if (!text) return
    setSending(true)
    await new Promise((r) => setTimeout(r, 300))
    const blob = chunksRef.current.length > 0 ? new Blob(chunksRef.current, { type: mediaRecorderRef.current?.mimeType || 'audio/webm' }) : null
    const mimeType = blob?.type || 'audio/webm'
    const s = scoreTurn(beat.text, text, beat.keywords ?? [])
    setResults((prev) => {
      const old = prev[beat.id]
      if (old?.url) { try { URL.revokeObjectURL(old.url) } catch { /* noop */ } }
      return { ...prev, [beat.id]: { turn_id: beat.id, transcript: text, similarity: s.similarity, score: s.score, blob, mimeType, url: blob ? URL.createObjectURL(blob) : null } }
    })
    setTranscript('')
    transcriptRef.current = ''
    chunksRef.current = []
    setSending(false)
    setBeatIdx((i) => i + 1)
  }

  function blobToBase64(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => {
        const s = String(reader.result || '')
        resolve(s.includes(',') ? s.split(',')[1] : s)
      }
      reader.onerror = reject
      reader.readAsDataURL(blob)
    })
  }

  async function handleSubmit() {
    if (submitting) return
    setSubmitting(true)
    try {
      const payload: { turn_id: string; transcript: string; similarity: number; audioBase64?: string; mimeType?: string }[] = []
      for (const t of turns) {
        if (studentChar !== '' && t.reader !== studentChar) continue
        const r = results[t.id]
        if (!r) continue
        const entry: { turn_id: string; transcript: string; similarity: number; audioBase64?: string; mimeType?: string } = {
          turn_id: t.id, transcript: r.transcript, similarity: r.similarity,
        }
        if (r.blob) {
          if (r.blob.size > 5 * 1024 * 1024) continue
          entry.audioBase64 = await blobToBase64(r.blob)
          entry.mimeType = r.mimeType
        }
        payload.push(entry)
      }
      const res = await fetch('/api/dialog/attempt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ taskId, turns: payload }),
      })
      const data = await res.json()
      if (!res.ok) {
        alert(data.error || 'Gagal mengirim')
        return
      }
      setLatest({ ...(latest as DialogScriptSubmission), id: data.submission_id, status: 'pending' } as DialogScriptSubmission)
      setPhase('done')
      onCompleted?.()
    } catch {
      alert('Koneksi gagal')
    }
    setSubmitting(false)
  }

  const doneBeats = useMemo(() => {
    const s = new Set<string>()
    turns.slice(0, beatIdx).forEach((t) => s.add(t.id))
    return s
  }, [turns, beatIdx])

  const liveHits = useMemo(() => {
    if (!beat || phase !== 'user') return new Set<number>()
    return matchedWords(beat.text, transcript)
  }, [beat, transcript, phase])

  if (!open) return null

  const reviewed = latest?.status === 'reviewed'
  const pending = latest?.status === 'pending' && phase === 'done'
  const waitingReview = latest?.status === 'pending' && !started

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-[#111827] text-white">
      <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">{script?.title || 'Roleplay'}</p>
          <p className="truncate text-xs text-white/60">
            {studentChar ? `Kamu sebagai ${charName(chars, studentChar)}` : ''}
          </p>
        </div>
        <button onClick={onClose} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/10 hover:bg-white/20" aria-label="Tutup">
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        {loading ? (
          <div className="flex flex-1 items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-white/40" /></div>
        ) : error || !script ? (
          <div className="flex flex-1 flex-col items-center justify-center p-6 text-center">
            <p className="text-sm text-white/70">{error || 'Naskah tidak ditemukan.'}</p>
            <Button onClick={onClose} variant="secondary" className="mt-4 rounded-full">Tutup</Button>
          </div>
        ) : reviewed || waitingReview ? (
          <div className="min-h-0 flex-1 overflow-y-auto p-4" style={{ WebkitOverflowScrolling: 'touch' }}>
            <div className="mx-auto max-w-[640px] space-y-4">
              <Card className="border-white/10 bg-white/5 p-4">
                <h4 className="font-semibold text-white">{reviewed ? 'Sudah Dinilai Guru' : 'Menunggu Review Guru'}</h4>
                {reviewed && latest?.teacher_feedback && <p className="mt-2 text-sm text-white/80">{latest.teacher_feedback}</p>}
                {reviewed && latest?.overall_score != null && <p className="mt-2 text-2xl font-bold text-emerald-300">{Math.round(latest.overall_score)}</p>}
                {!reviewed && <p className="mt-2 text-sm text-white/60">Audio kamu sudah terkirim. Guru akan mendengarkan dan menilai.</p>}
                <div className="mt-4 flex flex-wrap gap-2">
                  <Button onClick={onClose} variant="secondary" className="rounded-full">Tutup</Button>
                  <Button className="rounded-full bg-white text-black hover:bg-white/90"                     onClick={() => { setStarted(true); setBeatIdx(0); setResults({}); setUnlocked({}); setLatest(null) }}>
                    <RotateCcw className="mr-1 h-4 w-4" /> Main Lagi
                  </Button>
                </div>
              </Card>
            </div>
          </div>
        ) : pending ? (
          <div className="flex flex-1 flex-col items-center justify-center p-6 text-center">
            <CheckCircle2 className="h-12 w-12 text-emerald-300" />
            <h4 className="mt-3 font-semibold text-white">Terkirim!</h4>
            <p className="mt-1 max-w-xs text-sm text-white/60">Rekamanmu menunggu review guru.</p>
            <Button onClick={onClose} variant="secondary" className="mt-4 rounded-full">Tutup</Button>
          </div>
        ) : !started ? (
          <div className="min-h-0 flex-1 overflow-y-auto p-4" style={{ WebkitOverflowScrolling: 'touch' }}>
            <div className="mx-auto flex max-w-[640px] flex-col items-center py-6 text-center">
              {script.scene_image_url && <img src={script.scene_image_url} alt="" className="max-h-56 w-full rounded-2xl border border-white/10 object-cover" />}
              {script.setting_desc && <p className="mt-4 text-sm italic leading-relaxed text-white/70">{script.setting_desc}</p>}
              <div className="mt-4 flex flex-wrap justify-center gap-2">
                {chars.map((c) => (
                  <span key={c.id} className={`rounded-full border px-3 py-1 text-xs ${c.id === studentChar ? 'border-emerald-300 bg-emerald-300/10 text-emerald-200' : 'border-white/15 text-white/70'}`}>
                    {c.name}{c.role ? ` · ${c.role}` : ''}{c.id === studentChar ? ' (kamu)' : ''}
                  </span>
                ))}
              </div>
              <p className="mt-4 text-xs text-white/50">{turns.length} beat · ikuti gambar, dengarkan, lalu baca giliranmu</p>
              <Button onClick={() => { setStarted(true); setBeatIdx(0) }} className="mt-6 rounded-full bg-white px-8 text-black hover:bg-white/90">
                Mulai Roleplay
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex min-h-0 flex-1 flex-col">
            {/* Strip: thumbnail + caption + ceklis + ^ aktif */}
            <div className="shrink-0 border-b border-white/10 px-3 pb-2 pt-3">
              <div className="mx-auto flex max-w-[640px] gap-2 overflow-x-auto pb-1">
                {turns.map((t, i) => {
                  const done = doneBeats.has(t.id)
                  const active = i === beatIdx
                  return (
                    <div key={t.id} className="w-24 shrink-0 sm:w-28">
                      <div className={`overflow-hidden rounded-lg border-2 ${active ? 'border-sky-400' : done ? 'border-emerald-400/70' : 'border-white/10'} relative`}>
                        {t.image_url ? (
                          <img src={t.image_url} alt="" className="h-16 w-full object-cover sm:h-20" />
                        ) : (
                          <div className="flex h-16 w-full items-center justify-center bg-white/5 text-[10px] text-white/30 sm:h-20">—</div>
                        )}
                        {done && (
                          <span className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-sky-500">
                            <Check className="h-3 w-3 text-white" />
                          </span>
                        )}
                      </div>
                      <p className="mt-1 truncate text-[11px] text-white/70">{shortCaption(t.text)}</p>
                      {active && <p className="text-center text-[10px] leading-none text-white/60">^</p>}
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Gambar besar beat aktif */}
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4" style={{ WebkitOverflowScrolling: 'touch' }}>
              <div className="mx-auto max-w-[640px]">
                {beat && beat.image_url && (
                  <div className="relative overflow-hidden rounded-2xl border border-white/10">
                    <img src={beat.image_url} alt="" className="max-h-[42vh] w-full object-cover" />
                    {phase === 'user' && (
                      <div className="absolute inset-x-3 bottom-3 flex items-center gap-2 rounded-xl bg-slate-900/85 px-3 py-2 backdrop-blur">
                        <Volume2 className="h-4 w-4 shrink-0 text-sky-300" />
                        <p className="text-sm font-medium text-white">
                          <KaraokeLine expected={beat.text} hits={liveHits} />
                        </p>
                      </div>
                    )}
                  </div>
                )}

                {/* Fase pilih (kunci pilihan) */}
                {!finished && phase === 'quiz' && beat?.quiz && (
                  <div key={shakeKey} className="mt-3 space-y-2">
                    {beat.quiz.options.map((opt, i) => (
                      <button
                        key={i}
                        onClick={() => pickOption(i)}
                        className="flex w-full items-center justify-between gap-2 rounded-full border border-white/15 bg-white/5 px-4 py-3 text-left text-sm text-white transition hover:border-sky-400/60"
                      >
                        <span>{opt}</span>
                        <span
                          role="button" tabIndex={0} aria-label={`Dengarkan opsi ${i + 1}`}
                          onClick={(e) => { e.stopPropagation(); playOption(opt, i) }}
                          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.stopPropagation(); playOption(opt, i) } }}
                          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/10 hover:bg-white/20"
                        >
                          {speakingOpt === i ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
                        </span>
                      </button>
                    ))}
                  </div>
                )}

                {transcript && phase === 'user' && (
                  <p className="mt-2 rounded-xl bg-black/40 p-2 text-sm text-white/80">{transcript}</p>
                )}

                {finished && (
                  <div className="mt-3 rounded-2xl border border-white/10 bg-white/5 p-4 text-center">
                    <p className="text-sm text-white/80">Naskah selesai. Kirim rekamanmu ke guru?</p>
                    <Button onClick={handleSubmit} disabled={submitting} className="mt-3 rounded-full bg-white px-8 text-black hover:bg-white/90">
                      {submitting ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Send className="mr-1 h-4 w-4" />}
                      Kirim ke Guru
                    </Button>
                  </div>
                )}
              </div>
            </div>

            {/* Mic */}
            {!finished && phase === 'user' && (
              <div className="shrink-0 border-t border-white/10 p-4">
                <div className="mx-auto flex max-w-[640px] items-center justify-center gap-4">
                  <button
                    onClick={isRecording ? stopRecording : startRecording}
                    className={`flex h-14 w-14 items-center justify-center rounded-full transition ${isRecording ? 'animate-pulse bg-red-500 text-white' : 'bg-amber-200/90 text-black hover:bg-amber-100'}`}
                    aria-label="mic"
                  >
                    {isRecording ? <MicOff className="h-6 w-6" /> : <Mic className="h-6 w-6" />}
                  </button>
                  <Button onClick={confirmTurn} disabled={sending || !transcript.trim()} className="rounded-full bg-white px-6 text-black hover:bg-white/90">
                    {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Lanjut'}
                  </Button>
                </div>
                <p className="mt-2 text-center text-xs text-white/40">
                  {isRecording ? 'Merekam… tekan mic untuk berhenti, lalu Lanjut' : 'Tekan mic, baca teks di gambar, berhenti, lalu Lanjut'}
                </p>
                {(() => {
                  const r = beat ? results[beat.id] : undefined
                  return r?.url ? (
                    <div className="mx-auto mt-2 max-w-[640px]">
                      <WaveformPlayer audioUrl={r.url} label="Preview rekamanmu" color="#10b981" />
                    </div>
                  ) : null
                })()}
              </div>
            )}
            {!finished && phase === 'bot' && (
              <div className="shrink-0 border-t border-white/10 p-3 text-center text-xs text-white/40">Mendengarkan…</div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

function KaraokeLine({ expected, hits }: { expected: string; hits: Set<number> }) {
  const words = expected.split(/(\s+)/)
  let wi = -1
  return (
    <>
      {words.map((w, i) => {
        if (!w.trim()) return <span key={i}>{w}</span>
        wi += 1
        const hit = hits.has(wi)
        return (
          <span key={i} className={hit ? 'text-emerald-300' : undefined}>{w}</span>
        )
      })}
    </>
  )
}
