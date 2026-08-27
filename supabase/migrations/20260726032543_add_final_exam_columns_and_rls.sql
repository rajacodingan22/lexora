-- Add missing columns to final_exams
ALTER TABLE public.final_exams 
  ADD COLUMN IF NOT EXISTS teacher_id UUID REFERENCES public.users(id),
  ADD COLUMN IF NOT EXISTS is_published BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();

-- Add missing columns to exam_results
ALTER TABLE public.exam_results
  ADD COLUMN IF NOT EXISTS course_id UUID REFERENCES public.courses(id),
  ADD COLUMN IF NOT EXISTS total_points NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS essay_scores JSONB DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'in_progress';

-- Add unique constraint
ALTER TABLE public.exam_results DROP CONSTRAINT IF EXISTS exam_results_user_exam_unique;
ALTER TABLE public.exam_results ADD CONSTRAINT exam_results_user_exam_unique UNIQUE (exam_id, user_id);

-- Backfill teacher_id for existing rows
UPDATE public.final_exams SET teacher_id = (SELECT teacher_id FROM public.courses WHERE id = final_exams.course_id) WHERE teacher_id IS NULL;

-- Enable RLS
ALTER TABLE public.final_exams ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exam_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exam_results ENABLE ROW LEVEL SECURITY;

-- RLS policies for final_exams
DROP POLICY IF EXISTS "fe_read_teacher" ON public.final_exams;
DROP POLICY IF EXISTS "fe_read_student" ON public.final_exams;
DROP POLICY IF EXISTS "fe_manage_teacher" ON public.final_exams;
DROP POLICY IF EXISTS "fe_update_teacher" ON public.final_exams;

CREATE POLICY "fe_read_teacher" ON public.final_exams
  FOR SELECT USING (auth.uid() = teacher_id OR public.is_admin());

CREATE POLICY "fe_read_student" ON public.final_exams
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM enrollments WHERE course_id = final_exams.course_id AND user_id = auth.uid())
    OR public.is_admin()
  );

CREATE POLICY "fe_manage_teacher" ON public.final_exams
  FOR INSERT WITH CHECK (auth.uid() = teacher_id);

CREATE POLICY "fe_update_teacher" ON public.final_exams
  FOR UPDATE USING (auth.uid() = teacher_id);

-- RLS policies for exam_questions
DROP POLICY IF EXISTS "eq_read" ON public.exam_questions;
DROP POLICY IF EXISTS "eq_manage" ON public.exam_questions;

CREATE POLICY "eq_read" ON public.exam_questions
  FOR SELECT USING (true);

CREATE POLICY "eq_manage" ON public.exam_questions
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM final_exams WHERE id = exam_questions.exam_id AND teacher_id = auth.uid())
  );

-- RLS policies for exam_results
DROP POLICY IF EXISTS "er_read_own" ON public.exam_results;
DROP POLICY IF EXISTS "er_read_teacher" ON public.exam_results;
DROP POLICY IF EXISTS "er_insert_own" ON public.exam_results;

CREATE POLICY "er_read_own" ON public.exam_results
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "er_read_teacher" ON public.exam_results
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM final_exams WHERE id = exam_results.exam_id AND teacher_id = auth.uid())
  );

CREATE POLICY "er_insert_own" ON public.exam_results
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "er_update_teacher" ON public.exam_results
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM final_exams WHERE id = exam_results.exam_id AND teacher_id = auth.uid())
  );