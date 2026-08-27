-- Add WITH CHECK to all UPDATE policies that are missing it

-- users_update_own
DROP POLICY IF EXISTS "users_update_own" ON public.users;
CREATE POLICY "users_update_own" ON public.users
  FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- teachers_update_own
DROP POLICY IF EXISTS "teachers_update_own" ON public.teachers;
CREATE POLICY "teachers_update_own" ON public.teachers
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- courses_update_teacher
DROP POLICY IF EXISTS "courses_update_teacher" ON public.courses;
CREATE POLICY "courses_update_teacher" ON public.courses
  FOR UPDATE
  USING ((auth.uid() IN (SELECT teachers.user_id FROM teachers WHERE teachers.id = courses.teacher_id)) OR is_admin())
  WITH CHECK ((auth.uid() IN (SELECT teachers.user_id FROM teachers WHERE teachers.id = courses.teacher_id)) OR is_admin());

-- assignments_update_teacher
DROP POLICY IF EXISTS "assignments_update_teacher" ON public.assignments;
CREATE POLICY "assignments_update_teacher" ON public.assignments
  FOR UPDATE
  USING ((EXISTS (SELECT 1 FROM courses c JOIN teachers t ON t.id = c.teacher_id WHERE c.id = assignments.course_id AND t.user_id = auth.uid())) OR is_admin())
  WITH CHECK ((EXISTS (SELECT 1 FROM courses c JOIN teachers t ON t.id = c.teacher_id WHERE c.id = assignments.course_id AND t.user_id = auth.uid())) OR is_admin());

-- quizzes_update_teacher
DROP POLICY IF EXISTS "quizzes_update_teacher" ON public.quizzes;
CREATE POLICY "quizzes_update_teacher" ON public.quizzes
  FOR UPDATE
  USING ((EXISTS (SELECT 1 FROM courses c JOIN teachers t ON t.id = c.teacher_id WHERE c.id = quizzes.course_id AND t.user_id = auth.uid())) OR is_admin())
  WITH CHECK ((EXISTS (SELECT 1 FROM courses c JOIN teachers t ON t.id = c.teacher_id WHERE c.id = quizzes.course_id AND t.user_id = auth.uid())) OR is_admin());

-- materials_update_teacher
DROP POLICY IF EXISTS "materials_update_teacher" ON public.materials;
CREATE POLICY "materials_update_teacher" ON public.materials
  FOR UPDATE
  USING ((EXISTS (SELECT 1 FROM courses c JOIN teachers t ON t.id = c.teacher_id WHERE c.id = materials.course_id AND t.user_id = auth.uid())) OR is_admin())
  WITH CHECK ((EXISTS (SELECT 1 FROM courses c JOIN teachers t ON t.id = c.teacher_id WHERE c.id = materials.course_id AND t.user_id = auth.uid())) OR is_admin());

-- live_sessions -> sessions_update_teacher
DROP POLICY IF EXISTS "sessions_update_teacher" ON public.live_sessions;
CREATE POLICY "sessions_update_teacher" ON public.live_sessions
  FOR UPDATE
  USING ((EXISTS (SELECT 1 FROM courses c JOIN teachers t ON t.id = c.teacher_id WHERE c.id = live_sessions.course_id AND t.user_id = auth.uid())) OR is_admin())
  WITH CHECK ((EXISTS (SELECT 1 FROM courses c JOIN teachers t ON t.id = c.teacher_id WHERE c.id = live_sessions.course_id AND t.user_id = auth.uid())) OR is_admin());

-- submissions_update_own
DROP POLICY IF EXISTS "submissions_update_own" ON public.submissions;
CREATE POLICY "submissions_update_own" ON public.submissions
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- fe_update_teacher (final_exams)
DROP POLICY IF EXISTS "fe_update_teacher" ON public.final_exams;
CREATE POLICY "fe_update_teacher" ON public.final_exams
  FOR UPDATE
  USING (auth.uid() = teacher_id)
  WITH CHECK (auth.uid() = teacher_id);

-- er_update_teacher (exam_results)
DROP POLICY IF EXISTS "er_update_teacher" ON public.exam_results;
CREATE POLICY "er_update_teacher" ON public.exam_results
  FOR UPDATE
  USING (EXISTS (SELECT 1 FROM final_exams WHERE final_exams.id = exam_results.exam_id AND final_exams.teacher_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM final_exams WHERE final_exams.id = exam_results.exam_id AND final_exams.teacher_id = auth.uid()));

-- notif_update_own (notifications)
DROP POLICY IF EXISTS "notif_update_own" ON public.notifications;
CREATE POLICY "notif_update_own" ON public.notifications
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ta_update_own (teacher_applications)
DROP POLICY IF EXISTS "ta_update_own" ON public.teacher_applications;
CREATE POLICY "ta_update_own" ON public.teacher_applications
  FOR UPDATE
  USING ((auth.uid() = user_id) AND (status = ANY (ARRAY['draft'::text, 'needs_revision'::text])))
  WITH CHECK ((auth.uid() = user_id) AND (status = ANY (ARRAY['draft'::text, 'needs_revision'::text])));

-- ta_update_admin (teacher_applications)
DROP POLICY IF EXISTS "ta_update_admin" ON public.teacher_applications;
CREATE POLICY "ta_update_admin" ON public.teacher_applications
  FOR UPDATE
  USING (is_admin())
  WITH CHECK (is_admin());

-- events_update_admin
DROP POLICY IF EXISTS "events_update_admin" ON public.events;
CREATE POLICY "events_update_admin" ON public.events
  FOR UPDATE
  USING (is_admin())
  WITH CHECK (is_admin());
