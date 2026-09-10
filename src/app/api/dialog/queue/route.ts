import { createServerSupabaseClient } from '@/lib/supabase-server'
import { NextResponse } from 'next/server'

export async function GET(req: Request) {
  try {
    const supabase = await createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const url = new URL(req.url)
    const status = url.searchParams.get('status') || 'pending'

    const { data: teacherRow } = await supabase
      .from('teachers')
      .select('id')
      .eq('user_id', user.id)
      .maybeSingle()
    if (!teacherRow) return NextResponse.json({ submissions: [] })

    const { data: teacherCourses } = await supabase
      .from('course_teachers')
      .select('course_id')
      .eq('teacher_id', teacherRow.id)
    if (!teacherCourses || teacherCourses.length === 0) return NextResponse.json({ submissions: [] })
    const courseIds = teacherCourses.map((c) => c.course_id)

    const { data: batches } = await supabase.from('batches').select('id').in('course_id', courseIds)
    if (!batches || batches.length === 0) return NextResponse.json({ submissions: [] })
    const batchIds = batches.map((b) => b.id)

    const { data: enrollments } = await supabase
      .from('enrollments')
      .select('user_id')
      .in('batch_id', batchIds)
      .in('status', ['active', 'completed'])
    if (!enrollments || enrollments.length === 0) return NextResponse.json({ submissions: [] })
    const userIds = [...new Set(enrollments.map((e) => e.user_id))]

    let query = supabase
      .from('dialog_script_submissions')
      .select('*')
      .in('user_id', userIds)
      .in('batch_id', batchIds)
      .order('created_at', { ascending: false })
    if (status !== 'all') query = query.eq('status', status)
    const { data: submissions, error } = await query.limit(50)
    if (error) {
      console.error('[dialog/queue] query error', error)
      return NextResponse.json({ error: 'Query failed' }, { status: 500 })
    }
    if (!submissions || submissions.length === 0) return NextResponse.json({ submissions: [] })

    const subUserIds = [...new Set(submissions.map((s) => s.user_id))]
    const [{ data: students }, { data: tasks }] = await Promise.all([
      supabase.from('users').select('id, display_name, email').in('id', subUserIds),
      supabase.from('course_tasks').select('id, title').in('id', [...new Set(submissions.map((s) => s.task_id))]),
    ])
    const studentMap = new Map((students ?? []).map((s) => [s.id, s]))
    const taskMap = new Map((tasks ?? []).map((t) => [t.id, t]))
    const enriched = submissions.map((s) => ({
      ...s,
      student_name: studentMap.get(s.user_id)?.display_name || studentMap.get(s.user_id)?.email || 'Unknown',
      task_title: (taskMap.get(s.task_id) as { title?: string } | undefined)?.title || '',
    }))
    return NextResponse.json({ submissions: enriched })
  } catch (e) {
    console.error('[dialog/queue] error', e)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
