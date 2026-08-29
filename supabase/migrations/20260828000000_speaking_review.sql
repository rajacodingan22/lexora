-- Speaking Review: submissions table for human teacher review
-- Student records audio → saved to Drive → teacher reviews with 5 scoring aspects

CREATE TABLE IF NOT EXISTS public.speaking_review_submissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  activity_progress_id uuid REFERENCES public.student_activity_progress(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  activity_id uuid NOT NULL REFERENCES public.lesson_activities(id) ON DELETE CASCADE,
  task_id uuid NOT NULL REFERENCES public.course_tasks(id) ON DELETE CASCADE,
  batch_id uuid NOT NULL REFERENCES public.batches(id) ON DELETE CASCADE,

  -- Recording data
  transcript text,
  word_scores jsonb,
  auto_score numeric(5,2),
  audio_drive_file_id text,
  audio_drive_link text,
  audio_duration_ms int,

  -- Teacher review
  review_status text NOT NULL DEFAULT 'pending' CHECK (review_status IN ('pending', 'reviewed')),
  reviewed_by uuid REFERENCES public.users(id),
  reviewed_at timestamptz,

  -- Teacher scores (0-100 each)
  score_fluency int CHECK (score_fluency >= 0 AND score_fluency <= 100),
  score_intonation int CHECK (score_intonation >= 0 AND score_intonation <= 100),
  score_pronunciation int CHECK (score_pronunciation >= 0 AND score_pronunciation <= 100),
  score_confidence int CHECK (score_confidence >= 0 AND score_confidence <= 100),
  score_comprehension int CHECK (score_comprehension >= 0 AND score_comprehension <= 100),
  overall_score numeric(5,2),
  teacher_feedback text,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_srs_user_id ON public.speaking_review_submissions(user_id);
CREATE INDEX IF NOT EXISTS idx_srs_activity_id ON public.speaking_review_submissions(activity_id);
CREATE INDEX IF NOT EXISTS idx_srs_review_status ON public.speaking_review_submissions(review_status);
CREATE INDEX IF NOT EXISTS idx_srs_batch_id ON public.speaking_review_submissions(batch_id);

-- RLS
ALTER TABLE public.speaking_review_submissions ENABLE ROW LEVEL SECURITY;

-- Student can read own submissions
CREATE POLICY srs_select_own ON public.speaking_review_submissions
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- Student can insert own submissions
CREATE POLICY srs_insert_own ON public.speaking_review_submissions
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

-- Student can update own (limited — only before review)
CREATE POLICY srs_update_own ON public.speaking_review_submissions
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid() AND review_status = 'pending')
  WITH CHECK (user_id = auth.uid());

-- Teacher can read submissions from their enrolled students
CREATE POLICY srs_select_teacher ON public.speaking_review_submissions
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.enrollments e
      JOIN public.course_teachers ct ON ct.course_id = e.course_id
      WHERE e.user_id = speaking_review_submissions.user_id
        AND e.batch_id = speaking_review_submissions.batch_id
        AND ct.teacher_id = auth.uid()
        AND e.status IN ('active', 'completed')
    )
  );

-- Teacher can update reviews for their students
CREATE POLICY srs_update_teacher ON public.speaking_review_submissions
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.enrollments e
      JOIN public.course_teachers ct ON ct.course_id = e.course_id
      WHERE e.user_id = speaking_review_submissions.user_id
        AND e.batch_id = speaking_review_submissions.batch_id
        AND ct.teacher_id = auth.uid()
        AND e.status IN ('active', 'completed')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.enrollments e
      JOIN public.course_teachers ct ON ct.course_id = e.course_id
      WHERE e.user_id = speaking_review_submissions.user_id
        AND e.batch_id = speaking_review_submissions.batch_id
        AND ct.teacher_id = auth.uid()
        AND e.status IN ('active', 'completed')
    )
  );

-- Admin full access
CREATE POLICY srs_admin_all ON public.speaking_review_submissions
  FOR ALL TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION public.update_speaking_review_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_speaking_review_updated_at ON public.speaking_review_submissions;
CREATE TRIGGER trg_speaking_review_updated_at
  BEFORE UPDATE ON public.speaking_review_submissions
  FOR EACH ROW EXECUTE FUNCTION public.update_speaking_review_updated_at();

-- Add speaking_review to lesson_activities type constraint
ALTER TABLE public.lesson_activities DROP CONSTRAINT IF EXISTS lesson_activities_activity_type_check;
ALTER TABLE public.lesson_activities ADD CONSTRAINT lesson_activities_activity_type_check
  CHECK (activity_type IN ('reading', 'listening', 'quiz', 'video', 'exercise', 'image_speak', 'speaking_review'));
