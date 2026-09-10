import { describe, expect, it } from 'vitest'
import { normalizeText, similarity, scoreTurn, validateScriptTurns } from '@/lib/text-similarity'

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
          { reader: 'tutor', text: 'Welcome!' },
          { reader: 'student', text: 'Thank you.' },
        ],
        'student',
      ),
    ).toEqual([])
  })
})
