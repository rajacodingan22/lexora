import { describe, expect, it } from 'vitest'
import { normalizeZenModel, zenEndpointFor, ZEN_CHAT_URL, ZEN_RESPONSES_URL, DEFAULT_ZEN_MODEL } from '@/lib/zen'

describe('zen endpoint routing', () => {
  it('routes muse-spark free to responses endpoint', () => {
    expect(zenEndpointFor('muse-spark-1.3-contributor-free')).toBe(ZEN_RESPONSES_URL)
    expect(zenEndpointFor('muse-spark-1.2')).toBe(ZEN_RESPONSES_URL)
    expect(zenEndpointFor('muse-spark-1.3')).toBe(ZEN_RESPONSES_URL)
  })

  it('routes openai-compatible free models to chat endpoint', () => {
    expect(zenEndpointFor('big-pickle')).toBe(ZEN_CHAT_URL)
    expect(zenEndpointFor('mimo-v2.5-free')).toBe(ZEN_CHAT_URL)
    expect(zenEndpointFor('deepseek-v4-flash')).toBe(ZEN_CHAT_URL)
  })

  it('honors custom endpoint override', () => {
    expect(zenEndpointFor('muse-spark-1.3-contributor-free', 'https://custom/v1/chat')).toBe('https://custom/v1/chat')
  })

  it('normalizes model id', () => {
    expect(normalizeZenModel('opencode/muse-spark-1.3-contributor-free')).toBe('muse-spark-1.3-contributor-free')
    expect(normalizeZenModel(null)).toBe(DEFAULT_ZEN_MODEL)
    expect(normalizeZenModel('')).toBe(DEFAULT_ZEN_MODEL)
  })
})
