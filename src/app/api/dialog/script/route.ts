import { createServerSupabaseClient } from '@/lib/supabase-server'
import { NextResponse } from 'next/server'

async function resolveBatch(supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>, userId: string, taskId: string) {
  const { data: task } = await supabase
    .from('course_tasks')
    .select('id, course_id, status, dialog_enabled')
    .eq('id', taskId)
    .single()
  if (!task || task.status !== 'published' || !(task as { dialog_enabled?: boolean }).dialog_enabled) {
    return { error: 'Roleplay tidak aktif untuk unit ini', status: 400 as const }
  }
  const { data: enrollment } = await supabase
    .from('enrollments')
    .select('batch_id')
    .eq('user_id', userId)
    .eq('course_id', (task as { course_id: string }).course_id)
    .maybeSingle()
  if (!enrollment?.batch_id) {
    return { error: 'Not enrolled in this course or no batch assigned', status: 403 as const }
  }
  const batchId = enrollment.batch_id as string
  const { data: batchTask } = await supabase
    .from('batch_tasks')
    .select('status')
    .eq('batch_id', batchId)
    .eq('task_id', taskId)
    .maybeSingle()
  if (!batchTask || batchTask.status !== 'published') {
    return { error: 'Task is not assigned to your batch', status: 403 as const }
  }
  return { batchId }
}

export async function GET(req: Request) {
  try {
    const supabase = await createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const url = new URL(req.url)
    const taskId = url.searchParams.get('taskId')
    if (!taskId) return NextResponse.json({ error: 'taskId required' }, { status: 400 })

    const resolved = await resolveBatch(supabase, user.id, taskId)
    if ('error' in resolved) return NextResponse.json({ error: resolved.error }, { status: resolved.status })
    const { batchId } = resolved

    const { data: script } = await supabase
      .from('dialog_scripts')
      .select('*')
      .eq('task_id', taskId)
      .eq('status', 'published')
      .maybeSingle()
    if (!script) return NextResponse.json({ error: 'Naskah belum tersedia untuk unit ini', status: 404 })

    const { data: turns } = await supabase
      .from('dialog_script_turns')
      .select('*')
      .eq('script_id', script.id)
      .order('turn_number', { ascending: true })

    const { data: latest } = await supabase
      .from('dialog_script_submissions')
      .select('*')
      .eq('user_id', user.id)
      .eq('batch_id', batchId)
      .eq('task_id', taskId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    return NextResponse.json({ script, turns: turns ?? [], latest: latest ?? null })
  } catch (e) {
    console.error('[dialog/script] error', e)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
