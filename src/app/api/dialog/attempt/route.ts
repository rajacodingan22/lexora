import { createServerSupabaseClient } from '@/lib/supabase-server'
import { NextResponse } from 'next/server'
import { getAccessToken, uploadToDrive, DRIVE_MAX_BYTES } from '@/lib/drive'

interface IncomingTurn {
  turn_id: string
  transcript?: string
  similarity?: number
  audioBase64?: string
  mimeType?: string
}

async function uploadAudio(
  supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>,
  userId: string,
  taskId: string,
  turnId: string,
  audioBase64: string,
  mimeType: string,
): Promise<{ drive_file_id: string | null; drive_link: string | null }> {
  try {
    const buf = Buffer.from(String(audioBase64), 'base64')
    if (buf.length > DRIVE_MAX_BYTES) return { drive_file_id: null, drive_link: null }
    const { data: tokenRow } = await supabase
      .from('user_drive_tokens')
      .select('encrypted_refresh_token')
      .eq('user_id', userId)
      .maybeSingle()
    if (!tokenRow) return { drive_file_id: null, drive_link: null }
    const token = await getAccessToken(tokenRow.encrypted_refresh_token)
    if (!token) return { drive_file_id: null, drive_link: null }
    const mt = mimeType || 'audio/webm'
    const ext = mt.includes('mp4') ? 'mp4' : 'webm'
    return await uploadToDrive(token, buf, mt, `roleplay-${taskId}-${turnId.slice(0, 8)}-${Date.now()}.${ext}`)
  } catch (e) {
    console.error('[dialog/attempt] drive upload error', e)
    return { drive_file_id: null, drive_link: null }
  }
}

export async function GET(req: Request) {
  try {
    const supabase = await createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const url = new URL(req.url)
    const taskId = url.searchParams.get('taskId')
    if (!taskId) return NextResponse.json({ error: 'taskId required' }, { status: 400 })
    const { data: latest } = await supabase
      .from('dialog_script_submissions')
      .select('*')
      .eq('user_id', user.id)
      .eq('task_id', taskId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    return NextResponse.json({ latest: latest ?? null })
  } catch (e) {
    console.error('[dialog/attempt] get error', e)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}

export async function POST(req: Request) {
  try {
    const supabase = await createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { taskId, turns } = (await req.json()) as { taskId?: string; turns?: IncomingTurn[] }
    if (!taskId) return NextResponse.json({ error: 'taskId required' }, { status: 400 })
    if (!Array.isArray(turns) || turns.length === 0) {
      return NextResponse.json({ error: 'turns required' }, { status: 400 })
    }

    const { data: task } = await supabase
      .from('course_tasks')
      .select('id, course_id, status, dialog_enabled')
      .eq('id', taskId)
      .single()
    if (!task || task.status !== 'published' || !(task as { dialog_enabled?: boolean }).dialog_enabled) {
      return NextResponse.json({ error: 'Roleplay tidak aktif untuk unit ini' }, { status: 400 })
    }
    const { data: enrollment } = await supabase
      .from('enrollments')
      .select('batch_id, course_id')
      .eq('user_id', user.id)
      .eq('course_id', (task as { course_id: string }).course_id)
      .maybeSingle()
    if (!enrollment?.batch_id) return NextResponse.json({ error: 'Not enrolled' }, { status: 403 })
    const batchId = enrollment.batch_id as string

    const { data: script } = await supabase
      .from('dialog_scripts')
      .select('id')
      .eq('task_id', taskId)
      .eq('status', 'published')
      .maybeSingle()
    if (!script) return NextResponse.json({ error: 'Naskah belum tersedia' }, { status: 404 })

    const { data: scriptTurns } = await supabase
      .from('dialog_script_turns')
      .select('id')
      .eq('script_id', script.id)
    const validIds = new Set((scriptTurns ?? []).map((t) => t.id as string))

    const savedTurns: { turn_id: string; transcript: string; similarity: number; drive_file_id: string | null; drive_link: string | null }[] = []
    for (const t of turns.slice(0, 100)) {
      if (!t.turn_id || !validIds.has(t.turn_id)) continue
      const transcript = String(t.transcript ?? '').slice(0, 2000)
      const similarity = typeof t.similarity === 'number' ? Math.max(0, Math.min(1, t.similarity)) : 0
      let drive_file_id: string | null = null
      let drive_link: string | null = null
      if (t.audioBase64) {
        const up = await uploadAudio(supabase, user.id, taskId, t.turn_id, t.audioBase64, t.mimeType || 'audio/webm')
        drive_file_id = up.drive_file_id
        drive_link = up.drive_link
      }
      savedTurns.push({ turn_id: t.turn_id, transcript, similarity, drive_file_id, drive_link })
    }
    if (savedTurns.length === 0) return NextResponse.json({ error: 'Tidak ada baris valid' }, { status: 400 })

    const autoScore = Math.round((savedTurns.reduce((s, x) => s + x.similarity, 0) / savedTurns.length) * 100 * 100) / 100

    const { data: submission, error: insertErr } = await supabase
      .from('dialog_script_submissions')
      .insert({
        user_id: user.id,
        batch_id: batchId,
        task_id: taskId,
        script_id: script.id,
        turns: savedTurns,
        auto_score: autoScore,
        status: 'pending',
      })
      .select('id')
      .single()
    if (insertErr || !submission) {
      console.error('[dialog/attempt] insert error', insertErr)
      return NextResponse.json({ error: 'Failed to save submission' }, { status: 500 })
    }

    // Notify teachers (mirror speaking-review)
    try {
      const { data: teachers } = await supabase
        .from('course_teachers')
        .select('teacher_id')
        .eq('course_id', enrollment.course_id)
      const teacherRowIds = (teachers ?? []).map((t) => t.teacher_id).filter(Boolean)
      if (teacherRowIds.length > 0) {
        const { data: teacherRows } = await supabase.from('teachers').select('user_id').in('id', teacherRowIds)
        const teacherUserIds = (teacherRows ?? []).map((t) => t.user_id).filter(Boolean)
        const { data: studentProfile } = await supabase.from('users').select('display_name').eq('id', user.id).maybeSingle()
        for (const uid of teacherUserIds) {
          await supabase.from('notifications').insert({
            user_id: uid,
            type: 'info',
            template_key: 'assessmentWaiting',
            params: { student: studentProfile?.display_name || 'Student', studentId: user.id, submissionId: submission.id, taskId, batchId, courseId: enrollment.course_id },
            title: `Roleplay Waiting for Review: ${studentProfile?.display_name || 'Student'}`,
            body: `Student ${studentProfile?.display_name || 'Student'} submitted a roleplay recording. Task: ${taskId}, Submission: ${submission.id}`,
            link: `/teacher/nilai?roleplayId=${submission.id}&taskId=${taskId}&batchId=${batchId}&courseId=${enrollment.course_id}`,
          })
        }
      }
    } catch (notifErr) { console.error('[dialog/attempt] notify error', notifErr) }

    return NextResponse.json({ success: true, submission_id: submission.id, auto_score: autoScore })
  } catch (e) {
    console.error('[dialog/attempt] error', e)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
