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
    // Re-review diizinkan: guru boleh koreksi nilai (mis. aksen tidak kebaca sistem).
    const wasReviewed = submission.review_status === 'reviewed'

    const { data: enrollment } = await supabase
      .from('enrollments')
      .select('course_id')
      .eq('user_id', submission.user_id)
      .eq('batch_id', submission.batch_id)
      .maybeSingle()

    if (!enrollment) return NextResponse.json({ error: 'No enrollment found' }, { status: 400 })

    // Resolve auth user → teachers row ID
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

    // Update student_activity_progress with the speaking review score
    if (overallScore !== null) {
      try {
        // Find the activity_progress record for this submission
        const { data: submissionFull } = await supabase
          .from('speaking_review_submissions')
          .select('activity_progress_id, activity_id, user_id, batch_id, task_id')
          .eq('id', id)
          .single()

        if (submissionFull) {
          let progressId = submissionFull.activity_progress_id

          // If no progress ID linked, try to find or create one
          if (!progressId) {
            const { data: existing } = await supabase
              .from('student_activity_progress')
              .select('id')
              .eq('user_id', submissionFull.user_id)
              .eq('activity_id', submissionFull.activity_id)
              .eq('batch_id', submissionFull.batch_id || '')
              .maybeSingle()
            progressId = existing?.id

            if (!progressId) {
              const { data: newProgress } = await supabase
                .from('student_activity_progress')
                .insert({
                  user_id: submissionFull.user_id,
                  activity_id: submissionFull.activity_id,
                  batch_id: submissionFull.batch_id,
                  task_id: submissionFull.task_id,
                  status: 'completed',
                  score: overallScore,
                })
                .select('id')
                .single()
              progressId = newProgress?.id
            }
          }

          if (progressId) {
            // Upsert the score into activity progress
            await supabase
              .from('student_activity_progress')
              .update({ score: overallScore, status: 'completed' })
              .eq('id', progressId)

            // Link the submission to the progress record if not already linked
            if (!submissionFull.activity_progress_id) {
              await supabase
                .from('speaking_review_submissions')
                .update({ activity_progress_id: progressId })
                .eq('id', id)
            }

            // Re-roll-up lesson progress (recalculate score from all activities)
            if (submissionFull.activity_id) {
              const { data: activityRow } = await supabase
                .from('lesson_activities')
                .select('lesson_id')
                .eq('id', submissionFull.activity_id)
                .maybeSingle()

              if (activityRow) {
                const { data: allActProgress } = await supabase
                  .from('student_activity_progress')
                  .select('score, status')
                  .eq('user_id', submissionFull.user_id)
                  .eq('batch_id', submissionFull.batch_id || '')
                  .eq('lesson_id', activityRow.lesson_id)

                const scores = (allActProgress || [])
                  .filter(p => typeof p.score === 'number' && p.score > 0)
                  .map(p => p.score as number)
                const lessonScore = scores.length > 0
                  ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length)
                  : overallScore

                const completedCount = (allActProgress || []).filter(p => p.status === 'completed').length
                const { count: totalCount } = await supabase
                  .from('lesson_activities')
                  .select('id', { count: 'exact', head: true })
                  .eq('lesson_id', activityRow.lesson_id)
                  .eq('status', 'published')

                const lessonCompleted = completedCount === (totalCount ?? 0) && (totalCount ?? 0) > 0

                await supabase
                  .from('student_lesson_progress')
                  .update({ score: lessonScore, status: lessonCompleted ? 'completed' : 'in_progress' })
                  .eq('user_id', submissionFull.user_id)
                  .eq('batch_id', submissionFull.batch_id || '')
                  .eq('lesson_id', activityRow.lesson_id)
              }
            }
          }

          // Trigger grade recalculation for this enrollment
          const { data: enrollmentForGrade } = await supabase
            .from('enrollments')
            .select('id')
            .eq('user_id', submissionFull.user_id)
            .eq('batch_id', submissionFull.batch_id)
            .maybeSingle()

          if (enrollmentForGrade) {
            await supabase.rpc('calculate_grade', { p_enrollment_id: enrollmentForGrade.id })
          }
        }
      } catch (progressErr) {
        console.error('[speaking-review] progress update error', progressErr)
        // Non-fatal: grade still works via client-side computation
      }
    }

    // Notify student hanya saat review PERTAMA — re-review tidak spam notif
    try {
      if (!wasReviewed) {
        const { data: full } = await supabase.from('speaking_review_submissions').select('activity_id, task_id, batch_id').eq('id', id).maybeSingle()
        await supabase.from('notifications').insert({
          user_id: submission.user_id,
          type: 'grade',
          template_key: 'speakingReviewed',
          params: { submissionId: id, activityId: full?.activity_id || '', taskId: full?.task_id || '', batchId: full?.batch_id || '', courseId: enrollment.course_id },
          title: 'Speaking Review Completed',
          body: `Your speaking submission has been reviewed. Overall score: ${overallScore ?? '-'}. Check feedback.`,
          link: `/student/kursus/${enrollment.course_id}/pertemuan?submissionId=${id}&activityId=${full?.activity_id || ''}`,
        })
      }
    } catch (e) { console.error('[speaking-review] notify error', e) }

    // Audit trail (re-review tercatat terpisah)
    try {
      await supabase.from('audit_logs').insert({
        action: wasReviewed ? 'speaking.re_reviewed' : 'speaking.reviewed',
        user_id: user.id,
        details: { submission_id: id, student_id: submission.user_id, overall_score: overallScore },
      })
    } catch (auditErr) {
      console.error('[audit] speaking review failed:', auditErr)
    }

    return NextResponse.json({ success: true, overall_score: overallScore, re_review: wasReviewed })
  } catch (e) {
    console.error('[speaking-review] error', e)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
