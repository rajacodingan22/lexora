-- Lock Project (assignments) and Final Exam (final_exams) to admin-only for standardization
-- Guru tidak lagi bisa buat/ubah/hapus, hanya bisa baca & nilai

-- ============ assignments (Project) ============
DROP POLICY IF EXISTS assignments_insert_teacher ON public.assignments;
CREATE POLICY assignments_insert_teacher ON public.assignments
  FOR INSERT TO authenticated WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS assignments_update_teacher ON public.assignments;
CREATE POLICY assignments_update_teacher ON public.assignments
  FOR UPDATE TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS assignments_delete_teacher ON public.assignments;
CREATE POLICY assignments_delete_teacher ON public.assignments
  FOR DELETE TO authenticated USING (public.is_admin());

-- Keep read for teacher (already exists: assignments_read_teacher)
-- Keep submissions grading for teacher (submissions policies remain)

-- ============ final_exams (Ujian Akhir) ============
DROP POLICY IF EXISTS fe_manage_teacher ON public.final_exams;
CREATE POLICY fe_manage_teacher ON public.final_exams
  FOR INSERT WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS fe_update_teacher ON public.final_exams;
CREATE POLICY fe_update_teacher ON public.final_exams
  FOR UPDATE USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS fe_delete_teacher ON public.final_exams;
CREATE POLICY fe_delete_teacher ON public.final_exams
  FOR DELETE USING (public.is_admin());

-- Keep read for teacher/student (fe_read_teacher, fe_read_student)

-- ============ exam_questions ============
DROP POLICY IF EXISTS eq_update_teacher ON public.exam_questions;
CREATE POLICY eq_update_teacher ON public.exam_questions
  FOR UPDATE TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS eq_delete_teacher ON public.exam_questions;
CREATE POLICY eq_delete_teacher ON public.exam_questions
  FOR DELETE TO authenticated USING (public.is_admin());

-- Insert for exam_questions should also be admin-only (if exists, recreate)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='exam_questions' AND policyname='eq_manage') THEN
    DROP POLICY eq_manage ON public.exam_questions;
    CREATE POLICY eq_manage ON public.exam_questions FOR INSERT TO authenticated WITH CHECK (public.is_admin());
  END IF;
  IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='exam_questions' AND policyname='eq_insert_teacher') THEN
    DROP POLICY eq_insert_teacher ON public.exam_questions;
    CREATE POLICY eq_insert_teacher ON public.exam_questions FOR INSERT TO authenticated WITH CHECK (public.is_admin());
  END IF;
END $$;

-- Generic fallback: ensure any remaining teacher insert on exam_questions is admin-only
DROP POLICY IF EXISTS exam_questions_insert_teacher ON public.exam_questions;

-- ============ live_sessions (Zoom) & course_schedules (Jadwal) - Admin only ============
-- Guru read-only (sudah ada select policies), write hanya admin
DROP POLICY IF EXISTS live_sessions_insert_teacher ON public.live_sessions;
DROP POLICY IF EXISTS ls_insert_teacher ON public.live_sessions;
DROP POLICY IF EXISTS live_sessions_teacher_insert ON public.live_sessions;
CREATE POLICY live_sessions_insert_teacher ON public.live_sessions FOR INSERT TO authenticated WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS live_sessions_update_teacher ON public.live_sessions;
DROP POLICY IF EXISTS ls_update_teacher ON public.live_sessions;
CREATE POLICY live_sessions_update_teacher ON public.live_sessions FOR UPDATE TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS live_sessions_delete_teacher ON public.live_sessions;
DROP POLICY IF EXISTS ls_delete_teacher ON public.live_sessions;
CREATE POLICY live_sessions_delete_teacher ON public.live_sessions FOR DELETE TO authenticated USING (public.is_admin());

DROP POLICY IF EXISTS course_schedules_insert_teacher ON public.course_schedules;
CREATE POLICY course_schedules_insert_teacher ON public.course_schedules FOR INSERT TO authenticated WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS course_schedules_update_teacher ON public.course_schedules;
CREATE POLICY course_schedules_update_teacher ON public.course_schedules FOR UPDATE TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS course_schedules_delete_teacher ON public.course_schedules;
CREATE POLICY course_schedules_delete_teacher ON public.course_schedules FOR DELETE TO authenticated USING (public.is_admin());
