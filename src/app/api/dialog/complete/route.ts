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
      logTag: 'dialog/complete',
    })
    if (!raw) throw new Error('zen empty')
    const s = raw.indexOf('{')
    const e = raw.lastIndexOf('}')
    if (s !== -1 && e > s) {
      const parsed = JSON.parse(raw.slice(s, e + 1))
      return parsed
    }
  } catch (e) { console.error('[dialog/complete] feedback fallback', e) }
  return {
    grammar: { clarity: 'fair', issues: [] },
    pronunciation: { weakWords: [], tips: languageCode === 'id' ? 'Fokus pada intonasi dan pelafalan vokal.' : 'Focus on vowel pronunciation and intonation.' },
    fluency: languageCode === 'id' ? 'Coba bicara lebih lancar tanpa jeda panjang.' : 'Try to speak with fewer long pauses.',
    confidence: languageCode === 'id' ? 'Kamu terdengar sedikit gugup, latihan lagi akan membantu.' : 'You sounded a bit nervous, more practice will help.',
    summary: languageCode === 'id' ? `Latihan ${topic} selesai, pertahankan!` : `Practice on ${topic} completed, keep going!`,
    practiceSuggestions: languageCode === 'id' ? ['Ulangi kalimat sulit 3x', 'Rekam dan dengar kembali', 'Latihan dengan cermin'] : ['Repeat difficult sentences 3x', 'Record and listen back', 'Practice in front of mirror'],
  }
}

export async function POST(req: Request) {
  try {
    const supabase = await createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const { sessionId } = await req.json()
    if (!sessionId) return NextResponse.json({ error: 'sessionId required' }, { status: 400 })

    const { data: session } = await supabase.from('dialog_sessions').select('*').eq('id', sessionId).eq('user_id', user.id).single()
    if (!session) return NextResponse.json({ error: 'Session not found' }, { status: 404 })
    if (session.status === 'completed') return NextResponse.json({ session, feedback: session.feedback })
    // if expired, still generate feedback and mark completed (expired -> completed with feedback)
    const isExpired = session.status === 'expired' || (session.ends_at && new Date(session.ends_at) <= new Date())

    const turns = (session.turns as Array<{ role: string; text: string }>) || []
    const feedback = await generateFeedback(turns, session.language_code, session.topic)

    const { data: updated, error } = await supabase.from('dialog_sessions').update({ status: 'completed', completed_at: new Date().toISOString(), feedback }).eq('id', sessionId).select('*').single()
    if (error) {
      console.error('[dialog/complete] update', error)
      return NextResponse.json({ error: 'Failed to complete' }, { status: 500 })
    }

    // wajib gate: ensure student_task_progress reflects completion
    try {
      const { data: task } = await supabase.from('course_tasks').select('course_id').eq('id', session.task_id).maybeSingle()
      if (task && session.batch_id) {
        // Check if all activities already completed — then mark task completed else keep in_progress
        const { data: lessons } = await supabase.from('task_lessons').select('id').eq('task_id', session.task_id).eq('status', 'published')
        const lessonIds = (lessons || []).map(l => l.id)
        let totalActs = 0
        let completedActs = 0
        if (lessonIds.length > 0) {
          const { data: acts } = await supabase.from('lesson_activities').select('id').in('lesson_id', lessonIds).eq('status', 'published')
          totalActs = (acts || []).length
          if (totalActs > 0) {
            const actIds = (acts || []).map(a => a.id)
            const { data: prog } = await supabase.from('student_activity_progress').select('status').eq('user_id', user.id).eq('batch_id', session.batch_id).in('activity_id', actIds)
            completedActs = (prog || []).filter(p => p.status === 'completed').length
          }
        }
        // If activities done (or no activities) and dialog completed => task completed
        const shouldComplete = totalActs === 0 || completedActs === totalActs
        await supabase.from('student_task_progress').upsert({
          user_id: user.id,
          batch_id: session.batch_id,
          task_id: session.task_id,
          status: shouldComplete ? 'completed' : 'in_progress',
          total_lessons: lessonIds.length,
          total_activities: totalActs,
          completed_activities: completedActs,
          completed_at: shouldComplete ? new Date().toISOString() : null,
        }, { onConflict: 'user_id,batch_id,task_id' })
      }
    } catch (e) { console.error('[dialog/complete] task progress', e) }

    return NextResponse.json({ session: updated, feedback })
  } catch (e) {
    console.error('[dialog/complete] error', e)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
