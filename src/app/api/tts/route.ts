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

export async function POST(req: Request) {
  try {
    const body = await req.json()
    let { text, voice, rate = '+0%', pitch = '+0Hz', lang } = body as { text: string; voice?: string; rate?: string; pitch?: string; lang?: string }
    if (!voice && lang && VOICE_MAP[lang]) voice = VOICE_MAP[lang]
    if (!voice) voice = 'en-US-AriaNeural'
    if (!text || typeof text !== 'string') {
      return NextResponse.json({ error: 'text required' }, { status: 400 })
    }
    if (text.length > 5000) {
      return NextResponse.json({ error: 'text too long (max 5000 chars)' }, { status: 400 })
    }

    // Try edge-tts CLI if available
    try {
      const { execSync } = await import('child_process')
      const crypto = await import('crypto')
      const tmpFile = `/tmp/tts_${crypto.randomUUID()}.mp3`

      // edge-tts writes audio to file
      execSync(
        `edge-tts --voice "${voice}" --rate="${rate}" --pitch="${pitch}" --text "${text.replace(/"/g, '\\"')}" --write-media "${tmpFile}"`,
        { timeout: 15000 }
      )

      const fs = await import('fs')
      const audioBuffer = fs.readFileSync(tmpFile)
      fs.unlinkSync(tmpFile)

      return new NextResponse(audioBuffer, {
        headers: {
          'Content-Type': 'audio/mpeg',
          'Cache-Control': 'public, max-age=86400',
        },
      })
    } catch {
      // edge-tts not available, return text for client-side TTS
      return NextResponse.json({
        fallback: true,
        text,
        voice,
        rate,
        message: 'Server TTS unavailable, use client-side SpeechSynthesis',
      })
    }
  } catch (e) {
    console.error('[tts] error', e)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
