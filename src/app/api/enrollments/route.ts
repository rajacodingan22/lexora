import { createServerSupabaseClient } from '@/lib/supabase-server'
import { NextResponse } from 'next/server'

export async function POST(req: Request) {
  try {
    const supabase = await createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { courseId } = await req.json()
    if (!courseId || typeof courseId !== 'string') {
      return NextResponse.json({ error: 'courseId is required' }, { status: 400 })
    }

    const { data: result, error } = await supabase.rpc('create_course_enrollment', {
      p_course_id: courseId,
    })

    if (error) {
      console.error('Enrollment API error:', JSON.stringify({ message: error.message, code: error.code, hint: error.hint, details: error.details }))
      return NextResponse.json({ error: error.message || 'Gagal mendaftar', code: error.code, hint: error.hint }, { status: 400 })
    }

    const enrollment = result?.enrollment
    const payment = result?.payment
    const batch = result?.batch
    const courseTitle = result?.course_title || 'Kelas'
    const waitlisted = result?.waitlisted === true

    if (waitlisted) {
      await supabase.from('notifications').insert({
        user_id: user.id,
        type: 'info',
        template_key: 'trialWaitlist',
        params: { course: courseTitle, courseId },
        title: 'Trial Waitlist — You are on the waiting list',
        body: `You are on the waiting list for "${courseTitle}". We will notify you when a slot opens.`,
        link: `/student/kursus/${courseId}`,
        is_read: false,
      })

      await supabase.rpc('notify_admins_for_course', {
        p_course_id: courseId,
        p_title: 'Student on Waiting List',
        p_body: `Student on waiting list for "${courseTitle}". Please allocate a slot.`,
        p_link: `/admin/waiting-list?courseId=${courseId}`,
      })

      return NextResponse.json({
        data: { status: 'waitlisted', course_title: courseTitle },
      })
    }

    const batchName = batch?.name || ''
    const programName = result?.program_name || ''

    if (payment) {
      await supabase.from('notifications').insert({
        user_id: user.id,
        type: 'info',
        template_key: 'invoicePending',
        params: {
          course: courseTitle + (programName ? ` (${programName})` : ''),
          batch: batchName || '',
          due: String(payment.due_date || '').slice(0, 10),
          courseId,
          batchId: batch?.id || '',
          invoice: payment.invoice_number || '',
        },
        title: 'Payment Pending — Complete Your Payment',
        body: `You are enrolled in "${courseTitle}"${batchName ? ` — ${batchName}` : ''}. Please complete payment before ${String(payment.due_date || '').slice(0, 10)}. Invoice: ${payment.invoice_number || ''}`,
        link: `/student/pembayaran?invoice=${payment.invoice_number || ''}&courseId=${courseId}`,
        is_read: false,
      })
    } else {
      await supabase.from('notifications').insert({
        user_id: user.id,
        type: 'info',
        template_key: 'studentEnrolled',
        params: {
          course: courseTitle + (programName ? ` (${programName})` : ''),
          batchSuffix: batchName ? ` — ${batchName}` : '',
          courseId,
          batchId: batch?.id || '',
        },
        title: 'Enrolled Successfully — Welcome!',
        body: `You are enrolled in "${courseTitle}"${batchName ? ` — ${batchName}` : ''}. Start learning now.`,
        link: `/student/kursus/${courseId}`,
        is_read: false,
      })
    }

    const { data: profile } = await supabase
      .from('users')
      .select('display_name')
      .eq('id', user.id)
      .maybeSingle()

    const studentName = profile?.display_name || user.email?.split('@')[0] || 'Siswa'

    await supabase.rpc('notify_course_teachers', {
      p_course_id: courseId,
      p_title: 'New Student Joined — ' + studentName,
      p_body: `${studentName} just joined "${courseTitle}"${batchName ? ` — ${batchName}` : ''}.`,
      p_link: `/teacher/kelas?courseId=${courseId}&batchId=${batch?.id || ''}`,
      p_template_key: 'studentJoined',
      p_params: { student: studentName, course: courseTitle, courseId, batchId: batch?.id || '' },
    })

    await supabase.rpc('notify_admins_for_course', {
      p_course_id: courseId,
      p_title: payment ? 'Payment Awaiting Verification' : 'New Student Enrolled',
      p_body: payment
        ? `${studentName} enrolled in "${courseTitle}"${batchName ? ` — ${batchName}` : ''} and is awaiting payment verification.`
        : `${studentName} just enrolled in "${courseTitle}"${batchName ? ` — ${batchName}` : ''}.`,
      p_link: payment ? `/admin/verifikasi?courseId=${courseId}&invoice=${payment.invoice_number || ''}` : `/admin/users?courseId=${courseId}`,
    })

    return NextResponse.json({
      data: {
        status: payment ? 'pending_payment' : 'active',
        course_title: courseTitle,
        program_name: programName,
        batch_name: batchName,
        enrollment,
        batch,
        payment,
      },
    })
  } catch (error) {
    console.error('Enrollment API error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function GET() {
  try {
    const supabase = await createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data, error } = await supabase
      .from('enrollments')
      .select(`
        id, user_id, course_id, batch_id, status, enrolled_at, completed_at,
        course:courses(
          id, program_id, language_code, level_id,
          title, description, max_students, status, mode, starts_at, ends_at, price, meeting_count, project_count, is_try_class, created_at, updated_at,
          course_teachers:course_teachers(teacher:teachers(user:users(id, display_name, photo_url))),
          program:programs(id, name, slug, language_code, program_type, is_active),
          language:languages(code, name, native_name, flag_emoji, is_rtl, level_framework, is_active)
        ),
        batch:batches(id, name, code, start_date, end_date, capacity, current_students, status)
      `)
      .eq('user_id', user.id)
      .order('enrolled_at', { ascending: false })

    if (error) {
      console.error('Enrollment API error:', error)
      return NextResponse.json({ error: error.message || 'Operation failed' }, { status: 400 })
    }

    return NextResponse.json({ data })
  } catch (error) {
    console.error('Enrollment API error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
