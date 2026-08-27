DROP POLICY IF EXISTS "enrollments_update_admin" ON enrollments;
CREATE POLICY "enrollments_update_admin" ON enrollments
  FOR UPDATE
  USING (is_admin())
  WITH CHECK (is_admin());