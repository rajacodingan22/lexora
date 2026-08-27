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
      console.error('Enrollment API error:', error)
      return NextResponse.json({ error: error.message || 'Gagal mendaftar' }, { status: 400 })
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
        params: { course: courseTitle },
        title: 'Menunggu slot trial class',
        body: `Kamu masuk waiting list untuk ${courseTitle}. Admin akan menghubungi jika slot tersedia.`,
        link: '/student/kursus',
        is_read: false,
      })

      await supabase.rpc('notify_admins_for_course', {
        p_course_id: courseId,
        p_title: 'Siswa masuk waiting list',
        p_body: `Ada siswa masuk waiting list untuk ${courseTitle}. Segera cek dan alokasikan slot.`,
        p_link: '/admin/waiting-list',
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
        },
        title: 'Tagihan menunggu pembayaran',
        body: `Kamu terdaftar di ${courseTitle}${programName ? ' (' + programName + ')' : ''}${batchName ? ' - ' + batchName : ''}. Lanjutkan pembayaran sebelum ${String(payment.due_date || '').slice(0, 10)}.`,
        link: '/student/pembayaran',
        is_read: false,
      })
    } else {
      await supabase.from('notifications').insert({
        user_id: user.id,
        type: 'info',
        template_key: 'studentEnrolled',
        params: {
          course: courseTitle + (programName ? ` (${programName})` : ''),
          batchSuffix: batchName ? ` di ${batchName}` : '',
        },
        title: '🎉 Selamat! Kamu berhasil masuk kelas',
        body: `Kamu berhasil masuk ke ${courseTitle}${programName ? ' (' + programName + ')' : ''}${batchName ? ' di ' + batchName : ''}. Selamat belajar!`,
        link: '/student/kursus',
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
      p_title: 'Siswa baru bergabung',
      p_body: `${studentName} baru saja bergabung di kelas.`,
      p_link: '/teacher/kelas',
      p_template_key: 'studentJoined',
      p_params: { student: studentName },
    })

    await supabase.rpc('notify_admins_for_course', {
      p_course_id: courseId,
      p_title: payment ? 'Pembayaran menunggu verifikasi' : 'Siswa baru mendaftar',
      p_body: payment
        ? `${studentName} mendaftar di ${courseTitle}${batchName ? ' - ' + batchName : ''} dan menunggu verifikasi pembayaran.`
        : `${studentName} baru saja mendaftar di ${courseTitle}${batchName ? ' - ' + batchName : ''}.`,
      p_link: payment ? '/admin/verifikasi' : '/admin/users',
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
