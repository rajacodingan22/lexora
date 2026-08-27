DROP POLICY IF EXISTS courses_update_teacher ON courses;
DROP POLICY IF EXISTS courses_delete_teacher ON courses;

CREATE POLICY courses_update_teacher ON courses
  FOR UPDATE
  TO authenticated
  USING (
    teacher_id IS NULL
    OR
    auth.uid() IN (SELECT user_id FROM teachers WHERE id = courses.teacher_id)
    OR
    is_admin()
  )
  WITH CHECK (
    teacher_id IS NULL
    OR
    auth.uid() IN (SELECT user_id FROM teachers WHERE id = courses.teacher_id)
    OR
    is_admin()
  );