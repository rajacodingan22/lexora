import { createServerSupabaseClient } from '@/lib/supabase-server'
import { NextResponse } from 'next/server'
import { generateCertificateNumber } from '@/lib/certificate'

export async function POST(req: Request) {
  try {
    const supabase = await createServerSupabaseClient()

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { course_id, language_code } = await req.json()
    if (!course_id) return NextResponse.json({ error: 'course_id is required' }, { status: 400 })

    // Verify enrollment with completed status
    const { data: enrollment } = await supabase
      .from('enrollments')
      .select('id, status')
      .eq('user_id', user.id)
      .eq('course_id', course_id)
      .maybeSingle()

    if (!enrollment) return NextResponse.json({ error: 'Not enrolled in this course' }, { status: 403 })
    if (enrollment.status !== 'completed') return NextResponse.json({ error: 'Course not completed yet' }, { status: 403 })

    // Look up final grade + passing flag from the grade aggregate
    const { data: gradeData } = await supabase
      .from('grade_aggregates')
      .select('weighted_total, is_passing')
      .eq('enrollment_id', enrollment.id)
      .maybeSingle()

    if (!gradeData?.is_passing) {
      return NextResponse.json({ error: 'Grade does not meet passing requirement' }, { status: 403 })
    }

    // Idempotent: jika sertifikat untuk enrollment ini sudah ada, kembalikan
    // yang ada (mencegah duplikasi dari request berulang / klik ganda)
    const { data: existingCert } = await supabase
      .from('certificates')
      .select('*')
      .eq('enrollment_id', enrollment.id)
      .maybeSingle()
    if (existingCert) {
      return NextResponse.json({ data: existingCert })
    }

    const certificateCode = generateCertificateNumber()

    const { data, error } = await supabase
      .from('certificates')
      .insert({
        user_id: user.id,
        course_id,
        enrollment_id: enrollment.id,
        language_code: language_code || null,
        certificate_code: certificateCode,
        final_grade: gradeData?.weighted_total ?? null,
        status: 'generated',
        source: 'generated',
        issue_date: new Date().toISOString().slice(0, 10),
      })
      .select('id, user_id, course_id, enrollment_id, certificate_code, language_code, final_grade, issue_date, status, pdf_url, created_at')
      .single()

    if (error) {
      // The database unique index is the concurrency guard. A second request
      // returns the certificate created by the winner instead of failing.
      if (error.code === '23505') {
        const { data: concurrentCert } = await supabase
          .from('certificates')
          .select('*')
          .eq('enrollment_id', enrollment.id)
          .maybeSingle()
        if (concurrentCert) return NextResponse.json({ data: concurrentCert })
      }
      console.error('Certificate generation API error:', error)
      return NextResponse.json({ error: error.message || 'Operation failed' }, { status: 400 })
    }
    return NextResponse.json({ data })
  } catch (error) {
    console.error('Certificate generation API error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
