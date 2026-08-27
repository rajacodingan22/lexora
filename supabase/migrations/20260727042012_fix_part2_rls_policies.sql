DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'activity_log' AND policyname = 'activity_log_insert_service') THEN
    CREATE POLICY "activity_log_insert_service" ON public.activity_log FOR INSERT TO service_role WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'activity_log' AND policyname = 'activity_log_select_admin') THEN
    CREATE POLICY "activity_log_select_admin" ON public.activity_log FOR SELECT TO authenticated USING (is_admin());
  END IF;
END $$;

DROP POLICY IF EXISTS "contact_insert" ON public.contact_messages;
CREATE POLICY "contact_insert" ON public.contact_messages FOR INSERT TO anon, authenticated WITH CHECK (name IS NOT NULL AND name <> '' AND email IS NOT NULL AND email <> '' AND message IS NOT NULL AND message <> '');

DROP POLICY IF EXISTS "notif_insert_system" ON public.notifications;
CREATE POLICY "notif_insert_system" ON public.notifications FOR INSERT TO authenticated WITH CHECK ((auth.role() = 'service_role'::text) OR (user_id = auth.uid()));

DELETE FROM news_comments nc WHERE NOT EXISTS (SELECT 1 FROM users u WHERE u.id = nc.user_id);
ALTER TABLE news_comments ADD CONSTRAINT news_comments_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;