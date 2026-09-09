import { createServerSupabaseClient, createAdminSupabaseClient } from '@/lib/supabase-server'
import { NextResponse } from 'next/server'
import { normalizeZenModel, zenText } from '@/lib/zen'

function sanitize(str: string) {
  return str.slice(0, 5000).replace(/```/g, "'''").replace(/\u0000/g, '')
}

async function generateGreeting(topic: string, characterName: string | null, characterRole: string | null, languageCode: string, instructions: string | null): Promise<string> {
  try {
    const admin = createAdminSupabaseClient()
    const { data: settings } = await admin.from('system_settings').select('key, value').in('key', ['ai_api_endpoint', 'ai_api_key', 'ai_model', 'ai_enabled'])
    const map: Record<string, string> = {}
    for (const r of settings ?? []) map[r.key] = String(r.value)
    if (map.ai_enabled === 'false' || !map.ai_api_key) throw new Error('no key')
    const persona = instructions ? `Persona: ${sanitize(instructions).slice(0, 500)}. ` : ''
    const sys = `You are ${characterName || 'a native speaker'} (${characterRole || 'friendly tutor'}). ${persona}Topic lock: ONLY discuss "${sanitize(topic)}". If user goes off-topic, gently redirect back to ${sanitize(topic)}. Language: ${languageCode}. Generate a short warm greeting (1-2 sentences) to start a 7-minute phone conversation. Be natural. No JSON.`
    const txt = await zenText({
      apiKey: map.ai_api_key,
      model: normalizeZenModel(map.ai_model),
      endpointOverride: map.ai_api_endpoint,
      system: sys,
      user: 'Generate greeting now.',
      maxTokens: 200,
      temperature: 0.7,
      timeoutMs: 20000,
      logTag: 'dialog/start',
    })
    if (txt) return txt.slice(0, 500)
  } catch {}
  // fallback
  if (languageCode === 'id') return `Hai! Saya ${characterName || 'teman dialog'} — mari ngobrol tentang ${topic} selama beberapa menit. Kamu siap?`
  if (languageCode === 'zh') return `你好！我是${characterName || '你的语伴'}，我们来聊聊${topic}吧！`
  return `Hi! I'm ${characterName || 'your speaking partner'} — let's chat about ${topic}. Ready?`
}

export async function POST(req: Request) {
  try {
    const supabase = await createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { taskId } = await req.json()
    if (!taskId) return NextResponse.json({ error: 'taskId required' }, { status: 400 })

    // fetch task + course language
    const { data: task } = await supabase.from('course_tasks').select('id, course_id, title, dialog_enabled, dialog_topic, dialog_character_name, dialog_character_role, dialog_instructions, dialog_duration_sec').eq('id', taskId).single()
    if (!task) return NextResponse.json({ error: 'Task not found' }, { status: 404 })
    if (!task.dialog_enabled) return NextResponse.json({ error: 'Dialog not enabled for this unit' }, { status: 400 })

    const topic = (task.dialog_topic || task.title || 'general conversation').trim()
    const durationSec: number = task.dialog_duration_sec ?? 420
    // 0 = tanpa batas

    // enrollment + batch
    const { data: course } = await supabase.from('courses').select('language_code').eq('id', task.course_id).maybeSingle()
    const language_code = course?.language_code || 'en'

    const { data: enrollment } = await supabase.from('enrollments').select('batch_id').eq('user_id', user.id).eq('course_id', task.course_id).maybeSingle()
    if (!enrollment?.batch_id) return NextResponse.json({ error: 'Not enrolled' }, { status: 403 })
    const batchId = enrollment.batch_id

    // wajib gate: check all activities completed in this task
    const { data: lessons } = await supabase.from('task_lessons').select('id').eq('task_id', taskId).eq('status', 'published')
    const lessonIds = (lessons || []).map(l => l.id)
    let totalActivities = 0
    let completedActivities = 0
    if (lessonIds.length > 0) {
      const { data: acts } = await supabase.from('lesson_activities').select('id').in('lesson_id', lessonIds).eq('status', 'published')
      totalActivities = (acts || []).length
      if (totalActivities > 0) {
        const actIds = (acts || []).map(a => a.id)
        const { data: prog } = await supabase.from('student_activity_progress').select('activity_id, status').eq('user_id', user.id).eq('batch_id', batchId).in('activity_id', actIds)
        completedActivities = (prog || []).filter(p => p.status === 'completed').length
      }
    }
    // also check batch_tasks published
    const { data: bt } = await supabase.from('batch_tasks').select('status').eq('batch_id', batchId).eq('task_id', taskId).maybeSingle()
    if (!bt || bt.status !== 'published') return NextResponse.json({ error: 'Task not assigned' }, { status: 403 })
    if (totalActivities > 0 && completedActivities !== totalActivities) {
      return NextResponse.json({ error: 'Complete all activities first', totalActivities, completedActivities }, { status: 403 })
    }

    // check existing active session
    const now = new Date()
    const { data: existing } = await supabase.from('dialog_sessions').select('*').eq('user_id', user.id).eq('batch_id', batchId).eq('task_id', taskId).eq('status', 'active').order('created_at', { ascending: false }).limit(1).maybeSingle()
    if (existing) {
      const endsAt = existing.ends_at ? new Date(existing.ends_at) : null
      const stillActive = !endsAt || endsAt > now
      if (stillActive) {
        const remainingSec = endsAt ? Math.max(0, Math.ceil((endsAt.getTime() - now.getTime()) / 1000)) : null
        return NextResponse.json({ session: existing, remainingSec, resumed: true })
      } else {
        // expired -> mark
        await supabase.from('dialog_sessions').update({ status: 'expired' }).eq('id', existing.id)
      }
    }

    const startedAt = now
    const endsAt = durationSec === 0 ? null : new Date(startedAt.getTime() + durationSec * 1000)

    const greeting = await generateGreeting(topic, task.dialog_character_name, task.dialog_character_role, language_code, task.dialog_instructions || null)

    const initialTurns = [
      { role: 'bot', text: greeting, ts: startedAt.toISOString(), cueShown: false },
    ]

    const { data: inserted, error } = await supabase.from('dialog_sessions').insert({
      user_id: user.id,
      batch_id: batchId,
      task_id: taskId,
      topic,
      character_name: task.dialog_character_name,
      character_role: task.dialog_character_role,
      language_code,
      status: 'active',
      started_at: startedAt.toISOString(),
      ends_at: endsAt ? endsAt.toISOString() : null,
      turns: initialTurns,
    }).select('*').single()

    if (error || !inserted) {
      // Race: another request created the active session first (partial unique index).
      // Resume it instead of failing.
      if ((error as any)?.code === '23505') {
        const { data: raced } = await supabase.from('dialog_sessions').select('*').eq('user_id', user.id).eq('batch_id', batchId).eq('task_id', taskId).eq('status', 'active').order('created_at', { ascending: false }).limit(1).maybeSingle()
        if (raced) {
          const endsAt = raced.ends_at ? new Date(raced.ends_at) : null
          const remainingSec = endsAt ? Math.max(0, Math.ceil((endsAt.getTime() - Date.now()) / 1000)) : null
          return NextResponse.json({ session: raced, remainingSec, resumed: true })
        }
      }
      console.error('[dialog/start] insert error', error)
      return NextResponse.json({ error: 'Failed to start session' }, { status: 500 })
    }

    const remainingSec = endsAt ? durationSec : null
    return NextResponse.json({ session: inserted, remainingSec, greeting, resumed: false })
  } catch (e) {
    console.error('[dialog/start] error', e)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
