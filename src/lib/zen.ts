export const ZEN_CHAT_URL = 'https://opencode.ai/zen/v1/chat/completions'
export const ZEN_RESPONSES_URL = 'https://opencode.ai/zen/v1/responses'
export const DEFAULT_ZEN_MODEL = 'muse-spark-1.3-contributor-free'

const CHAT_MODELS = new Set([
  'deepseek-v4-pro', 'deepseek-v4-flash', 'deepseek-v4-flash-vision-exp',
  'minimax-m3', 'minimax-m2.7', 'minimax-m2.5',
  'glm-5.3-flash', 'glm-5.3', 'glm-5.2', 'glm-5.1', 'glm-5',
  'kimi-k2.5', 'kimi-k2.6', 'kimi-k2.7-code', 'kimi-k3',
  'big-pickle', 'mimo-v2.5-free',
  'ling-3.0-flash-fin-free', 'nemotron-3-ultra-free', 'nemotron-3.5-lightning-free',
])

export function normalizeZenModel(raw: string | null | undefined): string {
  return (raw || DEFAULT_ZEN_MODEL).replace(/^opencode\//, '').trim() || DEFAULT_ZEN_MODEL
}

export function zenEndpointFor(model: string, override?: string | null): string {
  if (override && override.trim()) return override.trim()
  return CHAT_MODELS.has(model) ? ZEN_CHAT_URL : ZEN_RESPONSES_URL
}

function extractResponsesText(data: unknown): string {
  if (!data || typeof data !== 'object') return ''
  const d = data as Record<string, unknown>
  if (typeof d.output_text === 'string' && d.output_text.trim()) return d.output_text
  if (Array.isArray(d.output)) {
    let text = ''
    for (const item of d.output as Record<string, unknown>[]) {
      if (!item || typeof item !== 'object') continue
      if (Array.isArray(item.content)) {
        for (const c of item.content as Record<string, unknown>[]) {
          if (c && typeof c === 'object' && typeof c.text === 'string') text += c.text
        }
      } else if (typeof item.text === 'string') {
        text += item.text
      }
    }
    if (text.trim()) return text
  }
  if (Array.isArray(d.choices)) {
    const first = (d.choices as Record<string, unknown>[])[0]
    const msg = first?.message as Record<string, unknown> | undefined
    if (msg && typeof msg.content === 'string' && msg.content.trim()) return msg.content
  }
  return ''
}

export interface ZenTextInput {
  apiKey: string
  model: string
  endpointOverride?: string | null
  system: string
  user: string
  maxTokens?: number
  temperature?: number
  timeoutMs?: number
  logTag?: string
}

export async function zenText(input: ZenTextInput): Promise<string | null> {
  const model = normalizeZenModel(input.model)
  const endpoint = zenEndpointFor(model, input.endpointOverride)
  const timeoutMs = input.timeoutMs ?? 25000
  try {
    if (endpoint === ZEN_RESPONSES_URL) {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${input.apiKey}` },
        body: JSON.stringify({
          model,
          input: [
            { role: 'system', content: input.system },
            { role: 'user', content: input.user },
          ],
          max_output_tokens: input.maxTokens ?? 400,
          temperature: input.temperature ?? 0.7,
        }),
        signal: AbortSignal.timeout(timeoutMs),
      })
      if (!res.ok) {
        const errText = await res.text().catch(() => '')
        console.error(`[${input.logTag || 'zen'}] responses error:`, res.status, errText.slice(0, 200))
        return null
      }
      const data = await res.json()
      const text = extractResponsesText(data)
      return text.trim() ? text.trim() : null
    }
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${input.apiKey}` },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: input.system },
          { role: 'user', content: input.user },
        ],
        max_tokens: input.maxTokens ?? 400,
        temperature: input.temperature ?? 0.7,
      }),
      signal: AbortSignal.timeout(timeoutMs),
    })
    if (!res.ok) {
      const errText = await res.text().catch(() => '')
      console.error(`[${input.logTag || 'zen'}] chat error:`, res.status, errText.slice(0, 200))
      return null
    }
    const data = await res.json()
    const raw: string = (data as { choices?: { message?: { content?: string } }[] }).choices?.[0]?.message?.content ?? ''
    return raw.trim() ? raw.trim() : null
  } catch (e) {
    console.error(`[${input.logTag || 'zen'}] request failed`, e)
    return null
  }
}
