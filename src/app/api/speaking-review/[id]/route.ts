import { createServerSupabaseClient } from '@/lib/supabase-server'
import { NextResponse } from 'next/server'

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const supabase = await createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { id } = await params

    const { data, error } = await supabase
      .from('speaking_review_submissions')
      .select('*')
      .eq('id', id)
      .single()

    if (error || !data) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    // Check access: owner, teacher, or admin
    if (data.user_id !== user.id) {
      const { data: enrollment } = await supabase
        .from('enrollments')
        .select('course_id')
        .eq('user_id', data.user_id)
        .eq('batch_id', data.batch_id)
        .maybeSingle()

      if (enrollment) {
        const { data: isTeacher } = await supabase
          .from('course_teachers')
          .select('teacher_id')
          .eq('course_id', enrollment.course_id)
          .eq('teacher_id', user.id)
          .maybeSingle()

        if (!isTeacher) {
          const { data: isAdmin } = await supabase.rpc('is_admin')
          if (!isAdmin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
        }
      } else {
        const { data: isAdmin } = await supabase.rpc('is_admin')
        if (!isAdmin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
      }
    }

    return NextResponse.json(data)
  } catch (e) {
    console.error('[speaking-review] error', e)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
