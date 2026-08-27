-- 1) courses: kolom baru untuk model bayar-perkelas
ALTER TABLE public.courses
  ADD COLUMN IF NOT EXISTS price NUMERIC(12,0) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS meeting_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS project_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS is_try_class BOOLEAN NOT NULL DEFAULT false;

-- 2) tabel waiting_list
CREATE TABLE IF NOT EXISTS public.waiting_list (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id uuid NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'waiting',
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS waiting_list_course_idx ON public.waiting_list (course_id);
CREATE INDEX IF NOT EXISTS waiting_list_user_idx ON public.waiting_list (user_id);

ALTER TABLE public.waiting_list ENABLE ROW LEVEL SECURITY;

-- student bisa baca & daftar waiting list sendiri
CREATE POLICY waiting_list_read_own ON public.waiting_list
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY waiting_list_insert_own ON public.waiting_list
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY waiting_list_delete_own ON public.waiting_list
  FOR DELETE USING (auth.uid() = user_id);

-- admin kelola semua
CREATE POLICY waiting_list_read_admin ON public.waiting_list
  FOR SELECT USING (is_admin());
CREATE POLICY waiting_list_update_admin ON public.waiting_list
  FOR UPDATE USING (is_admin());
CREATE POLICY waiting_list_delete_admin ON public.waiting_list
  FOR DELETE USING (is_admin());

-- 3) kursus yang ada = try class (2 pertemuan + 1 project, gratis)
UPDATE public.courses
SET is_try_class = true,
    price = 0,
    meeting_count = 2,
    project_count = 1
WHERE id = 'd0000000-0000-0000-0000-000000000001';