-- Drive Opsi A: per siswa OAuth (drive.file scope) + hemat Supabase (text+link only)
CREATE TABLE IF NOT EXISTS public.user_drive_tokens (
  user_id uuid PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
  provider text NOT NULL DEFAULT 'google',
  encrypted_refresh_token text NOT NULL,
  drive_email text,
  scope text,
  connected_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.user_drive_tokens ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS udt_select_own ON public.user_drive_tokens;
CREATE POLICY udt_select_own ON public.user_drive_tokens FOR SELECT TO authenticated USING (user_id = auth.uid() OR is_admin());
DROP POLICY IF EXISTS udt_insert_own ON public.user_drive_tokens;
CREATE POLICY udt_insert_own ON public.user_drive_tokens FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
DROP POLICY IF EXISTS udt_update_own ON public.user_drive_tokens;
CREATE POLICY udt_update_own ON public.user_drive_tokens FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
DROP POLICY IF EXISTS udt_delete_own ON public.user_drive_tokens;
CREATE POLICY udt_delete_own ON public.user_drive_tokens FOR DELETE TO authenticated USING (user_id = auth.uid() OR is_admin());

CREATE TABLE IF NOT EXISTS public.audio_recordings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  activity_id uuid REFERENCES public.lesson_activities(id) ON DELETE SET NULL,
  drive_file_id text,
  drive_link text,
  storage_path text, -- fallback temp Supabase Storage path
  duration_ms int,
  is_temp boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz
);
ALTER TABLE public.audio_recordings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ar_select_own ON public.audio_recordings;
CREATE POLICY ar_select_own ON public.audio_recordings FOR SELECT TO authenticated USING (user_id = auth.uid() OR is_admin() OR EXISTS (SELECT 1 FROM public.enrollments e JOIN public.batches b ON b.id=e.batch_id JOIN public.course_teachers ct ON ct.course_id=b.course_id JOIN public.teachers t ON t.id=ct.teacher_id WHERE e.user_id=auth.uid() AND t.user_id=audio_recordings.user_id));
DROP POLICY IF EXISTS ar_insert_own ON public.audio_recordings;
CREATE POLICY ar_insert_own ON public.audio_recordings FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
DROP POLICY IF EXISTS ar_delete_own ON public.audio_recordings;
CREATE POLICY ar_delete_own ON public.audio_recordings FOR DELETE TO authenticated USING (user_id = auth.uid() OR is_admin());

-- Cron: hapus temp 24 jam (aktifkan via pg_cron jika ada)
-- SELECT cron.schedule('purge-temp-audio', '0 * * * *', $$DELETE FROM public.audio_recordings WHERE is_temp=true AND created_at < now() - interval '24 hours'$$);
