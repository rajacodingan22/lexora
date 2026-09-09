/**
 * DEPRECATED: This Edge Function is kept for backward compatibility but the canonical
 * grading path is now Next.js API route `src/app/api/ai/grade/route.ts` which
 * includes prompt-injection hardening, length limits, and admin-client secret handling.
 * If you update grading logic, keep this file in sync or remove it and proxy via Next.js.
 */
import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "jsr:@supabase/supabase-js@2"

const DEFAULT_ZEN_URL = "https://opencode.ai/zen/v1/chat/completions"
const ZEN_RESPONSES_URL = "https://opencode.ai/zen/v1/responses"
const DEFAULT_MODEL = "muse-spark-1.3-contributor-free"

const ZEN_CHAT_MODELS = new Set([
  "deepseek-v4-pro", "deepseek-v4-flash", "deepseek-v4-flash-vision-exp",
  "minimax-m3", "minimax-m2.7", "minimax-m2.5",
  "glm-5.3-flash", "glm-5.3", "glm-5.2", "glm-5.1", "glm-5",
  "kimi-k2.5", "kimi-k2.6", "kimi-k2.7-code", "kimi-k3",
  "big-pickle", "mimo-v2.5-free",
  "ling-3.0-flash-fin-free", "nemotron-3-ultra-free", "nemotron-3.5-lightning-free",
])

function extractResponsesText(data: Record<string, unknown>): string {
  if (typeof data.output_text === "string" && (data.output_text as string).trim()) return data.output_text as string
  if (Array.isArray(data.output)) {
    let text = ""
    for (const item of data.output as Record<string, unknown>[]) {
      if (Array.isArray(item.content)) {
        for (const c of item.content as Record<string, unknown>[]) {
          if (c && typeof c.text === "string") text += c.text as string
        }
      } else if (typeof item.text === "string") {
        text += item.text as string
      }
    }
    if (text.trim()) return text
  }
  return ""
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "authorization, x-ai-internal-secret, content-type",
      },
    })
  }

  try {
    const configuredSecret = Deno.env.get("AI_CHAT_INTERNAL_SECRET")
    const requestSecret = req.headers.get("x-ai-internal-secret")
    if (configuredSecret && requestSecret !== configuredSecret) {
      return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403, headers: { "Content-Type": "application/json" } })
    }

    const authHeader = req.headers.get("Authorization")
    if (!authHeader) throw new Error("Unauthorized")
    const token = authHeader.replace("Bearer ", "")
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    })

    const { data: { user }, error: authError } = await supabase.auth.getUser(token)
    if (authError || !user) throw new Error("Unauthorized")

    const body = await req.json()
    const { activityType, passage, transcript, studentResponse } = body

    if (!studentResponse || typeof studentResponse !== "string" || !studentResponse.trim()) {
      return new Response(JSON.stringify({ error: "No student response provided" }), { status: 400, headers: { "Content-Type": "application/json" } })
    }

    if (!activityType || !["reading", "listening"].includes(activityType)) {
      return new Response(JSON.stringify({ error: "Invalid activity type" }), { status: 400, headers: { "Content-Type": "application/json" } })
    }

    // Use service_role for secrets (ai_api_key admin-only after 20260821120000)
    let settingsMap: Record<string, string> = {}
    try {
      const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || Deno.env.get("SERVICE_ROLE_KEY")
      if (serviceKey) {
        const admin = createClient(Deno.env.get("SUPABASE_URL")!, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } })
        const { data: adminSettings } = await admin.from("system_settings").select("key, value").in("key", ["ai_api_endpoint", "ai_api_key", "ai_model", "ai_enabled"])
        for (const row of adminSettings ?? []) settingsMap[row.key] = String(row.value)
      } else {
        const { data: settings } = await supabase.from("system_settings").select("key, value").in("key", ["ai_api_endpoint", "ai_api_key", "ai_model", "ai_enabled"])
        for (const row of settings ?? []) settingsMap[row.key] = String(row.value)
      }
    } catch {
      const { data: settings } = await supabase.from("system_settings").select("key, value").in("key", ["ai_api_endpoint", "ai_api_key", "ai_model", "ai_enabled"])
      for (const row of settings ?? []) settingsMap[row.key] = String(row.value)
    }

    if (settingsMap.ai_enabled === "false") {
      return new Response(JSON.stringify({ error: "AI grading is disabled" }), { status: 403, headers: { "Content-Type": "application/json" } })
    }

    const model = (settingsMap.ai_model || DEFAULT_MODEL).replace(/^opencode\//, "")
    const customEndpoint = settingsMap.ai_api_endpoint || ""
    const apiEndpoint = customEndpoint || (ZEN_CHAT_MODELS.has(model) ? DEFAULT_ZEN_URL : ZEN_RESPONSES_URL)
    const apiKey = settingsMap.ai_api_key || ""
    const useResponses = !customEndpoint && apiEndpoint === ZEN_RESPONSES_URL

    let systemPrompt = ""
    if (activityType === "reading") {
      systemPrompt = `You are an English language teacher grading a student's reading comprehension summary.

Original passage:
${passage || "(not provided)"}

Student's summary:
${studentResponse}

Grade this response on these criteria (each 0-100):
1. Grammar: Are there grammar/spelling errors? How severe?
2. Accuracy: Does the summary accurately reflect the passage content?
3. Comprehension: Does the student demonstrate understanding of the passage?

Respond in JSON format ONLY:
{ "score": <0-100 overall>, "grammar": <0-100>, "accuracy": <0-100>, "comprehension": <0-100>, "feedback": "<detailed feedback>", "corrections": [{"original": "<wrong text>", "corrected": "<correct text>", "explanation": "<why>"}] }

The overall score should be: (grammar * 0.3 + accuracy * 0.35 + comprehension * 0.35). Round to nearest integer.`
    } else if (activityType === "listening") {
      systemPrompt = `You are an English language teacher grading a student's listening comprehension.

Audio transcript (what was said):
${transcript || "(not provided)"}

Student's written explanation of what they heard:
${studentResponse}

Grade this response on these criteria (each 0-100):
1. Grammar: Are there grammar/spelling errors?
2. Comprehension: How well did they understand the audio content?
3. Accuracy: How accurately did they reproduce the content?

Respond in JSON format ONLY:
{ "score": <0-100 overall>, "grammar": <0-100>, "comprehension": <0-100>, "accuracy": <0-100>, "feedback": "<detailed feedback>", "corrections": [{"original": "<wrong text>", "corrected": "<correct text>", "explanation": "<why>"}] }

The overall score should be: (grammar * 0.25 + comprehension * 0.4 + accuracy * 0.35). Round to nearest integer.`
    }

    const llmResponse = await fetch(apiEndpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
      },
      body: JSON.stringify(useResponses ? {
        model,
        input: [
          { role: "system", content: systemPrompt },
          { role: "user", content: "Grade this student response. Return JSON only." },
        ],
        max_output_tokens: 800,
        temperature: 0.3,
      } : {
        model,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: "Grade this student response. Return JSON only." },
        ],
        max_tokens: 800,
        temperature: 0.3,
      }),
    })

    if (!llmResponse.ok) {
      const errText = await llmResponse.text()
      console.error("LLM API error:", errText.slice(0, 200))
      return new Response(JSON.stringify({ error: "AI grading failed" }), { status: 502, headers: { "Content-Type": "application/json" } })
    }

    const llmData = await llmResponse.json()
    const content = useResponses ? extractResponsesText(llmData) : llmData.choices?.[0]?.message?.content ?? ""

    let parsed
    try {
      const jsonMatch = content.match(/\{[\s\S]*\}/)
      parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : { score: 50, feedback: content }
    } catch {
      parsed = { score: 50, feedback: content }
    }

    return new Response(JSON.stringify({
      score: Math.min(100, Math.max(0, Number(parsed.score) || 50)),
      grammar: Number(parsed.grammar) || undefined,
      accuracy: Number(parsed.accuracy) || undefined,
      comprehension: Number(parsed.comprehension) || undefined,
      feedback: parsed.feedback || "",
      corrections: Array.isArray(parsed.corrections) ? parsed.corrections : [],
    }), {
      headers: { "Content-Type": "application/json" },
    })

  } catch (err) {
    console.error("ai-grade error:", err)
    return new Response(JSON.stringify({ error: "Internal error" }), { status: 500, headers: { "Content-Type": "application/json" } })
  }
})
