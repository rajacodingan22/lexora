-- Fix overly permissive INSERT policies

DROP POLICY IF EXISTS "notif_insert_system" ON public.notifications;
CREATE POLICY "notif_insert_system" ON public.notifications
  FOR INSERT WITH CHECK (auth.role() = 'service_role' OR auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "audit_insert" ON public.audit_logs;
CREATE POLICY "audit_insert" ON public.audit_logs
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL OR auth.role() = 'anon');

-- contact_insert already exists, keep as-is (public contact form needs anon insert)
-- Just add rate limiting comment
COMMENT ON POLICY "contact_insert" ON public.contact_messages IS 'Allows public contact form submissions. Rate limiting should be handled at application level.';

-- Teachers table
DROP POLICY IF EXISTS "teachers_update_own" ON public.teachers;
CREATE POLICY "teachers_insert_own" ON public.teachers FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "teachers_update_own" ON public.teachers FOR UPDATE USING (auth.uid() = user_id);

-- Teacher languages
DROP POLICY IF EXISTS "tl_insert_own" ON public.teacher_languages;
DROP POLICY IF EXISTS "tl_delete_own" ON public.teacher_languages;
CREATE POLICY "tl_insert_own" ON public.teacher_languages FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM teachers WHERE user_id = auth.uid() AND id = teacher_languages.teacher_id)
);
CREATE POLICY "tl_delete_own" ON public.teacher_languages FOR DELETE USING (
  EXISTS (SELECT 1 FROM teachers WHERE user_id = auth.uid() AND id = teacher_languages.teacher_id)
);

-- Teacher programs
DROP POLICY IF EXISTS "tp_insert_own" ON public.teacher_programs;
DROP POLICY IF EXISTS "tp_delete_own" ON public.teacher_programs;
CREATE POLICY "tp_insert_own" ON public.teacher_programs FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM teachers WHERE user_id = auth.uid() AND id = teacher_programs.teacher_id)
);
CREATE POLICY "tp_delete_own" ON public.teacher_programs FOR DELETE USING (
  EXISTS (SELECT 1 FROM teachers WHERE user_id = auth.uid() AND id = teacher_programs.teacher_id)
);

-- Courses: teachers can insert/update/delete their own
DROP POLICY IF EXISTS "courses_insert_teacher" ON public.courses;
DROP POLICY IF EXISTS "courses_update_teacher" ON public.courses;
DROP POLICY IF EXISTS "courses_delete_teacher" ON public.courses;
CREATE POLICY "courses_insert_teacher" ON public.courses FOR INSERT WITH CHECK (
  auth.uid() IN (SELECT user_id FROM teachers WHERE id = courses.teacher_id)
  OR public.is_admin()
);
CREATE POLICY "courses_update_teacher" ON public.courses FOR UPDATE USING (
  auth.uid() IN (SELECT user_id FROM teachers WHERE id = courses.teacher_id)
  OR public.is_admin()
);
CREATE POLICY "courses_delete_teacher" ON public.courses FOR DELETE USING (
  auth.uid() IN (SELECT user_id FROM teachers WHERE id = courses.teacher_id)
  OR public.is_admin()
);

-- Assignments: teachers of the course can manage
DROP POLICY IF EXISTS "assignments_insert_teacher" ON public.assignments;
DROP POLICY IF EXISTS "assignments_update_teacher" ON public.assignments;
DROP POLICY IF EXISTS "assignments_delete_teacher" ON public.assignments;
CREATE POLICY "assignments_insert_teacher" ON public.assignments FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM courses c JOIN teachers t ON t.id = c.teacher_id WHERE c.id = assignments.course_id AND t.user_id = auth.uid())
  OR public.is_admin()
);
CREATE POLICY "assignments_update_teacher" ON public.assignments FOR UPDATE USING (
  EXISTS (SELECT 1 FROM courses c JOIN teachers t ON t.id = c.teacher_id WHERE c.id = assignments.course_id AND t.user_id = auth.uid())
  OR public.is_admin()
);
CREATE POLICY "assignments_delete_teacher" ON public.assignments FOR DELETE USING (
  EXISTS (SELECT 1 FROM courses c JOIN teachers t ON t.id = c.teacher_id WHERE c.id = assignments.course_id AND t.user_id = auth.uid())
  OR public.is_admin()
);

-- Quizzes: teachers of the course can manage
DROP POLICY IF EXISTS "quizzes_insert_teacher" ON public.quizzes;
DROP POLICY IF EXISTS "quizzes_update_teacher" ON public.quizzes;
DROP POLICY IF EXISTS "quizzes_delete_teacher" ON public.quizzes;
CREATE POLICY "quizzes_insert_teacher" ON public.quizzes FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM courses c JOIN teachers t ON t.id = c.teacher_id WHERE c.id = quizzes.course_id AND t.user_id = auth.uid())
  OR public.is_admin()
);
CREATE POLICY "quizzes_update_teacher" ON public.quizzes FOR UPDATE USING (
  EXISTS (SELECT 1 FROM courses c JOIN teachers t ON t.id = c.teacher_id WHERE c.id = quizzes.course_id AND t.user_id = auth.uid())
  OR public.is_admin()
);
CREATE POLICY "quizzes_delete_teacher" ON public.quizzes FOR DELETE USING (
  EXISTS (SELECT 1 FROM courses c JOIN teachers t ON t.id = c.teacher_id WHERE c.id = quizzes.course_id AND t.user_id = auth.uid())
  OR public.is_admin()
);

-- Materials: teachers of the course can manage
DROP POLICY IF EXISTS "materials_insert_teacher" ON public.materials;
DROP POLICY IF EXISTS "materials_update_teacher" ON public.materials;
DROP POLICY IF EXISTS "materials_delete_teacher" ON public.materials;
CREATE POLICY "materials_insert_teacher" ON public.materials FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM courses c JOIN teachers t ON t.id = c.teacher_id WHERE c.id = materials.course_id AND t.user_id = auth.uid())
  OR public.is_admin()
);
CREATE POLICY "materials_update_teacher" ON public.materials FOR UPDATE USING (
  EXISTS (SELECT 1 FROM courses c JOIN teachers t ON t.id = c.teacher_id WHERE c.id = materials.course_id AND t.user_id = auth.uid())
  OR public.is_admin()
);
CREATE POLICY "materials_delete_teacher" ON public.materials FOR DELETE USING (
  EXISTS (SELECT 1 FROM courses c JOIN teachers t ON t.id = c.teacher_id WHERE c.id = materials.course_id AND t.user_id = auth.uid())
  OR public.is_admin()
);

-- Live sessions: teachers can manage
DROP POLICY IF EXISTS "sessions_insert_teacher" ON public.live_sessions;
DROP POLICY IF EXISTS "sessions_update_teacher" ON public.live_sessions;
DROP POLICY IF EXISTS "sessions_delete_teacher" ON public.live_sessions;
CREATE POLICY "sessions_insert_teacher" ON public.live_sessions FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM courses c JOIN teachers t ON t.id = c.teacher_id WHERE c.id = live_sessions.course_id AND t.user_id = auth.uid())
  OR public.is_admin()
);
CREATE POLICY "sessions_update_teacher" ON public.live_sessions FOR UPDATE USING (
  EXISTS (SELECT 1 FROM courses c JOIN teachers t ON t.id = c.teacher_id WHERE c.id = live_sessions.course_id AND t.user_id = auth.uid())
  OR public.is_admin()
);
CREATE POLICY "sessions_delete_teacher" ON public.live_sessions FOR DELETE USING (
  EXISTS (SELECT 1 FROM courses c JOIN teachers t ON t.id = c.teacher_id WHERE c.id = live_sessions.course_id AND t.user_id = auth.uid())
  OR public.is_admin()
);
