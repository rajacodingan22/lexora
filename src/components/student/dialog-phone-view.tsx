'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
import { Mic, MicOff, X, Phone, Loader2, Send, Volume2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { useI18n } from '@/lib/i18n/client'
import { WaveformPlayer } from '@/components/shared/waveform-player'

interface DialogSession {
  id: string
  topic: string
  character_name?: string | null
  character_role?: string | null
  language_code: string
  status: string
  started_at: string
  ends_at: string | null
  turns: Array<Record<string, unknown>>
  feedback?: Record<string, unknown> | null
}

interface DialogPhoneViewProps {
  taskId: string
  open: boolean
  onClose: () => void
  onCompleted?: () => void
}

function formatRemaining(sec: number | null): string {
  if (sec === null) return '∞'
  const m = Math.floor(sec / 60)
  const s = sec % 60
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

export default function DialogPhoneView({ taskId, open, onClose, onCompleted }: DialogPhoneViewProps) {
  const { t } = useI18n()
  const [session, setSession] = useState<DialogSession | null>(null)
  const [remaining, setRemaining] = useState<number | null>(null)
  const [loading, setLoading] = useState(false)
  const [isRecording, setIsRecording] = useState(false)
  const [transcript, setTranscript] = useState('')
  const [inputText, setInputText] = useState('')
  const [botSpeaking, setBotSpeaking] = useState(false)
  const [cueCard, setCueCard] = useState<string | null>(null)
  const [turnLoading, setTurnLoading] = useState(false)
  const [completedFeedback, setCompletedFeedback] = useState<Record<string, unknown> | null>(null)
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null)
  const [audioUrl, setAudioUrl] = useState<string | null>(null)

  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const recognitionRef = useRef<any>(null)
  const silenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const transcriptRef = useRef('')
  const isRecordingRef = useRef(false)

  // fetch session resume
  const fetchSession = useCallback(async () => {
    try {
      const res = await fetch(`/api/dialog/session?taskId=${taskId}`)
      if (res.ok) {
        const data = await res.json()
        if (data.session) {
          setSession(data.session)
          setRemaining(data.remainingSec)
          if (data.session.feedback) setCompletedFeedback(data.session.feedback as Record<string, unknown>)
          if (data.session.status === 'completed' || data.session.status === 'expired') {
            setCompletedFeedback((data.session.feedback as Record<string, unknown>) || null)
          }
        }
      }
    } catch {}
  }, [taskId])

  useEffect(() => {
    if (open) fetchSession()
  }, [open, fetchSession])

  // countdown from server ends_at
  useEffect(() => {
    if (!session?.ends_at || session.status !== 'active') return
    const ends = new Date(session.ends_at).getTime()
    const tick = () => {
      const r = Math.max(0, Math.ceil((ends - Date.now()) / 1000))
      setRemaining(r)
      if (r <= 0) {
        // auto complete
        handleComplete(false)
      }
    }
    tick()
    countdownRef.current = setInterval(tick, 1000)
    return () => { if (countdownRef.current) clearInterval(countdownRef.current) }
  }, [session?.ends_at, session?.status])

  const startSession = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/dialog/start', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ taskId }) })
      const data = await res.json()
      if (res.ok) {
        setSession(data.session)
        setRemaining(data.remainingSec)
        setCompletedFeedback(null)
        speakBot(data.session.turns?.[0]?.text as string || data.greeting, data.session.language_code)
      } else {
        alert(data.error || 'Gagal memulai dialog')
      }
    } catch (e) { console.error(e) }
    setLoading(false)
  }

  const speakBot = (text: string, lang?: string) => {
    if (!text) return
    setBotSpeaking(true)
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel()
      const u = new SpeechSynthesisUtterance(text)
      u.lang = lang === 'id' ? 'id-ID' : lang === 'zh' ? 'zh-CN' : 'en-US'
      u.rate = 0.9
      const voices = window.speechSynthesis.getVoices()
      const match = voices.find(v => v.lang.toLowerCase().startsWith((lang || 'en').toLowerCase()))
      if (match) u.voice = match
      u.onend = () => setBotSpeaking(false)
      u.onerror = () => setBotSpeaking(false)
      window.speechSynthesis.speak(u)
    } else {
      setTimeout(() => setBotSpeaking(false), 2000)
    }
  }

  const handleComplete = async (manual: boolean) => {
    if (!session) return
    if (countdownRef.current) clearInterval(countdownRef.current)
    try {
      const res = await fetch('/api/dialog/complete', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sessionId: session.id }) })
      const data = await res.json()
      if (res.ok) {
        setCompletedFeedback(data.feedback)
        setSession(data.session)
        onCompleted?.()
        if (!manual) {
          // bisa close atau stay show feedback
        }
      }
    } catch (e) { console.error(e) }
  }

  const sendTurn = async (text: string, blob?: Blob | null) => {
    if (!session || !text.trim()) return
    setTurnLoading(true)
    setCueCard(null)
    let audioBase64: string | null = null
    let mimeType: string | null = null
    if (blob) {
      const buf = await blob.arrayBuffer()
      const bytes = new Uint8Array(buf)
      let bin = ''
      for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i])
      audioBase64 = btoa(bin)
      mimeType = blob.type || 'audio/webm'
    } else if (audioBlob) {
      const buf = await audioBlob.arrayBuffer()
      const bytes = new Uint8Array(buf)
      let bin = ''
      for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i])
      audioBase64 = btoa(bin)
      mimeType = audioBlob.type || 'audio/webm'
    }
    try {
      const res = await fetch('/api/dialog/turn', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: session.id, transcript: text, audioBase64, mimeType }),
      })
      const data = await res.json()
      if (res.ok) {
        setSession(prev => prev ? { ...prev, turns: data.turns } : prev)
        if (data.cueCard) setCueCard(data.cueCard)
        if (data.botText) speakBot(data.botText, session.language_code)
      } else if (data.expired) {
        setSession(prev => prev ? { ...prev, status: 'expired' } : prev)
      } else {
        console.error(data.error)
      }
    } catch (e) { console.error(e) }
    setTranscript('')
    setInputText('')
    setAudioBlob(null)
    if (audioUrl) { URL.revokeObjectURL(audioUrl); setAudioUrl(null) }
    setTurnLoading(false)
  }

  // MediaRecorder + SpeechRecognition
  const startRecording = async () => {
    setCueCard(null)
    setTranscript(''); transcriptRef.current = ''
    // silence cue after 4s of no transcript
    if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current)
    silenceTimerRef.current = setTimeout(() => {
      if (!transcriptRef.current) setCueCard('Coba katakan: "Can you tell me more about ' + (session?.topic || 'this topic') + '?"')
    }, 4000)

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } })
      const mime = MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : 'audio/mp4'
      const mr = new MediaRecorder(stream, { mimeType: mime })
      chunksRef.current = []
      mr.ondataavailable = e => { if (e.data.size > 0) chunksRef.current.push(e.data) }
      mr.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: mime })
        setAudioBlob(blob)
        const url = URL.createObjectURL(blob)
        setAudioUrl(url)
        stream.getTracks().forEach(t => t.stop())
      }
      mr.start()
      mediaRecorderRef.current = mr
      setIsRecording(true); isRecordingRef.current = true
    } catch (e) {
      console.error('mic error', e)
      alert('Mikrofon tidak tersedia, silakan ketik pesan.')
    }

    // SpeechRecognition
    const SR: any = (window as unknown as Record<string, unknown>).SpeechRecognition || (window as unknown as Record<string, unknown>).webkitSpeechRecognition
    if (SR) {
      const rec = new SR()
      rec.lang = session?.language_code === 'id' ? 'id-ID' : session?.language_code === 'zh' ? 'zh-CN' : 'en-US'
      rec.interimResults = true
      rec.continuous = true
      rec.onresult = (e: { results: Array<Array<{ transcript: string; isFinal?: boolean }>> }) => {
        let final = ''
        let interim = ''
        for (let i = 0; i < e.results.length; i++) {
          const r = e.results[i][0]
          if ((r as unknown as { isFinal: boolean }).isFinal) final += r.transcript + ' '
          else interim += r.transcript + ' '
        }
        const txt = (final + interim).trim()
        setTranscript(txt); transcriptRef.current = txt
        if (txt && silenceTimerRef.current) { clearTimeout(silenceTimerRef.current); silenceTimerRef.current = null }
      }
      rec.onend = () => { if (isRecordingRef.current) try { rec.start() } catch {} }
      rec.onerror = () => {}
      try { rec.start() } catch {}
      recognitionRef.current = rec
    }
  }

  const stopRecording = () => {
    setIsRecording(false); isRecordingRef.current = false
    mediaRecorderRef.current?.stop()
    mediaRecorderRef.current = null
    if (recognitionRef.current) { try { recognitionRef.current.stop() } catch {} ; recognitionRef.current = null }
    if (silenceTimerRef.current) { clearTimeout(silenceTimerRef.current); silenceTimerRef.current = null }
    // auto send after stop if transcript available? let user press send
  }

  const sendCurrent = () => {
    const txt = (transcript || inputText).trim()
    if (!txt) return
    // Only send audio if we have a recent recording; clear stale blob after typed-only sends
    const blobToSend = transcript ? audioBlob : null
    sendTurn(txt, blobToSend)
    if (!transcript) {
      if (audioUrl) { URL.revokeObjectURL(audioUrl); setAudioUrl(null) }
      setAudioBlob(null)
    }
  }

  useEffect(() => {
    return () => {
      if (audioUrl) URL.revokeObjectURL(audioUrl)
      window.speechSynthesis?.cancel()
      if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current)
      if (countdownRef.current) clearInterval(countdownRef.current)
    }
  }, [audioUrl])

  if (!open) return null

  const turns = (session?.turns as Array<{ role: string; text: string; ts?: string; drive_file_id?: string; cueCard?: string | null }> | undefined) || []
  const isCompleted = session?.status === 'completed' || !!completedFeedback
  const isExpired = session?.status === 'expired'

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black text-white">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-full bg-white/10 flex items-center justify-center">
            <Phone className="h-4 w-4 text-white/80" />
          </div>
          <div>
            <p className="text-sm font-semibold">{session?.character_name || 'Dialog Partner'}</p>
            <p className="text-xs text-white/60">{session?.topic || ''} {session?.character_role ? `• ${session.character_role}` : ''}</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm font-mono bg-white/10 rounded-full px-3 py-1">{formatRemaining(remaining)}</span>
          <button onClick={() => { window.speechSynthesis?.cancel(); onClose() }} className="h-8 w-8 rounded-full bg-white/10 flex items-center justify-center hover:bg-white/20">
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-hidden flex flex-col">
        {!session ? (
          <div className="flex-1 flex flex-col items-center justify-center p-6 text-center">
            <div className="h-24 w-24 rounded-full bg-white/5 flex items-center justify-center mb-4">
              <Mic className="h-8 w-8 text-white/40" />
            </div>
            <h3 className="text-lg font-semibold">Simulasi Telepon</h3>
            <p className="text-sm text-white/60 mt-2 max-w-sm">Ngobrol turn-based dengan native speaker tentang <b>topik unit ini</b>. Bot hanya akan membahas topik unit — di luar topik akan diarahkan kembali. Durasi dari server, refresh tidak akan reset waktu.</p>
            <Button onClick={startSession} disabled={loading} className="mt-6 rounded-full px-8 bg-white text-black hover:bg-white/90">
              {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null} Mulai Dialog
            </Button>
            <p className="text-xs text-white/40 mt-3">Pastikan mikrofon diizinkan. Jika tidak didukung, kamu bisa ketik.</p>
          </div>
        ) : isCompleted || isExpired ? (
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            <div className="mx-auto max-w-[640px] space-y-4">
              <Card className="bg-white/5 border-white/10 p-4">
                <h4 className="font-semibold text-white">Sesi Selesai {isExpired ? '(Waktu Habis)' : ''}</h4>
                {completedFeedback ? (
                  <div className="mt-3 space-y-3 text-sm">
                    <div>
                      <p className="text-white/60 text-xs">Ringkasan</p>
                      <p className="text-white">{String((completedFeedback as Record<string, unknown>).summary || '-')}</p>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="rounded-xl bg-white/5 p-3">
                        <p className="text-xs text-white/60">Grammar</p>
                        <p className="text-sm text-white">{JSON.stringify((completedFeedback as Record<string, unknown>).grammar || {})}</p>
                      </div>
                      <div className="rounded-xl bg-white/5 p-3">
                        <p className="text-xs text-white/60">Pronunciation</p>
                        <p className="text-sm text-white">{JSON.stringify((completedFeedback as Record<string, unknown>).pronunciation || {})}</p>
                      </div>
                    </div>
                    <div className="rounded-xl bg-white/5 p-3">
                      <p className="text-xs text-white/60">Saran Latihan</p>
                      <ul className="list-disc ml-4 text-white/80">
                        {((completedFeedback as Record<string, unknown>).practiceSuggestions as string[] | undefined)?.map((s: string, i: number) => <li key={i}>{s}</li>)}
                      </ul>
                    </div>
                    <div className="flex gap-2">
                      <Button onClick={onClose} variant="secondary" className="rounded-full">Tutup</Button>
                      {session?.status !== 'completed' && <Button onClick={() => handleComplete(true)} className="rounded-full">Simpan Feedback</Button>}
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-white/70 mt-2">Feedback sedang dibuat...</p>
                )}
              </Card>

              {/* Waveform dual: last user turn vs bot TTS */}
              {turns.length > 0 && (
                <Card className="bg-white/5 border-white/10 p-4 space-y-3">
                  <p className="text-sm font-medium text-white">Perbandingan Gelombang Suara</p>
                  <p className="text-xs text-white/60">Student (hijau) vs Native (ungu). Putar untuk bandingkan intonasi.</p>
                  {turns.map((t, originalIdx) => ({ t, originalIdx })).filter(({ t: tt }) => tt.role === 'user' && (tt as Record<string, unknown>).drive_file_id).slice(-1).map(({ t: tt, originalIdx }) => (
                    <WaveformPlayer key={originalIdx} audioUrl={`/api/dialog/audio/${session.id}?turn=${originalIdx}`} label={`Kamu: ${String(tt.text).slice(0, 40)}`} color="#10b981" />
                  ))}
                  {turns.filter(t => t.role === 'bot').slice(-1).map((t, idx) => (
                    <div key={idx} className="space-y-2">
                      <p className="text-xs text-white/60">Native: {String(t.text).slice(0, 80)}</p>
                      <Button size="sm" variant="secondary" className="rounded-full" onClick={() => speakBot(String(t.text), session.language_code)}>
                        <Volume2 className="h-3 w-3 mr-1" /> Putar Native
                      </Button>
                    </div>
                  ))}
                  {turns.filter(t => t.role === 'user').length === 0 && <p className="text-xs text-white/40">Belum ada rekaman.</p>}
                </Card>
              )}

              <div className="space-y-2">
                <p className="text-xs text-white/60">Riwayat Percakapan</p>
                {turns.map((t, i) => (
                  <div key={i} className={`rounded-2xl px-4 py-2 max-w-[80%] ${t.role === 'user' ? 'bg-white text-black ml-auto' : 'bg-white/10 text-white'}`}>
                    <p className="text-sm">{String(t.text)}</p>
                    <p className="text-[10px] opacity-60 mt-1">{t.role === 'user' ? 'Kamu' : session.character_name || 'Bot'}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <div className="flex-1 flex flex-col">
            {/* Bubble area */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              <div className="mx-auto max-w-[640px] space-y-3">
                {turns.map((t, i) => (
                  <div key={i} className={`flex ${t.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                    <div className={`rounded-[20px] px-4 py-3 max-w-[80%] ${t.role === 'user' ? 'bg-white text-black rounded-br-sm' : 'bg-white/10 text-white rounded-bl-sm border border-white/10'}`}>
                      <p className="text-sm leading-relaxed">{String(t.text)}</p>
                      {t.role === 'bot' && t.cueCard && <p className="text-xs text-indigo-300 mt-2">💡 {String(t.cueCard)}</p>}
                    </div>
                  </div>
                ))}
                {botSpeaking && (
                  <div className="flex justify-start">
                    <div className="rounded-[20px] px-4 py-3 bg-white/10 border border-white/10">
                      <span className="text-sm text-white/60">Bot mengetik…</span>
                    </div>
                  </div>
                )}
                {turnLoading && <div className="flex justify-center"><Loader2 className="h-4 w-4 animate-spin text-white/40" /></div>}
                {cueCard && !turnLoading && (
                  <Card className="bg-amber-500/10 border-amber-500/20 p-3">
                    <p className="text-xs text-amber-200">💡 Hint: {cueCard}</p>
                  </Card>
                )}
                {/* Read & record helper */}
                {turns.length > 0 && turns[turns.length - 1]?.role === 'bot' && (
                  <Card className="bg-indigo-500/10 border-indigo-500/20 p-3 flex items-center justify-between">
                    <p className="text-xs text-white/70">Mau latihan baca? Ucapkan kalimat bot tadi sambil rekam, lalu lihat gelombang di akhir.</p>
                    <Volume2 className="h-4 w-4 text-indigo-300" />
                  </Card>
                )}
              </div>
            </div>

            {/* Speech bubble placeholder like Image 1 when empty */}
            {turns.length <= 1 && (
              <div className="flex flex-col items-center justify-center py-6">
                <div className="h-28 w-48 bg-white rounded-[24px] shadow-xl relative">
                  <div className="absolute -bottom-2 left-6 h-4 w-4 bg-white rotate-45 rounded-sm" />
                </div>
                <p className="text-xs text-white/40 mt-4">Tap to cancel</p>
              </div>
            )}

            {/* Controls */}
            <div className="border-t border-white/10 p-4">
              <div className="mx-auto max-w-[640px] space-y-3">
                {/* fallback text input if SpeechRecognition not available */}
                <div className="flex gap-2">
                  <input
                    value={inputText || transcript}
                    onChange={e => setInputText(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') sendCurrent() }}
                    placeholder={isRecording ? 'Mendengarkan...' : 'Ketik atau tekan mic untuk bicara'}
                    className="flex-1 rounded-full bg-white/10 border border-white/10 px-4 py-3 text-sm text-white placeholder:text-white/40 focus:outline-none focus:ring-1 focus:ring-white/20"
                  />
                  <Button onClick={sendCurrent} disabled={turnLoading || (!inputText && !transcript)} className="h-11 w-11 rounded-full p-0 bg-white text-black hover:bg-white/90">
                    <Send className="h-4 w-4" />
                  </Button>
                </div>

                <div className="flex items-center justify-center gap-6">
                  <button
                    onClick={isRecording ? stopRecording : startRecording}
                    className={`h-14 w-14 rounded-full flex items-center justify-center transition ${isRecording ? 'bg-red-500 text-white animate-pulse' : 'bg-white text-black hover:bg-white/90'}`}
                    aria-label="mic"
                  >
                    {isRecording ? <MicOff className="h-6 w-6" /> : <Mic className="h-6 w-6" />}
                  </button>
                  <button onClick={() => handleComplete(true)} className="h-11 w-11 rounded-full bg-white/10 text-white flex items-center justify-center hover:bg-white/20">
                    <X className="h-5 w-5" />
                  </button>
                </div>

                {audioUrl && <WaveformPlayer audioUrl={audioUrl} label="Preview rekaman kamu" color="#10b981" />}
                <p className="text-center text-xs text-white/40">Mikrofon pakai echo cancellation & noise suppression • Supabase Realtime sinkron • Edge proxy ke Zen</p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
