export function titleOf(v: unknown, fallback = "Kelas"): string {
  if (typeof v === "string") return v || fallback
  if (v && typeof v === "object") {
    const o = v as Record<string, unknown>
    return String(o.id || o.en || fallback)
  }
  return fallback
}

export function daysBetween(a: Date, b: Date): number {
  return Math.ceil((b.getTime() - a.getTime()) / 86400000)
}

export function timeGreeting(now: Date): string {
  const h = now.getHours()
  if (h < 11) return "Selamat pagi"
  if (h < 15) return "Selamat siang"
  if (h < 19) return "Selamat sore"
  return "Selamat malam"
}

export async function buildUserContext(supabase: any, userId: string) {
  const [profileRes, enrollRes] = await Promise.all([
    supabase.from("users").select("display_name, role, preferred_language").eq("id", userId).single(),
    supabase
      .from("enrollments")
      .select(`id, batch_id, status, course_id,
        course:courses(id, title, price, language_code, starts_at, ends_at, status,
          program:programs(id, name, slug, program_type),
          level:language_levels(code, name)),
        batch:batches(id, name, code, start_date, end_date, status)`)
      .eq("user_id", userId)
      .eq("status", "active"),
  ])

  const profile = profileRes.data ?? {}
  const role = profile.role || "student"
  const enrollments = (enrollRes.data ?? []) as any[]

  const courseIds = enrollments.map((e: any) => e.course_id).filter(Boolean)
  let upcomingSessions: any[] = []
  if (courseIds.length > 0) {
    const now = new Date()
    const twoWeeksLater = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000)
    const { data: sessionsData } = await supabase
      .from("live_sessions")
      .select("id, course_id, title, starts_at, duration_minutes, meeting_link, status")
      .in("course_id", courseIds)
      .in("status", ["scheduled", "ongoing"])
      .gte("starts_at", now.toISOString())
      .lte("starts_at", twoWeeksLater.toISOString())
      .order("starts_at", { ascending: true })
    upcomingSessions = (sessionsData ?? []) as any[]
  }

  let behavior: any = { attendanceRate: null, quizAvg: null, upcomingSessions }
  if (courseIds.length > 0) {
    const { data: sessData } = await supabase
      .from("live_sessions")
      .select("id")
      .in("course_id", courseIds)
    const sessIds = (sessData ?? []).map((s: any) => s.id)

    const attQuery = supabase.from("attendance").select("status").eq("user_id", userId)
    const quizQuery = supabase.from("quiz_attempts").select("score, status").eq("user_id", userId).neq("status", "failed")
    const gradeQuery = supabase.from("grade_aggregates").select("weighted_total").eq("user_id", userId)

    const [attRes, quizRes, gradeRes] = await Promise.all([
      sessIds.length > 0 ? attQuery.in("session_id", sessIds) : Promise.resolve({ data: [] }),
      quizQuery,
      gradeQuery,
    ])
    const quizzes = (quizRes.data ?? []) as any[]
    const grades = (gradeRes.data ?? []) as any[]
    if (quizzes.length > 0) {
      behavior.quizAvg = Math.round(
        (quizzes.reduce((s, q) => s + Number(q.score ?? 0), 0) / quizzes.length) * 100
      ) / 100
    }
    if (grades.length > 0) {
      const nonZero = grades.filter((g) => Number(g.weighted_total) > 0)
      if (nonZero.length > 0) {
        behavior.avgGrade = Math.round(
          (nonZero.reduce((s, g) => s + Number(g.weighted_total), 0) / nonZero.length) * 100
        ) / 100
      }
    }
    const attData = (attRes.data ?? []) as any[]
    if (attData.length > 0) {
      behavior.attendanceRate = Math.round(
        (attData.filter((a) => a.status === "present" || a.status === "attended").length / attData.length) * 100
      )
    }
  }

  const { data: tokenData } = await supabase
    .from("ai_discount_tokens")
    .select("code, discount_value, expires_at, offered_reason, batch_id")
    .eq("user_id", userId)
    .eq("status", "available")
  const availableTokens = (tokenData ?? []) as any[]

  const [programsRes, catalogRes, openBatchesRes] = await Promise.all([
    supabase.from("programs").select("id, name, slug, language_code, program_type, is_active").eq("is_active", true),
    supabase
      .from("courses")
      .select(`id, title, price, language_code, starts_at, ends_at, status, is_try_class, is_featured,
        program:programs(name, slug, program_type),
        level:language_levels(code, name)`)
      .eq("is_visible_marketplace", true)
      .in("status", ["active", "upcoming"]),
    supabase
      .from("batches")
      .select(`id, name, course_id, start_date, end_date, status,
        course:courses(title, language_code, price)`)
      .in("status", ["active", "upcoming"]),
  ])

  return {
    profile,
    role,
    enrollments,
    behavior,
    availableTokens,
    programs: (programsRes.data ?? []) as any[],
    catalog: (catalogRes.data ?? []) as any[],
    openBatches: (openBatchesRes.data ?? []) as any[],
  }
}

export function formatEnrollments(enrollments: any[]): string {
  if (enrollments.length === 0) return "- belum ada kelas aktif"
  return enrollments
    .map((e) => {
      const c = e.course || {}
      const b = e.batch || {}
      const lv = c.level || {}
      const lvName = typeof lv.name === "string" ? lv.name : lv.name?.id || lv.code || "?"
      const dates = b.start_date || c.starts_at
        ? ` (${b.start_date || c.starts_at} s/d ${b.end_date || c.ends_at || "?"})`
        : ""
      return `- ${titleOf(c.title)} • batch "${b.name || "?"}"${dates} • level ${lvName}`
    })
    .join("\n")
}

export function formatUpcomingSessions(sessions: any[]): string {
  if (sessions.length === 0) return "- tidak ada sesi mendatang dalam 2 minggu ke depan"
  return sessions
    .map((s) => {
      const date = s.starts_at ? new Date(s.starts_at).toLocaleDateString("id-ID", { weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" }) : "?"
      const link = s.meeting_link ? ` | Link: ${s.meeting_link}` : ""
      return `- ${s.title || "Sesi Kelas"} • ${date}${link}`
    })
    .join("\n")
}

export function formatCatalog(catalog: any[], openBatches: any[]): string {
  const lines: string[] = []
  for (const c of catalog) {
    const lv = c.level || {}
    const lvName = typeof lv.name === "string" ? lv.name : lv.name?.id || lv.code || "?"
    lines.push(
      `- ${titleOf(c.title)} • ${c.language_code || "?"} ${lvName} • Rp ${Number(c.price || 0).toLocaleString("id-ID")} • ${c.is_try_class ? "TRIAL" : ""} ${c.is_featured ? "UNGGULAN" : ""} • ${c.status}`
    )
  }
  if (openBatches.length > 0) {
    lines.push("\nBatch yang sedang dibuka:")
    for (const b of openBatches.slice(0, 8)) {
      lines.push(
        `- batch "${b.name}" • ${titleOf(b.course?.title)} • mulai ${b.start_date || "?"} • ${b.status}`
      )
    }
  }
  return lines.length ? lines.join("\n") : "- katalog belum tersedia"
}

export function formatPrograms(programs: any[]): string {
  if (programs.length === 0) return "- belum ada program"
  return programs
    .map((p) => `- ${titleOf(p.name)} (${p.language_code || "?"}) • ${p.program_type || "regular"}`)
    .join("\n")
}

export function buildGreeting(ctx: any, userName: string): string {
  const now = new Date()
  const t = timeGreeting(now)
  const role = ctx.role

  if (role === "teacher") {
    return `${t}, ${userName}! 👋 Senang melihat Anda kembali di Lexora Academy.`
  }
  if (role === "admin") {
    return `${t}, ${userName}! 👋 Anda masuk sebagai admin. Saya siap membantu mengelola program, kelas, dan mengecek data apa pun di platform.`
  }

  const active = ctx.enrollments.length
  const upcomingSessions = ctx.behavior.upcomingSessions || []
  const token = ctx.availableTokens[0]

  let msg = `${t}, ${userName}! 👋 Selamat datang kembali di Lexora Academy! 🎉\n\nSemangat belajar hari ini ya! 💪`

  if (active > 0) {
    msg += `\n\n📚 Kamu sedang mengikuti ${active} kelas aktif:`
    msg += `\n${formatEnrollments(ctx.enrollments)}`
  } else {
    msg += `\n\nKamu belum memiliki kelas aktif saat ini. Yuk mulai belajar! 🚀`
  }

  if (upcomingSessions.length > 0) {
    msg += `\n\n📅 Ada ${upcomingSessions.length} sesi kelas yang akan datang dalam 2 minggu ke depan:`
    msg += `\n${formatUpcomingSessions(upcomingSessions)}`
    msg += `\n\nJangan sampai terlewat ya! Siapkan diri kamu! ✨`
  }

  if (ctx.behavior.avgGrade != null && ctx.behavior.avgGrade >= 70) {
    msg += `\n\n📈 Rata-rata nilai kamu ${ctx.behavior.avgGrade}, keren banget! Terus semangat! 🌟`
  }

  if (token) {
    msg += `\n\n🎁 Oh iya, kamu masih punya kode diskon ${token.code} (${token.discount_value}%) yang bisa digunakan. Jangan sampai terlewat ya!`
  }

  msg += `\n\nAda yang ingin aku bantu hari ini? Aku bisa bantu latihan bahasa, kasih info jadwal kelas, atau rekomendasi kelas yang cocok buat kamu! 😊🔥`
  return msg
}

export async function maybeOffer(supabase: any, ctx: any, userId: string, batchId: string | null, message: string): Promise<any> {
  try {
    const batch = ctx.enrollments.find((e: any) => e.batch_id === batchId)?.batch
    if (!batch) return null

    const now = new Date()
    const end = batch.end_date ? new Date(batch.end_date) : null
    const daysLeft = end ? daysBetween(now, end) : 999
    const alreadyOffered = ctx.availableTokens.some((t: any) => t.batch_id === batchId)

    let reason: string | null = null
    let discount = 15

    const wantsPrice = /(harga|biaya|diskon|promo|potongan|price|discount|promo code|berapa)/i.test(message)
    const wantsNext = /(kelas berikut|lanjut|next class|kelas selanjutnya|recommend|rekomendasi|saran kelas)/i.test(message)

    if (end && daysLeft <= 14 && daysLeft >= 0) {
      reason = "class_ending_offer"
      discount = 20
    } else if (wantsPrice || wantsNext) {
      reason = "pricing_inquiry"
      discount = 15
    } else if (ctx.behavior.avgGrade != null && ctx.behavior.avgGrade >= 80) {
      reason = "achievement_reward"
      discount = 10
    } else if (ctx.behavior.attendanceRate != null && ctx.behavior.attendanceRate >= 80 && end && daysLeft <= 30) {
      reason = "engagement_reward"
      discount = 10
    }

    if (!reason || alreadyOffered) return null

    const { data: token, error } = await supabase.rpc("ai_issue_discount_token", {
      p_user_id: userId,
      p_batch_id: batchId,
      p_course_id: batch.course_id ?? null,
      p_reason: reason,
      p_discount: discount,
    })
    if (error || !token) return null
    return token
  } catch {
    return null
  }
}

export async function getOrCreateSession(supabase: any, userId: string, batchId: string | null): Promise<any> {
  if (batchId) {
    const { data } = await supabase
      .from("ai_chat_sessions")
      .select("*")
      .eq("user_id", userId)
      .eq("batch_id", batchId)
      .eq("status", "active")
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle()
    if (data) return data
  } else {
    const { data } = await supabase
      .from("ai_chat_sessions")
      .select("*")
      .eq("user_id", userId)
      .is("batch_id", null)
      .eq("status", "active")
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle()
    if (data) return data
  }

  const { data: created, error } = await supabase
    .from("ai_chat_sessions")
    .insert({ user_id: userId, batch_id: batchId || null })
    .select("*")
    .single()
  if (error || !created) throw new Error("failed to create chat session")
  return created
}

export async function saveMessage(supabase: any, sessionId: string, role: string, content: string): Promise<void> {
  await supabase.from("ai_chat_messages").insert({ session_id: sessionId, role, content })
  await supabase
    .from("ai_chat_sessions")
    .update({ last_message_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq("id", sessionId)
}

export async function loadHistory(supabase: any, sessionId: string, limit = 50): Promise<any[]> {
  const { data } = await supabase
    .from("ai_chat_messages")
    .select("role, content, created_at")
    .eq("session_id", sessionId)
    .order("created_at", { ascending: false })
    .limit(limit)
  return ((data ?? []) as any[]).reverse()
}