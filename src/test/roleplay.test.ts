import { describe, expect, it } from 'vitest'
import { normalizeText, similarity, scoreTurn, matchedWords, validateScriptTurns } from '@/lib/text-similarity'
import { activityContentReady } from '@/lib/learning'

describe('text-similarity', () => {
  it('normalizes case, punctuation, spacing', () => {
    expect(normalizeText('  Hello,   WORLD! ')).toBe('hello world')
  })

  it('scores identical sentences 100', () => {
    const r = scoreTurn('Two people, please.', 'two people please', [])
    expect(r.similarity).toBe(1)
    expect(r.score).toBe(100)
  })

  it('penalizes mismatches but counts fuzzy keyword hits', () => {
    const r = scoreTurn('I want to talk about hobbies', 'i want talk about hobies', ['hobbies'])
    expect(r.similarity).toBeGreaterThan(0.7)
    expect(r.keywordHits).toBe(1)
    expect(r.score).toBeGreaterThan(70)
  })

  it('scores empty transcript 0-ish', () => {
    const r = scoreTurn('Hello there', '', [])
    expect(r.score).toBeLessThan(30)
  })
})

describe('validateScriptTurns', () => {
  it('rejects empty script', () => {
    expect(validateScriptTurns([], 'student').length).toBeGreaterThan(0)
  })

  it('requires reader + text per turn and a student turn', () => {
    const errs = validateScriptTurns(
      [{ reader: 'tutor', text: 'Hi!' }, { reader: '', text: '' }],
      'student',
    )
    expect(errs.length).toBeGreaterThanOrEqual(2)
  })

  it('accepts a valid script', () => {
    expect(
      validateScriptTurns(
        [
          { reader: 'tutor', text: 'Welcome!', image_url: 'http://x/y.jpg' },
          { reader: 'student', text: 'Thank you.', image_url: 'http://x/z.jpg' },
        ],
        'student',
      ),
    ).toEqual([])
  })

  it('requires images per beat (strip needs visuals)', () => {
    const errs = validateScriptTurns([{ reader: 'tutor', text: 'Hi!' }], null)
    expect(errs.some((e) => e.includes('gambar'))).toBe(true)
  })

  it('marks spoken words for karaoke coloring', () => {
    const hits = matchedWords('a woman and her dog', 'a woman dog')
    expect(hits.has(0)).toBe(true)
    expect(hits.has(1)).toBe(true)
    expect(hits.has(2)).toBe(false)
    expect(hits.has(3)).toBe(false)
    expect(hits.has(4)).toBe(true)
    expect(matchedWords('hello', '').size).toBe(0)
  })

  it('validates image_quiz content', () => {
    expect(activityContentReady('image_quiz', { items: [] })).toBe(false)
    expect(activityContentReady('image_quiz', {
      items: [{ image: 'http://x/y.jpg', options: ['a', 'b'], correctIndex: 0 }],
    })).toBe(true)
    expect(activityContentReady('image_quiz', {
      items: [{ image: '', options: ['a', 'b'], correctIndex: 0 }],
    })).toBe(false)
    expect(activityContentReady('image_quiz', {
      items: [{ image: 'http://x/y.jpg', options: ['only'], correctIndex: 0 }],
    })).toBe(false)
    expect(activityContentReady('image_quiz', {
      items: [{ image: 'http://x/y.jpg', options: ['a', 'b'], correctIndex: 5 }],
    })).toBe(false)
  })

  it('validates locked quiz beats', () => {
    const bad = validateScriptTurns(
      [{ reader: 'tutor', text: 'Pick!', image_url: 'http://x/y.jpg', quiz: { images: [], options: ['a'], correctIndex: 5 } }],
      null,
    )
    expect(bad.length).toBeGreaterThanOrEqual(2)
    const good = validateScriptTurns(
      [{
        reader: 'tutor', text: 'Pick!', image_url: 'http://x/y.jpg',
        quiz: { images: [{ url: 'http://x/a.jpg', caption: 'a' }], options: ['a', 'b'], correctIndex: 1 },
      }],
      null,
    )
    expect(good).toEqual([])
  })
})
