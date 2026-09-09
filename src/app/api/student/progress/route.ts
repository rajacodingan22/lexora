import { createServerSupabaseClient } from '@/lib/supabase-server'
import { NextResponse } from 'next/server'

export async function POST(req: Request) {
  try {
    const supabase = await createServerSupabaseClient()

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await req.json()
    const { activityId, lessonId, taskId, score, answers } = body

    if (!activityId || !lessonId || !taskId) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    if (typeof score !== 'number' || score < 0 || score > 100) {
      return NextResponse.json({ error: 'Invalid score' }, { status: 400 })
    }

    const { data: activity, error: activityError } = await supabase
      .from('lesson_activities')
      .select('id, lesson_id, status')
      .eq('id', activityId)
      .single()

    if (activityError || !activity) {
      return NextResponse.json({ error: 'Activity not found' }, { status: 404 })
    }

    if (activity.lesson_id !== lessonId) {
      return NextResponse.json({ error: 'Activity does not belong to this lesson' }, { status: 400 })
    }

    const { data: lesson, error: lessonError } = await supabase
      .from('task_lessons')
      .select('id, task_id, status')
      .eq('id', lessonId)
      .single()

    if (lessonError || !lesson) {
      return NextResponse.json({ error: 'Lesson not found' }, { status: 404 })
    }

    if (lesson.task_id !== taskId) {
      return NextResponse.json({ error: 'Lesson does not belong to this task' }, { status: 400 })
    }

    const { data: task, error: taskError } = await supabase
      .from('course_tasks')
      .select('id, course_id, status, min_completion_score, activity_unlock_rule, lesson_unlock_rule, required_lesson_score, dialog_enabled')
      .eq('id', taskId)
      .single()

    if (taskError || !task) {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 })
    }

    if (task.status !== 'published') {
      return NextResponse.json({ error: 'Task is not published' }, { status: 400 })
    }

    // Validate answers vs score to prevent cheating: if aiScore present, score must match
    if (answers && typeof answers === 'object') {
      const a = answers as Record<string, unknown>
      if (typeof a.aiScore === 'number' && a.aiScore !== score) {
        return NextResponse.json({ error: 'Score does not match AI grading result' }, { status: 400 })
      }
      // JSONB size guard: stringify length < 20KB
      const jsonLen = JSON.stringify(answers).length
      if (jsonLen > 20000) {
        return NextResponse.json({ error: 'Answers payload too large' }, { status: 400 })
      }
    }

    const { data: enrollment, error: enrollmentError } = await supabase
      .from('enrollments')
      .select('batch_id')
      .eq('user_id', user.id)
      .eq('course_id', (task as { course_id: string }).course_id)
      .maybeSingle()

    if (enrollmentError) {
      console.error('Enrollment lookup error', enrollmentError)
      return NextResponse.json({ error: 'Failed to verify enrollment' }, { status: 500 })
    }

    if (!enrollment?.batch_id) {
      return NextResponse.json({ error: 'Not enrolled in this course or no batch assigned' }, { status: 403 })
    }

    const batchId = enrollment.batch_id as string

    // Verify task is assigned to this batch and within availability window
    const { data: batchTask } = await supabase
      .from('batch_tasks')
      .select('status, availability_start, availability_end')
      .eq('batch_id', batchId)
      .eq('task_id', taskId)
      .maybeSingle()

    if (!batchTask || batchTask.status !== 'published') {
      return NextResponse.json({ error: 'Task is not assigned to your batch' }, { status: 403 })
    }
    const now = new Date()
    if (batchTask.availability_start && new Date(batchTask.availability_start) > now) {
      return NextResponse.json({ error: 'Task not yet available' }, { status: 403 })
    }
    if (batchTask.availability_end && new Date(batchTask.availability_end) < now) {
      return NextResponse.json({ error: 'Task availability has ended' }, { status: 403 })
    }

    // Check lesson unlock status (server-side)
    const lessonRule = (task as { lesson_unlock_rule?: string }).lesson_unlock_rule ?? 'all_available'
    if (lessonRule !== 'all_available') {
      const { data: taskLessons } = await supabase
        .from('task_lessons')
        .select('id')
        .eq('task_id', taskId)
        .eq('status', 'published')
        .order('sort_order', { ascending: true })
      const lessonIdx = (taskLessons || []).findIndex(l => l.id === lessonId)
      if (lessonIdx > 0) {
        const prevLessonId = (taskLessons || [])[lessonIdx - 1].id
        const { data: prevLessonProgress } = await supabase
          .from('student_lesson_progress')
          .select('status, score')
          .eq('user_id', user.id)
          .eq('batch_id', batchId)
          .eq('lesson_id', prevLessonId)
          .maybeSingle()
        if (lessonRule === 'sequential') {
          if (!prevLessonProgress || prevLessonProgress.status !== 'completed') {
            return NextResponse.json({ error: 'Lesson is locked — complete previous lesson first' }, { status: 403 })
          }
        } else if (lessonRule === 'minimum_score') {
          const required = (task as { required_lesson_score?: number }).required_lesson_score ?? 70
          if ((prevLessonProgress?.score ?? 0) < required) {
            return NextResponse.json({ error: `Lesson locked — previous lesson score must reach ${required}` }, { status: 403 })
          }
        }
      }
    }

    // Check activity unlock status (server-side)
    const unlockRule = (task as { activity_unlock_rule?: string }).activity_unlock_rule ?? 'sequential'
    if (unlockRule !== 'all_available') {
      const { data: lessonActivities } = await supabase
        .from('lesson_activities')
        .select('id, activity_type')
        .eq('lesson_id', lessonId)
        .eq('status', 'published')
        .order('sort_order', { ascending: true })

      if (lessonActivities && lessonActivities.length > 0) {
        const actIdx = lessonActivities.findIndex(a => a.id === activityId)
        if (actIdx > 0) {
          const prev = (lessonActivities as { id: string; activity_type: string }[])[actIdx - 1]
          const { data: prevProgress } = await supabase
            .from('student_activity_progress')
            .select('status')
            .eq('user_id', user.id)
            .eq('batch_id', batchId)
            .eq('activity_id', prev.id)
            .maybeSingle()

          const prevDone = prevProgress?.status === 'completed'
          if (!prevDone) {
            // Speaking review tidak boleh memblokir: submission pending dianggap cukup untuk unlock
            let speakingPending = false
            if (prev.activity_type === 'speaking_review') {
              const { data: sub } = await supabase
                .from('speaking_review_submissions')
                .select('id')
                .eq('user_id', user.id)
                .eq('batch_id', batchId)
                .eq('activity_id', prev.id)
                .limit(1)
                .maybeSingle()
              speakingPending = !!sub
            }
            if (!speakingPending) {
              return NextResponse.json({ error: 'Activity is locked — complete previous activity first' }, { status: 403 })
            }
          }
        }
      }
    }

    const { data: existingProgress } = await supabase
      .from('student_activity_progress')
      .select('attempts, status')
      .eq('user_id', user.id)
      .eq('batch_id', batchId)
      .eq('activity_id', activityId)
      .maybeSingle()

    // TODO: picks race on concurrent double-submit; replace with atomic RPC increment when available
    const attempts = (existingProgress?.attempts ?? 0) + 1
    const minScore = (task as { min_completion_score?: number }).min_completion_score ?? 70
    const status = score >= minScore ? 'completed' : 'in_progress'

    const { error: upsertError } = await supabase
      .from('student_activity_progress')
      .upsert({
        user_id: user.id,
        batch_id: batchId,
        task_id: taskId,
        lesson_id: lessonId,
        activity_id: activityId,
        status,
        score,
        attempts,
        answers,
        completed_at: status === 'completed' ? new Date().toISOString() : null,
      }, { onConflict: 'user_id,batch_id,activity_id' })

    if (upsertError) {
      console.error('Failed to upsert activity progress:', upsertError)
      return NextResponse.json({ error: 'Failed to save progress' }, { status: 500 })
    }

    const [{ data: allActivities }, { data: allProgress }] = await Promise.all([
      supabase.from('lesson_activities').select('id').eq('lesson_id', lessonId).eq('status', 'published'),
      supabase.from('student_activity_progress').select('activity_id, status, score').eq('user_id', user.id).eq('batch_id', batchId).eq('lesson_id', lessonId),
    ])

    const progressMap = new Map((allProgress || []).map(p => [p.activity_id, p.status]))
    const completedCount = (allActivities || []).filter(a => progressMap.get(a.id) === 'completed').length
    const lessonCompleted = completedCount === (allActivities || []).length && (allActivities || []).length > 0

    const scores = (allProgress || []).filter(p => typeof p.score === 'number' && p.score > 0).map(p => p.score as number)
    // Include current score if not yet in DB
    if (score > 0 && !scores.includes(score)) {
      // scores already include current if DB read after upsert, but ensure
    }
    const lessonScore = scores.length > 0
      ? Math.round(scores.reduce((s, x) => s + x, 0) / scores.length)
      : score

    const { error: lessonUpsertError } = await supabase
      .from('student_lesson_progress')
      .upsert({
        user_id: user.id,
        batch_id: batchId,
        task_id: taskId,
        lesson_id: lessonId,
        status: lessonCompleted ? 'completed' : 'in_progress',
        score: lessonScore,
        completed_at: lessonCompleted ? new Date().toISOString() : null,
      }, { onConflict: 'user_id,batch_id,lesson_id' })

    if (lessonUpsertError) {
      console.error('Failed to upsert lesson progress:', lessonUpsertError)
    }

    // Also update student_task_progress (rollup)
    try {
      const { data: taskLessons } = await supabase.from('task_lessons').select('id').eq('task_id', taskId).eq('status', 'published')
      const lessonIds = (taskLessons || []).map(l => l.id)
      let totalActivities = 0
      let completedActivities = 0
      let completedLessons = 0
      if (lessonIds.length > 0) {
        const [{ data: allActs }, { data: allLessonProgress }, { data: allActProgress }] = await Promise.all([
          supabase.from('lesson_activities').select('id, lesson_id').in('lesson_id', lessonIds).eq('status', 'published'),
          supabase.from('student_lesson_progress').select('lesson_id, status').eq('user_id', user.id).eq('batch_id', batchId).eq('task_id', taskId),
          supabase.from('student_activity_progress').select('activity_id, status').eq('user_id', user.id).eq('batch_id', batchId).eq('task_id', taskId),
        ])
        totalActivities = (allActs || []).length
        const actStatusMap = new Map((allActProgress || []).map(p => [p.activity_id, p.status]))
        completedActivities = (allActs || []).filter(a => actStatusMap.get(a.id) === 'completed').length
        completedLessons = (allLessonProgress || []).filter(p => p.status === 'completed').length
      }
      let dialogCompleted = true
      if ((task as { dialog_enabled?: boolean }).dialog_enabled) {
        const { data: dialog } = await supabase
          .from('dialog_sessions')
          .select('status')
          .eq('user_id', user.id)
          .eq('batch_id', batchId)
          .eq('task_id', taskId)
          .eq('status', 'completed')
          .limit(1)
          .maybeSingle()
        dialogCompleted = !!dialog
      }
      const taskCompleted = totalActivities > 0 && completedActivities === totalActivities && dialogCompleted
      await supabase.from('student_task_progress').upsert({
        user_id: user.id,
        batch_id: batchId,
        task_id: taskId,
        status: taskCompleted ? 'completed' : (completedActivities > 0 || completedLessons > 0 ? 'in_progress' : 'not_started'),
        total_lessons: lessonIds.length,
        completed_lessons: completedLessons,
        total_activities: totalActivities,
        completed_activities: completedActivities,
        last_lesson_id: lessonId,
        last_activity_id: activityId,
        completed_at: taskCompleted ? new Date().toISOString() : null,
      }, { onConflict: 'user_id,batch_id,task_id' })
      // Set started_at only on first progress (don't overwrite)
      await supabase
        .from('student_task_progress')
        .update({ started_at: new Date().toISOString() })
        .eq('user_id', user.id)
        .eq('batch_id', batchId)
        .eq('task_id', taskId)
        .is('started_at', null)
    } catch (e) {
      console.error('Failed to upsert task progress', e)
    }

    return NextResponse.json({
      success: true,
      activityScore: score,
      lessonScore,
      lessonCompleted,
      attempts,
    })
  } catch (error) {
    console.error('Progress validation error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
