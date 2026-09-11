import { createServerSupabaseClient } from '@/lib/supabase-server'
import { NextResponse } from 'next/server'

function generateInvoice(): string {
  const ts = Date.now().toString(36).toUpperCase()
  const rand = Math.random().toString(36).slice(2, 6).toUpperCase()
  return `INV-${ts}-${rand}`
}

export async function POST(req: Request) {
  try {
    const supabase = await createServerSupabaseClient()

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data: profile } = await supabase
      .from('users')
      .select('role')
      .eq('id', user.id)
      .maybeSingle()
    if (profile?.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { waitingId } = await req.json()
    if (!waitingId) {
      return NextResponse.json({ error: 'waitingId is required' }, { status: 400 })
    }

    // 1. Ambil entry waiting list
    const { data: waiting, error: waitError } = await supabase
      .from('waiting_list')
      .select('id, course_id, user_id, status')
      .eq('id', waitingId)
      .eq('status', 'waiting')
      .maybeSingle()
    if (waitError || !waiting) {
      return NextResponse.json({ error: 'Entry waiting list tidak ditemukan atau sudah diproses' }, { status: 404 })
    }

    // 2. Ambil data kelas
    const { data: course, error: courseError } = await supabase
      .from('courses')
      .select('id, title, price, status, starts_at, ends_at, max_students')
      .eq('id', waiting.course_id)
      .single()
    if (courseError || !course) {
      return NextResponse.json({ error: 'Kelas tidak ditemukan' }, { status: 404 })
    }
    if (course.status !== 'active') {
      return NextResponse.json({ error: 'Kelas tidak aktif' }, { status: 400 })
    }

    // 3. Cek apakah siswa sudah terdaftar untuk kelas ini
    const { data: existing } = await supabase
      .from('enrollments')
      .select('id, status')
      .eq('user_id', waiting.user_id)
      .eq('course_id', waiting.course_id)
      .in('status', ['active', 'pending'])
      .maybeSingle()
    if (existing) {
      await supabase.from('waiting_list').update({ status: 'resolved' }).eq('id', waiting.id)
      return NextResponse.json({ data: { status: 'already_enrolled', enrollment: existing } })
    }

    // 4. Auto-assign batch (atomik di DB): batch berikutnya yang punya slot,
    //    atau buat batch baru otomatis jika semua penuh/sudah mulai
    const { data: rpcRows, error: rpcError } = await supabase.rpc('find_or_create_batch_serialized', {
      p_course_id: waiting.course_id,
    })
    if (rpcError || !rpcRows?.[0]) {
      console.error('find_or_create_batch error:', rpcError)
      return NextResponse.json({ error: rpcError?.message || 'Gagal mengatur batch kelas' }, { status: 400 })
    }
    const r = rpcRows[0]
    const nextBatch = {
      id: r.batch_id,
      name: r.batch_name,
      code: r.code,
      start_date: r.start_date,
      end_date: r.end_date,
      capacity: r.capacity,
      current_students: r.current_students,
      status: r.status,
    }

    const price = Number(course.price) || 0
    const courseTitle = (course.title as { id?: string; en?: string } | null)?.id
      || (course.title as { en?: string } | null)?.en
      || 'Kelas'

    const now = new Date().toISOString()

    // 5. Buat enrollment (aktif jika gratis, pending jika berbayar)
    const { data: enrollment, error: enrollError } = await supabase
      .from('enrollments')
      .insert({
        user_id: waiting.user_id,
        course_id: waiting.course_id,
        batch_id: nextBatch.id,
        status: price === 0 ? 'active' : 'pending',
        enrolled_at: now,
      })
      .select('id, user_id, course_id, batch_id, status, enrolled_at')
      .single()
    if (enrollError) {
      console.error('Enrollment error:', enrollError)
      return NextResponse.json({ error: enrollError.message || 'Gagal membuat pendaftaran' }, { status: 400 })
    }

    // 6. Kelas berbayar → buat tagihan
    if (price > 0) {
      const { data: payment, error: payError } = await supabase
        .from('payments')
        .insert({
          user_id: waiting.user_id,
          enrollment_id: enrollment.id,
          invoice_number: generateInvoice(),
          amount: price,
          description: `Pembayaran kelas "${courseTitle}" (Batch ${nextBatch.name || ''})`,
          status: 'pending',
          due_date: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString(),
        })
        .select('id, invoice_number, amount, status, due_date')
        .single()
      if (payError) {
        console.error('Payment creation error:', payError)
        await supabase.from('enrollments').delete().eq('id', enrollment.id)
        return NextResponse.json({ error: payError.message || 'Gagal membuat tagihan' }, { status: 400 })
      }

      await supabase.from('notifications').insert({
        user_id: waiting.user_id,
        type: 'info',
        template_key: 'studentEnrolled',
        params: {
          course: courseTitle,
          courseId: waiting.course_id,
          batchSuffix: nextBatch.name ? ` — ${nextBatch.name}` : '',
          batchId: nextBatch.id,
          invoice: (payment as any)?.invoice_number || '',
        },
        title: 'Class Slot Available — Action Required',
        body: `Great news! You got a slot in "${courseTitle}" — ${nextBatch.name || ''}. Please complete payment before ${payment.due_date?.slice(0, 10)}.`,
        link: `/student/pembayaran?invoice=${(payment as any)?.invoice_number || ''}&courseId=${waiting.course_id}`,
        is_read: false,
      })
    } else {
      await supabase.from('notifications').insert({
        user_id: waiting.user_id,
        type: 'info',
        template_key: 'studentEnrolled',
        params: {
          course: courseTitle,
          courseId: waiting.course_id,
          batchSuffix: nextBatch.name ? ` — ${nextBatch.name}` : '',
          batchId: nextBatch.id,
        },
        title: 'Class Slot Available — Welcome!',
        body: `Great news! You got a slot in "${courseTitle}" — ${nextBatch.name || ''}. Start learning now.`,
        link: `/student/dashboard`,
        is_read: false,
      })
    }

    // 7. Tandai waiting list selesai
    await supabase.from('waiting_list').update({ status: 'resolved' }).eq('id', waiting.id)

    // 7b. Audit trail (fire-and-forget)
    try {
      const { data: { user: actor } } = await supabase.auth.getUser()
      if (actor) {
        await supabase.from('audit_logs').insert({
          action: 'waiting_list.assigned',
          user_id: actor.id,
          role: 'admin',
          details: { waiting_id: waiting.id, student_id: waiting.user_id, course_id: waiting.course_id, batch_id: nextBatch.id },
        })
      }
    } catch (auditErr) {
      console.error('[audit] waiting_list.assigned failed:', auditErr)
    }

    // 8. Notifikasi teacher: ada siswa baru dapat slot
    const { data: profiles } = await supabase
      .from('users')
      .select('display_name')
      .eq('id', waiting.user_id)
      .maybeSingle()
    const studentName = (profiles as any)?.display_name || 'Siswa'
    const { data: teacherLinks } = await supabase
      .from('course_teachers')
      .select('teacher:teachers(user_id)')
      .eq('course_id', waiting.course_id)
    for (const link of (teacherLinks || []) as any[]) {
      const tid = (link.teacher as any)?.user_id
      if (tid) {
        await supabase.from('notifications').insert({
          user_id: tid,
          type: 'info',
          template_key: 'studentJoinedSlot',
          params: { student: studentName, course: courseTitle, courseId: waiting.course_id, batchId: nextBatch.id },
          title: `New Student Joined — ${studentName}`,
          body: `${studentName} just got a slot in "${courseTitle}" — ${nextBatch.name || ''}.`,
          link: `/teacher/kelas?courseId=${waiting.course_id}&batchId=${nextBatch.id}`,
          is_read: false,
        })
      }
    }

    return NextResponse.json({
      data: {
        status: price === 0 ? 'active' : 'pending_payment',
        enrollment,
        batch: nextBatch,
      },
    })
  } catch (error) {
    console.error('Waiting list assign API error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
