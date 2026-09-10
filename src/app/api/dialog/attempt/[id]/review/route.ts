import { createServerSupabaseClient } from '@/lib/supabase-server'
import { NextResponse } from 'next/server'

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const supabase = await createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { id } = await params
    const { scorePronunciation, scoreFluency, scoreConfidence, scoreComprehension, teacherFeedback } = await req.json()

    const { data: submission } = await supabase
      .from('dialog_script_submissions')
      .select('user_id, batch_id, task_id, status')
      .eq('id', id)
      .single()
    if (!submission) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    const wasReviewed = submission.status === 'reviewed'

    const { data: enrollment } = await supabase
      .from('enrollments')
      .select('id, course_id')
      .eq('user_id', submission.user_id)
      .eq('batch_id', submission.batch_id)
      .maybeSingle()
    if (!enrollment) return NextResponse.json({ error: 'No enrollment found' }, { status: 400 })

    const { data: teacherRow } = await supabase
      .from('teachers')
      .select('id')
      .eq('user_id', user.id)
      .maybeSingle()
    if (!teacherRow) {
      const { data: isAdmin } = await supabase.rpc('is_admin')
      if (!isAdmin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    } else {
      const { data: isTeacher } = await supabase
        .from('course_teachers')
        .select('teacher_id')
        .eq('course_id', enrollment.course_id)
        .eq('teacher_id', teacherRow.id)
        .maybeSingle()
      const { data: isAdmin } = await supabase.rpc('is_admin')
      if (!isTeacher && !isAdmin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const scores = [scorePronunciation, scoreFluency, scoreConfidence, scoreComprehension].filter((s) => typeof s === 'number')
    const overallScore = scores.length > 0 ? Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 100) / 100 : null

    const { error: updateErr } = await supabase
      .from('dialog_script_submissions')
      .update({
        status: 'reviewed',
        reviewed_by: user.id,
        reviewed_at: new Date().toISOString(),
        score_pronunciation: scorePronunciation,
        score_fluency: scoreFluency,
        score_confidence: scoreConfidence,
        score_comprehension: scoreComprehension,
        overall_score: overallScore,
        teacher_feedback: teacherFeedback,
      })
      .eq('id', id)
    if (updateErr) {
      console.error('[dialog/review] update error', updateErr)
      return NextResponse.json({ error: 'Failed to save review' }, { status: 500 })
    }

    // Rollup task progress: dialog requirement terpenuhi saat attempt direview.
    // Task completed jika semua activity published sudah completed.
    try {
      const { data: lessons } = await supabase.from('task_lessons').select('id').eq('task_id', submission.task_id).eq('status', 'published')
      const lessonIds = (lessons ?? []).map((l) => l.id)
      let totalActs = 0
      let completedActs = 0
      if (lessonIds.length > 0) {
        const { data: acts } = await supabase.from('lesson_activities').select('id').in('lesson_id', lessonIds).eq('status', 'published')
        totalActs = (acts ?? []).length
        if (totalActs > 0) {
          const { data: prog } = await supabase
            .from('student_activity_progress')
            .select('status')
            .eq('user_id', submission.user_id)
            .eq('batch_id', submission.batch_id)
            .in('activity_id', (acts ?? []).map((a) => a.id))
          completedActs = (prog ?? []).filter((p) => p.status === 'completed').length
        }
      }
      const shouldComplete = totalActs === 0 || completedActs === totalActs
      await supabase.from('student_task_progress').upsert({
        user_id: submission.user_id,
        batch_id: submission.batch_id,
        task_id: submission.task_id,
        status: shouldComplete ? 'completed' : 'in_progress',
        total_lessons: lessonIds.length,
        total_activities: totalActs,
        completed_activities: completedActs,
        completed_at: shouldComplete ? new Date().toISOString() : null,
      }, { onConflict: 'user_id,batch_id,task_id' })
      await supabase.rpc('calculate_grade', { p_enrollment_id: enrollment.id })
    } catch (progressErr) {
      console.error('[dialog/review] progress update error', progressErr)
    }

    try {
      if (!wasReviewed) {
        await supabase.from('notifications').insert({
          user_id: submission.user_id,
          type: 'grade',
          template_key: 'roleplayReviewed',
          params: { submissionId: id, taskId: submission.task_id, batchId: submission.batch_id, courseId: enrollment.course_id },
          title: 'Roleplay Review Completed',
          body: `Your roleplay submission has been reviewed. Overall score: ${overallScore ?? '-'}. Check feedback.`,
          link: `/student/kursus/${enrollment.course_id}`,
        })
      }
    } catch (e) { console.error('[dialog/review] notify error', e) }

    try {
      await supabase.from('audit_logs').insert({
        action: wasReviewed ? 'dialog_roleplay.re_reviewed' : 'dialog_roleplay.reviewed',
        user_id: user.id,
        details: { submission_id: id, student_id: submission.user_id, overall_score: overallScore },
      })
    } catch (auditErr) {
      console.error('[audit] roleplay review failed:', auditErr)
    }

    return NextResponse.json({ success: true, overall_score: overallScore, re_review: wasReviewed })
  } catch (e) {
    console.error('[dialog/review] error', e)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
