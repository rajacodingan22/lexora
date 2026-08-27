import { createServerSupabaseClient } from '@/lib/supabase-server'
import { NextResponse } from 'next/server'

function levenshtein(a: string, b: string): number {
  const m = a.length, n = b.length
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0))
  for (let i = 0; i <= m; i++) dp[i][0] = i
  for (let j = 0; j <= n; j++) dp[0][j] = j
  for (let i = 1; i <= m; i++) for (let j = 1; j <= n; j++) dp[i][j] = a[i-1]===b[j-1] ? dp[i-1][j-1] : 1 + Math.min(dp[i-1][j], dp[i][j-1], dp[i-1][j-1])
  return dp[m][n]
}
function similarity(a: string, b: string): number {
  const maxLen = Math.max(a.length, b.length)
  if (maxLen === 0) return 1
  return 1 - levenshtein(a, b) / maxLen
}
function normalize(s: string): string {
  return s.trim().toLowerCase().replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ')
}

export async function POST(req: Request) {
  try {
    const supabase = await createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { expectedText, transcript, prompt } = await req.json()
    const expected = String(expectedText || prompt || '').trim()
    const spoken = String(transcript || '').trim()
    if (!expected) return NextResponse.json({ error: 'expectedText required' }, { status: 400 })
    if (!spoken) return NextResponse.json({ error: 'transcript required' }, { status: 400 })
    if (spoken.length > 500) return NextResponse.json({ error: 'transcript too long' }, { status: 400 })

    const normExpected = normalize(expected)
    const normSpoken = normalize(spoken)

    const expWords = normExpected.split(' ').filter(Boolean)
    const spokWords = normSpoken.split(' ').filter(Boolean)

    // word-level scoring
    const word_scores = expWords.map((w, i) => {
      const spokenWord = spokWords[i] || spokWords.find(sw => similarity(sw, w) > 0.7) || ''
      const acc = spokenWord ? similarity(w, spokenWord) : 0
      return { word: w, spoken: spokenWord, accuracy: Math.round(acc * 100) / 100 }
    })

    // overall: average of word accuracies + bonus for length match
    const avgWord = word_scores.reduce((s, w) => s + w.accuracy, 0) / (word_scores.length || 1)
    const lengthPenalty = Math.abs(expWords.length - spokWords.length) * 0.05
    const overallRaw = Math.max(0, avgWord - lengthPenalty)
    const overall = Math.round(overallRaw * 100) / 100

    // Try Drive upload if user has connected (Opsi A) – optional, non-blocking
    let drive_link: string | null = null
    let drive_file_id: string | null = null
    try {
      // Check if user has drive token (if not, skip)
      const { data: tokenRow } = await supabase.from('user_drive_tokens').select('user_id').eq('user_id', user.id).maybeSingle()
      if (tokenRow) {
        // For MVP we don't actually upload audio blob here (client only sends transcript via Web Speech)
        // If client sends audio blob later, we would upload here via Drive API using refresh_token
        // For now, just record the transcript as text link placeholder
      }
      // Save to audio_recordings for history (text only, hemat)
      // Note: audio blob not stored, only transcript + scores
      // We still insert a row for tutor review if needed
      // await supabase.from('audio_recordings').insert({ user_id: user.id, drive_link, transcript: spoken, overall })
    } catch {}

    const feedback = overall >= 0.9 ? 'Bagus! Pengucapanmu akurat.' : overall >= 0.7 ? 'Lumayan, perbaiki kata yang berwarna merah.' : 'Coba lagi, fokus pada kata yang merah.'

    return NextResponse.json({
      overall,
      word_scores,
      feedback,
      drive_link,
      drive_file_id,
    })
  } catch (e) {
    console.error('[pronunciation] error', e)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
