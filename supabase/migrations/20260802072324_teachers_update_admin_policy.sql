CREATE POLICY teachers_update_admin ON public.teachers
  FOR UPDATE TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());