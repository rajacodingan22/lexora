-- Drop existing SELECT policy
DROP POLICY IF EXISTS "sessions_read_enrolled" ON public.live_sessions;

-- Allow SELECT for enrolled students, teachers (via course_teachers), and admins
CREATE POLICY "sessions_read_allowed" ON public.live_sessions
  FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM enrollments WHERE course_id = live_sessions.course_id AND user_id = auth.uid())
    OR EXISTS (SELECT 1 FROM course_teachers ct JOIN teachers t ON t.id = ct.teacher_id WHERE ct.course_id = live_sessions.course_id AND t.user_id = auth.uid())
    OR is_admin()
  );

-- Allow INSERT/UPDATE/DELETE for teachers (via course_teachers) and admins
CREATE POLICY "sessions_write_teachers" ON public.live_sessions
  FOR INSERT
  WITH CHECK (
    EXISTS (SELECT 1 FROM course_teachers ct JOIN teachers t ON t.id = ct.teacher_id WHERE ct.course_id = live_sessions.course_id AND t.user_id = auth.uid())
    OR is_admin()
  );

CREATE POLICY "sessions_update_teachers" ON public.live_sessions
  FOR UPDATE
  USING (
    EXISTS (SELECT 1 FROM course_teachers ct JOIN teachers t ON t.id = ct.teacher_id WHERE ct.course_id = live_sessions.course_id AND t.user_id = auth.uid())
    OR is_admin()
  );

CREATE POLICY "sessions_delete_teachers" ON public.live_sessions
  FOR DELETE
  USING (
    EXISTS (SELECT 1 FROM course_teachers ct JOIN teachers t ON t.id = ct.teacher_id WHERE ct.course_id = live_sessions.course_id AND t.user_id = auth.uid())
    OR is_admin()
  );
