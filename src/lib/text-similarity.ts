export function normalizeText(s: string): string {
  return s.trim().toLowerCase().replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ')
}

export function levenshtein(a: string, b: string): number {
  const m = a.length, n = b.length
  if (m === 0) return n
  if (n === 0) return m
  let prev = Array.from({ length: n + 1 }, (_, j) => j)
  for (let i = 1; i <= m; i++) {
    const cur = [i]
    for (let j = 1; j <= n; j++) {
      cur[j] = a[i - 1] === b[j - 1] ? prev[j - 1] : 1 + Math.min(prev[j], cur[j - 1], prev[j - 1])
    }
    prev = cur
  }
  return prev[n]
}

export function similarity(a: string, b: string): number {
  const maxLen = Math.max(a.length, b.length)
  if (maxLen === 0) return 1
  return 1 - levenshtein(a, b) / maxLen
}

export interface TurnScore {
  similarity: number
  keywordHits: number
  keywordTotal: number
  score: number
}

export function scoreTurn(expected: string, transcript: string, keywords: string[] = []): TurnScore {
  const normExpected = normalizeText(expected)
  const normSpoken = normalizeText(transcript)
  if (!normSpoken) return { similarity: 0, keywordHits: 0, keywordTotal: keywords.length, score: 0 }
  const sim = similarity(normExpected, normSpoken)

  const keys = keywords.map((k) => normalizeText(k)).filter(Boolean)
  let hits = 0
  for (const k of keys) {
    if (!k) continue
    if (normSpoken.includes(k)) {
      hits++
      continue
    }
    const words = normSpoken.split(' ').filter(Boolean)
    if (words.some((w) => similarity(w, k) > 0.7)) hits++
  }

  const keywordPart = keys.length > 0 ? hits / keys.length : 1
  const score = Math.round(Math.max(0, Math.min(1, sim * 0.7 + keywordPart * 0.3)) * 100)
  return { similarity: Math.round(sim * 100) / 100, keywordHits: hits, keywordTotal: keys.length, score }
}

export function validateScriptTurns(turns: { reader: string; text: string }[], studentCharacterId: string | null): string[] {
  const errors: string[] = []
  if (turns.length === 0) errors.push('Naskah masih kosong (minimal 1 baris)')
  turns.forEach((t, i) => {
    if (!t.text.trim()) errors.push(`Baris ${i + 1}: teks masih kosong`)
    if (!t.reader.trim()) errors.push(`Baris ${i + 1}: belum ditentukan siapa yang baca`)
  })
  if (studentCharacterId && !turns.some((t) => t.reader === studentCharacterId)) {
    errors.push('Tidak ada baris untuk tokoh murid — murid tidak kebagian baca')
  }
  return errors
}
