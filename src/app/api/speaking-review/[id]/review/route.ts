import { createServerSupabaseClient } from '@/lib/supabase-server'
import { NextResponse } from 'next/server'

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const supabase = await createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { id } = await params
    const { scoreFluency, scoreIntonation, scorePronunciation, scoreConfidence, scoreComprehension, teacherFeedback } = await req.json()

    // Verify teacher has access to this student
    const { data: submission } = await supabase
      .from('speaking_review_submissions')
      .select('user_id, batch_id, review_status')
      .eq('id', id)
      .single()

    if (!submission) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    if (submission.review_status === 'reviewed') return NextResponse.json({ error: 'Already reviewed' }, { status: 400 })

    const { data: enrollment } = await supabase
      .from('enrollments')
      .select('course_id')
      .eq('user_id', submission.user_id)
      .eq('batch_id', submission.batch_id)
      .maybeSingle()

    if (!enrollment) return NextResponse.json({ error: 'No enrollment found' }, { status: 400 })

    const { data: isTeacher } = await supabase
      .from('course_teachers')
      .select('teacher_id')
      .eq('course_id', enrollment.course_id)
      .eq('teacher_id', user.id)
      .maybeSingle()

    const { data: isAdmin } = await supabase.rpc('is_admin')
    if (!isTeacher && !isAdmin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    // Calculate overall
    const scores = [scoreFluency, scoreIntonation, scorePronunciation, scoreConfidence, scoreComprehension].filter(s => typeof s === 'number')
    const overallScore = scores.length > 0 ? Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 100) / 100 : null

    const { error: updateErr } = await supabase
      .from('speaking_review_submissions')
      .update({
        review_status: 'reviewed',
        reviewed_by: user.id,
        reviewed_at: new Date().toISOString(),
        score_fluency: scoreFluency,
        score_intonation: scoreIntonation,
        score_pronunciation: scorePronunciation,
        score_confidence: scoreConfidence,
        score_comprehension: scoreComprehension,
        overall_score: overallScore,
        teacher_feedback: teacherFeedback,
      })
      .eq('id', id)

    if (updateErr) {
      console.error('[speaking-review] update error', updateErr)
      return NextResponse.json({ error: 'Failed to save review' }, { status: 500 })
    }

    // Notify student
    try {
      await supabase.from('notifications').insert({
        user_id: submission.user_id,
        type: 'grade',
        title: 'Review Berbicara Selesai',
        body: 'Guru sudah memberikan review untuk rekaman berbicaramu.',
        link: '/student/kursus',
      })
    } catch (e) { console.error('[speaking-review] notify error', e) }

    return NextResponse.json({ success: true, overall_score: overallScore })
  } catch (e) {
    console.error('[speaking-review] error', e)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
