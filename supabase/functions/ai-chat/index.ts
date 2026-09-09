import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "jsr:@supabase/supabase-js@2"
import {
  buildUserContext,
  formatEnrollments,
  formatUpcomingSessions,
  formatCatalog,
  formatPrograms,
  buildGreeting,
  maybeOffer,
  getOrCreateSession,
  saveMessage,
  loadHistory,
} from "./helpers.ts"

const DEFAULT_ZEN_URL = "https://opencode.ai/zen/v1/chat/completions"
const ZEN_RESPONSES_URL = "https://opencode.ai/zen/v1/responses"
const DEFAULT_MODEL = "muse-spark-1.3-contributor-free"
const MAX_HISTORY_FOR_LLM = 12

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
  try {
    const configuredSecret = Deno.env.get("AI_CHAT_INTERNAL_SECRET")
    const requestSecret = req.headers.get("x-ai-internal-secret")
    if (!configuredSecret || requestSecret !== configuredSecret) {
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
    const action = body.action || "chat"
    const message = typeof body.message === "string" ? body.message.trim() : ""
    const batchId: string | null = typeof body.batchId === "string" && body.batchId ? body.batchId : null
    const sessionIdIn: string | null = typeof body.sessionId === "string" && body.sessionId ? body.sessionId : null

    if (action === "chat" && (!message || message.length > 4000)) {
      return new Response(JSON.stringify({ error: "Message must be between 1 and 4000 characters" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      })
    }

    // Use service_role for secrets (ai_api_key now admin-only after hardening 20260821120000)
    let map: Record<string, string> = {}
    try {
      const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || Deno.env.get("SERVICE_ROLE_KEY")
      if (serviceKey) {
        const admin = createClient(Deno.env.get("SUPABASE_URL")!, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } })
        const { data: adminSettings } = await admin.from("system_settings").select("key, value")
        for (const row of adminSettings ?? []) map[row.key] = String(row.value ?? "")
      } else {
        const { data: settings } = await supabase.from("system_settings").select("key, value")
        for (const row of settings ?? []) map[row.key] = String(row.value ?? "")
      }
    } catch {
      const { data: settings } = await supabase.from("system_settings").select("key, value")
      for (const row of settings ?? []) map[row.key] = String(row.value ?? "")
    }

    if (map.ai_enabled === "false") {
      return new Response(JSON.stringify({ error: "AI chatbot is disabled" }), { status: 403, headers: { "Content-Type": "application/json" } })
    }

    const model = (map.ai_model || DEFAULT_MODEL).replace(/^opencode\//, "")
    const customEndpoint = map.ai_api_endpoint || Deno.env.get("OPENCODE_ZEN_API_URL") || ""
    const zenUrl = customEndpoint || (ZEN_CHAT_MODELS.has(model) ? DEFAULT_ZEN_URL : ZEN_RESPONSES_URL)
    const zenKey = map.ai_api_key || Deno.env.get("OPENCODE_ZEN_API_KEY") || ""
    const useResponses = !customEndpoint && zenUrl === ZEN_RESPONSES_URL

    const ctx = await buildUserContext(supabase, user.id)
    const userName = ctx.profile.display_name || (ctx.role === "teacher" ? "Bapak/Ibu" : "Siswa")

    if (action === "greet") {
      const session = sessionIdIn
        ? (await supabase.from("ai_chat_sessions").select("*").eq("id", sessionIdIn).eq("user_id", user.id).maybeSingle()).data
        : await getOrCreateSession(supabase, user.id, batchId)
      const history = await loadHistory(supabase, session.id)
      const greeting = history.length === 0 ? buildGreeting(ctx, userName) : null
      return new Response(JSON.stringify({
        sessionId: session.id,
        history,
        greeting,
      }), { headers: { "Content-Type": "application/json" } })
    }

    if (action === "history") {
      const session = sessionIdIn
        ? (await supabase.from("ai_chat_sessions").select("*").eq("id", sessionIdIn).eq("user_id", user.id).maybeSingle()).data
        : await getOrCreateSession(supabase, user.id, batchId)
      const history = await loadHistory(supabase, session.id)
      return new Response(JSON.stringify({ sessionId: session.id, history }), {
        headers: { "Content-Type": "application/json" },
      })
    }

    if (action === "clear") {
      if (sessionIdIn) {
        await supabase.from("ai_chat_messages").delete().eq("session_id", sessionIdIn)
        await supabase.from("ai_chat_sessions").update({ updated_at: new Date().toISOString() }).eq("id", sessionIdIn)
      }
      return new Response(JSON.stringify({ ok: true }), { headers: { "Content-Type": "application/json" } })
    }

    const session = sessionIdIn
      ? (await supabase.from("ai_chat_sessions").select("*").eq("id", sessionIdIn).eq("user_id", user.id).maybeSingle()).data
      : await getOrCreateSession(supabase, user.id, batchId)
    if (!session) throw new Error("session not found")

    await saveMessage(supabase, session.id, "user", message)
    const history = await loadHistory(supabase, session.id)

    const courseInfo = body.courseContext || formatEnrollments(ctx.enrollments)

    const llmHistory = history.slice(-MAX_HISTORY_FOR_LLM - 1, -1).map((m: any) => ({
      role: m.role,
      content: m.content,
    }))

    const behaviorLine = [
      ctx.behavior.attendanceRate != null ? `kehadiran ${ctx.behavior.attendanceRate}%` : null,
      ctx.behavior.quizAvg != null ? `rata-rata kuis ${ctx.behavior.quizAvg}` : null,
      ctx.behavior.avgGrade != null ? `rata-rata nilai ${ctx.behavior.avgGrade}` : null,
    ].filter(Boolean).join(", ")

    const upcomingSessions = ctx.behavior.upcomingSessions || []
    const sessionsInfo = upcomingSessions.length > 0
      ? `Sesi kelas mendatang (2 minggu ke depan):\n${formatUpcomingSessions(upcomingSessions)}`
      : "Tidak ada sesi kelas dalam 2 minggu ke depan."

    const systemPrompt = `Kamu adalah Lexora AI, asisten pintar Lexora Academy — platform pembelajaran bahasa asing (Inggris, Jepang, Korea, Arab, Persia, Indonesia/BIPA).

PERSONALITY:
- Ramah, sabar, edukatif seperti guru les privat
- BAHASA: Indonesia (kecuali user minta bahasa lain untuk praktik)
- Panggil user: "${userName}" (role: ${ctx.role})
- Selalu semangat, positif, dan memotivasi! Gunakan emoji yang menyemangati 🔥💪✨🎉

KONTEKS USER (LIVE dari database, JANGAN berasumsi):
Kelas aktif:
${formatEnrollments(ctx.enrollments)}

${sessionsInfo}

Perilaku belajar: ${behaviorLine || "belum ada data"}
Kode diskon tersedia: ${ctx.availableTokens.length > 0 ? ctx.availableTokens.map((t: any) => `${t.code} (${t.discount_value}%)`).join(", ") : "tidak ada"}

PROGRAM YANG TERSEDIA:
${formatPrograms(ctx.programs)}

KATALOG KELAS (aktif/upcoming):
${formatCatalog(ctx.catalog, ctx.openBatches)}

KEMAMPUAN:
1. Membantu latihan bahasa (grammar, koreksi kalimat, percakapan, kosakata)
2. Menjawab pertanyaan soal program, kelas, biaya, jadwal, dan katalog
3. MENGINGATKAN jadwal kelas yang akan datang (lihat daftar sesi mendatang di atas) dan memberikan link Zoom jika tersedia — ingatkan dengan cara yang menyemangati!
4. Menganalisis perilaku belajar user (nilai, kuis, kehadiran) lalu MERREKOMENDASIKAN kelas selanjutnya yang paling cocok: level berikutnya dari bahasa yang sama, atau kelas baru sesuai minat — selalu rujuk katalog nyata di atas
5. Menjelaskan alur pendaftaran kelas, pembayaran, sertifikat, dan penempatan (placement)

ATURAN:
- Saat ada sesi kelas mendatang, ingatkan dengan SEMANGAT dan POSITIF! Contoh: "Halo ${userName}! 🔥 Jangan lupa ya, besok ada kelas [nama] jam [waktu]! Siapkan diri kamu, pasti seru! 💪"
- Berikan link Zoom jika tersedia agar user bisa langsung join
- Saat user bertanya rekomendasi kelas, bandingkan level/kelas aktif user dengan katalog, beri 1-2 saran spesifik (nama kelas + bahasa + level)
- Maksimal 3-4 kalimat (kecuali user minta detail)
- Bahasa Indonesia, gunakan emoji sesekali untuk kesan ramah dan menyemangati
- JANGAN menyebutkan kode diskon kecuali user bertanya
- Selalu gunakan nada positif dan memotivasi dalam setiap respons

RESPOND ONLY WITH THE AI MESSAGE CONTENT. NO EXPLANATIONS.`

    let reply = ""

    if (zenKey) {
      const zenRes = await fetch(zenUrl, {
        method: "POST",
        headers: { "Authorization": `Bearer ${zenKey}`, "Content-Type": "application/json" },
        body: JSON.stringify(useResponses ? {
          model,
          input: [
            { role: "system", content: systemPrompt },
            ...llmHistory,
            { role: "user", content: message },
          ],
          max_output_tokens: 600,
          temperature: 0.7,
        } : {
          model,
          messages: [
            { role: "system", content: systemPrompt },
            ...llmHistory,
            { role: "user", content: message },
          ],
          max_tokens: 600,
          temperature: 0.7,
        }),
      })

      if (!zenRes.ok) {
        const errText = await zenRes.text()
        throw new Error(`Zen API error: ${zenRes.status} ${errText}`)
      }
      const zenData = await zenRes.json()
      reply = useResponses ? extractResponsesText(zenData) : zenData.choices[0].message.content
      if (!reply) throw new Error("Zen API empty response")
    } else {
      reply = "Maaf, AI asisten belum aktif. Admin sedang mengatur API key."
    }

    await saveMessage(supabase, session.id, "assistant", reply)

    const offer = batchId ? await maybeOffer(supabase, ctx, user.id, batchId, message) : null

    return new Response(JSON.stringify({ reply, sessionId: session.id, offer }), {
      headers: { "Content-Type": "application/json", "Connection": "keep-alive" },
    })
  } catch (err) {
    console.error("ai-chat error:", err)
    return new Response(JSON.stringify({ reply: "Maaf, terjadi kesalahan. Silakan coba lagi nanti.", detail: "AI provider request failed" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    })
  }
})