import { NextResponse } from 'next/server'

/**
 * Server-side TTS via Edge TTS (free Microsoft voices).
 * Falls back to returning a marker for client-side SpeechSynthesis if edge-tts unavailable.
 */
const VOICE_MAP: Record<string, string> = {
  en: 'en-US-AriaNeural',
  id: 'id-ID-GadisNeural',
  zh: 'zh-CN-XiaoxiaoNeural',
}

async function handleTts(text: string, voice: string | undefined, rate: string, pitch: string, lang: string | undefined) {
  if (!voice && lang && VOICE_MAP[lang]) voice = VOICE_MAP[lang]
  if (!voice) voice = 'en-US-AriaNeural'
  if (!text || typeof text !== 'string') {
    return NextResponse.json({ error: 'text required' }, { status: 400 })
  }
  if (text.length > 5000) {
    return NextResponse.json({ error: 'text too long (max 5000 chars)' }, { status: 400 })
  }
  try {
    const { spawnSync } = await import('child_process')
    const crypto = await import('crypto')
    const tmpFile = `/tmp/tts_${crypto.randomUUID()}.mp3`
    const result = spawnSync('edge-tts', ['--voice', voice, '--rate', rate, '--pitch', pitch, '--text', text, '--write-media', tmpFile], { timeout: 15000 })
    if (result.status !== 0) throw new Error('edge-tts failed')
    const fs = await import('fs')
    const audioBuffer = fs.readFileSync(tmpFile)
    try { fs.unlinkSync(tmpFile) } catch {}
    if (!audioBuffer.length) throw new Error('empty audio')
    return new NextResponse(audioBuffer, {
      headers: { 'Content-Type': 'audio/mpeg', 'Cache-Control': 'public, max-age=86400' },
    })
  } catch {
    return NextResponse.json({ fallback: true, text, voice, rate, message: 'Server TTS unavailable, use client-side SpeechSynthesis' })
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json()
    const { text, voice, rate = '+0%', pitch = '+0Hz', lang } = body as { text: string; voice?: string; rate?: string; pitch?: string; lang?: string }
    return handleTts(text, voice, rate, pitch, lang)
  } catch (e) {
    console.error('[tts] error', e)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url)
    const text = url.searchParams.get('text') || ''
    const voice = url.searchParams.get('voice') || undefined
    const rate = url.searchParams.get('rate') || '+0%'
    const pitch = url.searchParams.get('pitch') || '+0Hz'
    const lang = url.searchParams.get('lang') || undefined
    return handleTts(text, voice, rate, pitch, lang)
  } catch (e) {
    console.error('[tts] error', e)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
