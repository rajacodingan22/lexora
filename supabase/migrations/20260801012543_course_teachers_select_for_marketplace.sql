CREATE POLICY "ct_select_all" ON public.course_teachers
  FOR SELECT
  TO authenticated
  USING (true);