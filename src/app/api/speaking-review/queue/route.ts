import { createServerSupabaseClient } from '@/lib/supabase-server'
import { NextResponse } from 'next/server'

export async function GET(req: Request) {
  try {
    const supabase = await createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const url = new URL(req.url)
    const status = url.searchParams.get('status') || 'pending' // pending | reviewed | all

    // Get courses this teacher teaches
    const { data: teacherCourses } = await supabase
      .from('course_teachers')
      .select('course_id')
      .eq('teacher_id', user.id)

    if (!teacherCourses || teacherCourses.length === 0) {
      return NextResponse.json({ submissions: [] })
    }

    const courseIds = teacherCourses.map(c => c.course_id)

    // Get batches for these courses
    const { data: batches } = await supabase
      .from('batches')
      .select('id')
      .in('course_id', courseIds)

    if (!batches || batches.length === 0) {
      return NextResponse.json({ submissions: [] })
    }

    const batchIds = batches.map(b => b.id)

    // Get enrollments for these batches
    const { data: enrollments } = await supabase
      .from('enrollments')
      .select('user_id, batch_id, course_id')
      .in('batch_id', batchIds)
      .in('status', ['active', 'completed'])

    if (!enrollments || enrollments.length === 0) {
      return NextResponse.json({ submissions: [] })
    }

    const userIds = [...new Set(enrollments.map(e => e.user_id))]

    // Get submissions
    let query = supabase
      .from('speaking_review_submissions')
      .select('*')
      .in('user_id', userIds)
      .in('batch_id', batchIds)
      .order('created_at', { ascending: false })

    if (status !== 'all') {
      query = query.eq('review_status', status)
    }

    const { data: submissions, error } = await query.limit(50)
    if (error) {
      console.error('[speaking-review/queue] query error', error)
      return NextResponse.json({ error: 'Query failed' }, { status: 500 })
    }

    // Enrich with student names
    const enriched = await Promise.all((submissions || []).map(async (s) => {
      const { data: student } = await supabase
        .from('users')
        .select('display_name, email')
        .eq('id', s.user_id)
        .maybeSingle()

      return { ...s, student_name: student?.display_name || student?.email || 'Unknown' }
    }))

    return NextResponse.json({ submissions: enriched })
  } catch (e) {
    console.error('[speaking-review/queue] error', e)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
