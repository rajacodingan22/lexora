-- Fix events_select_all: replace deprecated auth.role() with is_admin()
DROP POLICY IF EXISTS "events_select_all" ON public.events;
CREATE POLICY "events_select_all" ON public.events
  FOR SELECT
  TO public
  USING (status = 'published' OR is_admin());

-- Fix news_comments insert: use TO authenticated + enforce user_id
DROP POLICY IF EXISTS "Auth insert comments" ON public.news_comments;
CREATE POLICY "Auth insert comments" ON public.news_comments
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- Fix news_comments select: use TO authenticated
DROP POLICY IF EXISTS "Auth read own comments" ON public.news_comments;
CREATE POLICY "Auth read own comments" ON public.news_comments
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id OR is_approved = true);
