import { createServerSupabaseClient, createAdminSupabaseClient } from '@/lib/supabase-server'
import { NextResponse } from 'next/server'
import { normalizeZenModel, zenText } from '@/lib/zen'

async function generateFeedback(turns: Array<{ role: string; text: string }>, languageCode: string, topic: string) {
  const history = turns.map(t => `${t.role}: ${t.text}`).join('\n').slice(0, 8000)
  try {
    const admin = createAdminSupabaseClient()
    const { data: settings } = await admin.from('system_settings').select('key, value').in('key', ['ai_api_endpoint', 'ai_api_key', 'ai_model', 'ai_enabled'])
    const map: Record<string, string> = {}
    for (const r of settings ?? []) map[r.key] = String(r.value)
    if (map.ai_enabled === 'false' || !map.ai_api_key) throw new Error('no key')
    const sys = `You are a language coach. Topic: "${topic}". Language: ${languageCode}. Analyze the conversation history and give diagnostic feedback WITHOUT numeric scores. Return JSON ONLY: {"grammar":{"clarity":"good|fair|needs_work","issues":[{"original":"...","corrected":"...","explanation":"..."}]},"pronunciation":{"weakWords":[],"tips":"..."},"fluency":"...","confidence":"...","summary":"...","practiceSuggestions":["..."]}. Keep issues max 3, suggestions max 3, concise.`
    const raw = await zenText({
      apiKey: map.ai_api_key,
      model: normalizeZenModel(map.ai_model),
      endpointOverride: map.ai_api_endpoint,
      system: sys,
      user: `History:\n${history}\n\nGenerate feedback JSON only.`,
      maxTokens: 600,
      temperature: 0.3,
      timeoutMs: 30000,
      logTag: 'dialog/feedback',
    })
    if (!raw) throw new Error('zen empty')
    const s = raw.indexOf('{')
    const e = raw.lastIndexOf('}')
    if (s !== -1 && e > s) {
      return JSON.parse(raw.slice(s, e + 1))
    }
  } catch (e) { console.error('[dialog/feedback] feedback fallback', e) }
  return {
    grammar: { clarity: 'fair', issues: [] },
    pronunciation: { weakWords: [], tips: languageCode === 'id' ? 'Fokus pada intonasi dan pelafalan vokal.' : 'Focus on vowel pronunciation and intonation.' },
    fluency: languageCode === 'id' ? 'Coba bicara lebih lancar tanpa jeda panjang.' : 'Try to speak with fewer long pauses.',
    confidence: languageCode === 'id' ? 'Kamu terdengar sedikit gugup, latihan lagi akan membantu.' : 'You sounded a bit nervous, more practice will help.',
    summary: languageCode === 'id' ? `Latihan ${topic} selesai, pertahankan!` : `Practice on ${topic} completed, keep going!`,
    practiceSuggestions: languageCode === 'id' ? ['Ulangi kalimat sulit 3x', 'Rekam dan dengar kembali', 'Latihan dengan cermin'] : ['Repeat difficult sentences 3x', 'Record and listen back', 'Practice in front of mirror'],
  }
}

/**
 * Teacher/admin-only feedback (re)generation for a dialog session.
 * Unlike /api/dialog/complete (student-owned), this does NOT touch
 * student_task_progress — it only writes the feedback column.
 */
export async function POST(req: Request) {
  try {
    const supabase = await createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const { sessionId } = await req.json()
    if (!sessionId) return NextResponse.json({ error: 'sessionId required' }, { status: 400 })

    const admin = createAdminSupabaseClient()
    const { data: session } = await admin.from('dialog_sessions').select('*').eq('id', sessionId).single()
    if (!session) return NextResponse.json({ error: 'Session not found' }, { status: 404 })

    // Authz: admin OR teacher of the session's course
    const { data: adminRes } = await supabase.rpc('is_admin')
    let allowed = !!adminRes
    if (!allowed) {
      const { data: task } = await admin.from('course_tasks').select('course_id').eq('id', session.task_id).maybeSingle()
      if (task) {
        const { data: teacherRow } = await supabase.from('teachers').select('id').eq('user_id', user.id).maybeSingle()
        if (teacherRow) {
          const { data: ct } = await supabase.from('course_teachers').select('teacher_id').eq('course_id', task.course_id).eq('teacher_id', teacherRow.id).maybeSingle()
          allowed = !!ct
        }
      }
    }
    if (!allowed) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    if (session.feedback && (session.feedback as any)?.summary) {
      return NextResponse.json({ feedback: session.feedback })
    }

    const turns = (session.turns as Array<{ role: string; text: string }>) || []
    const feedback = await generateFeedback(turns, session.language_code, session.topic)
    const { error } = await admin.from('dialog_sessions').update({ feedback }).eq('id', sessionId)
    if (error) {
      console.error('[dialog/feedback] update', error)
      return NextResponse.json({ error: 'Failed to save feedback' }, { status: 500 })
    }

    try {
      await supabase.from('audit_logs').insert({
        action: 'dialog.feedback_generated',
        user_id: user.id,
        role: adminRes ? 'admin' : 'teacher',
        details: { session_id: sessionId, student_id: session.user_id, task_id: session.task_id },
      })
    } catch (auditErr) {
      console.error('[audit] dialog.feedback_generated failed:', auditErr)
    }

    return NextResponse.json({ feedback })
  } catch (e) {
    console.error('[dialog/feedback] error', e)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
