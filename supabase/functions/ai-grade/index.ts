/**
 * DEPRECATED: This Edge Function is kept for backward compatibility but the canonical
 * grading path is now Next.js API route `src/app/api/ai/grade/route.ts` which
 * includes prompt-injection hardening, length limits, and admin-client secret handling.
 * If you update grading logic, keep this file in sync or remove it and proxy via Next.js.
 */
import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "jsr:@supabase/supabase-js@2"

const DEFAULT_ZEN_URL = "https://opencode.ai/zen/v1/chat/completions"
const DEFAULT_MODEL = "mimo-v2.5-free"

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

    const apiEndpoint = settingsMap.ai_api_endpoint || DEFAULT_ZEN_URL
    const apiKey = settingsMap.ai_api_key || ""
    const model = (settingsMap.ai_model || DEFAULT_MODEL).replace(/^opencode\//, "")

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
      body: JSON.stringify({
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
    const content = llmData.choices?.[0]?.message?.content ?? ""

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
