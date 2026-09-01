import { createServerSupabaseClient } from '@/lib/supabase-server'
import { NextResponse } from 'next/server'

export async function POST() {
  try {
    const supabase = await createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data: course, error: courseError } = await supabase
      .from('courses')
      .select('id, title, price, starts_at, ends_at, max_students')
      .eq('is_try_class', true)
      .eq('status', 'active')
      .order('starts_at', { ascending: true })
      .limit(1)
      .maybeSingle()

    if (courseError || !course) {
      return NextResponse.json({ error: 'Trial class belum tersedia' }, { status: 404 })
    }

    // Batch allocation, enrollment activation, and old waiting-list resolution
    // happen atomically in the database RPC.
    const { data: result, error } = await supabase.rpc('create_course_enrollment', {
      p_course_id: course.id,
    })

    if (error) {
      console.error('Claim trial error:', error)
      return NextResponse.json({ error: error.message || 'Gagal mengaktifkan trial class' }, { status: 400 })
    }

    const enrollment = result?.enrollment
    const batch = result?.batch || null
    const batchName = batch?.name?.toString() || ''
    const courseTitle = result?.course_title || 'Trial Class'

    if (!enrollment) {
      return NextResponse.json({ error: 'Trial class belum dapat diaktifkan' }, { status: 409 })
    }

    const { error: notificationError } = await supabase.from('notifications').insert({
      user_id: user.id,
      type: 'info',
      template_key: 'studentEnrolled',
      params: { course: courseTitle, courseId: course.id, batchSuffix: batchName ? ` — ${batchName}` : '', batchId: batch?.id || '' },
      title: 'Trial Class Active — Welcome!',
      body: `You joined "${courseTitle}"${batchName ? ` — ${batchName}` : ''}. Start learning now.`,
      link: `/student/kursus/${course.id}`,
      is_read: false,
    })
    if (notificationError) console.error('Trial notification error:', notificationError)

    return NextResponse.json({
      data: {
        status: enrollment.status || 'active',
        enrollment,
        batch,
        course,
        batchCreated: batch?.created === true,
      },
    })
  } catch (error) {
    console.error('Claim trial API error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
