-- 1. Allow all authenticated users to read basic user profile info
CREATE POLICY "users_read_public_profiles" ON public.users
  FOR SELECT
  TO authenticated
  USING (true);

-- 2. Allow public (anon) to read active/visible courses
DROP POLICY IF EXISTS "courses_read_visible" ON public.courses;
CREATE POLICY "courses_read_visible" ON public.courses
  FOR SELECT
  TO public
  USING (
    (is_visible_marketplace = true) OR 
    (status = 'active'::text) OR 
    is_admin() OR 
    (EXISTS (SELECT 1 FROM enrollments WHERE enrollments.course_id = courses.id AND enrollments.user_id = auth.uid()))
  );

-- 3. Allow public to read published news
DROP POLICY IF EXISTS "news_read_published" ON public.news;
CREATE POLICY "news_read_published" ON public.news
  FOR SELECT
  TO public
  USING ((status = 'published'::text) OR is_admin());

-- 4. Allow public to read published events
DROP POLICY IF EXISTS "events_select_all" ON public.events;
CREATE POLICY "events_select_all" ON public.events
  FOR SELECT
  TO public
  USING ((status = 'published'::text) OR is_admin());

-- 5. Allow public to read active programs
DROP POLICY IF EXISTS "programs_read_active" ON public.programs;
CREATE POLICY "programs_read_active" ON public.programs
  FOR SELECT
  TO public
  USING ((is_active = true) OR is_admin());

-- 6. Allow public to read active placement tests
DROP POLICY IF EXISTS "pt_read_active" ON public.placement_tests;
CREATE POLICY "pt_read_active" ON public.placement_tests
  FOR SELECT
  TO public
  USING (is_active = true);
