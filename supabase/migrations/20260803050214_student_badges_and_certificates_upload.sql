-- 1. student_badges: badge otomatis untuk siswa
CREATE TABLE IF NOT EXISTS public.student_badges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  badge_type text NOT NULL CHECK (badge_type IN ('graduation','top_scorer','perfect_attendance','milestone')),
  title text NOT NULL DEFAULT '',
  description text,
  course_id uuid REFERENCES public.courses(id) ON DELETE CASCADE,
  batch_id uuid REFERENCES public.batches(id) ON DELETE CASCADE,
  earned_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, badge_type, batch_id)
);

ALTER TABLE public.student_badges ENABLE ROW LEVEL SECURITY;

-- Public read: alumni page publik menampilkan badge siswa
CREATE POLICY badges_read_all ON public.student_badges
  FOR SELECT USING (true);

-- Siswa hanya bisa baca badge sendiri? No — publik butuh lihat semua. Insert hanya via trigger (security definer) / admin
CREATE POLICY badges_insert_admin ON public.student_badges
  FOR INSERT WITH CHECK (is_admin());

-- 2. certificates: tambah batch_id + uploaded_by (teacher upload sertifikat)
ALTER TABLE public.certificates
  ADD COLUMN IF NOT EXISTS batch_id uuid REFERENCES public.batches(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS uploaded_by uuid REFERENCES public.teachers(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'generated' CHECK (source IN ('generated','uploaded'));

-- Teacher yang mengampu course bisa insert sertifikat (upload)
CREATE POLICY certs_insert_teacher ON public.certificates
  FOR INSERT WITH CHECK (
    is_admin() OR (
      source = 'uploaded' AND
      EXISTS (
        SELECT 1 FROM course_teachers ct
        WHERE ct.course_id = certificates.course_id
          AND ct.teacher_id IN (SELECT id FROM teachers WHERE user_id = auth.uid())
      )
    )
  );

-- 3. Storage bucket untuk sertifikat upload guru
INSERT INTO storage.buckets (id, name, public) VALUES ('certificates', 'certificates', true)
ON CONFLICT (id) DO NOTHING;

-- 4. Fungsi award badges (dipanggil trigger saat batch selesai)
CREATE OR REPLACE FUNCTION award_batch_badges()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r record;
  top_id uuid;
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.status = NEW.status THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' AND NEW.status <> 'completed' THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'INSERT' AND NEW.status <> 'completed' THEN
    RETURN NEW;
  END IF;

  -- Batch dinyatakan completed: award badge ke semua enrollment aktif
  INSERT INTO student_badges (user_id, badge_type, title, description, course_id, batch_id)
  SELECT e.user_id, 'graduation', 'Lulus Kelas', 'Menyelesaikan seluruh program kelas', e.course_id, NEW.id
  FROM enrollments e
  WHERE e.batch_id = NEW.id AND e.status = 'active'
  ON CONFLICT (user_id, badge_type, batch_id) DO NOTHING;

  -- Top scorer: nilai agregat tertinggi per batch
  SELECT g.user_id INTO top_id
  FROM grade_aggregates g
  JOIN enrollments e ON e.id = g.enrollment_id
  WHERE e.batch_id = NEW.id AND e.status = 'active'
  ORDER BY g.weighted_total DESC
  LIMIT 1;

  IF top_id IS NOT NULL THEN
    INSERT INTO student_badges (user_id, badge_type, title, description, course_id, batch_id)
    VALUES (top_id, 'top_scorer', 'Nilai Terbaik', 'Pencapaian nilai tertinggi di batch', NULL, NEW.id)
    ON CONFLICT (user_id, badge_type, batch_id) DO NOTHING;
  END IF;

  -- Kehadiran sempurna: semua sesi hadir
  INSERT INTO student_badges (user_id, badge_type, title, description, course_id, batch_id)
  SELECT e.user_id, 'perfect_attendance', 'Kehadiran Sempurna', 'Hadir di 100% pertemuan kelas', e.course_id, NEW.id
  FROM enrollments e
  WHERE e.batch_id = NEW.id AND e.status = 'active'
    AND (
      SELECT count(*) FROM live_sessions s WHERE s.course_id = e.course_id AND s.status = 'completed'
    ) > 0
    AND NOT EXISTS (
      SELECT 1 FROM attendance a
      JOIN live_sessions s ON s.id = a.session_id
      WHERE s.course_id = e.course_id AND a.user_id = e.user_id
        AND a.status = 'absent'
    )
  ON CONFLICT (user_id, badge_type, batch_id) DO NOTHING;

  -- Milestone: penyelesaian batch aktif ke-5 (global, bukan per batch)
  INSERT INTO student_badges (user_id, badge_type, title, description, course_id, batch_id)
  SELECT e.user_id, 'milestone', 'Pelajar Gigih', 'Menyelesaikan 5 kelas di platform', NULL, NEW.id
  FROM enrollments e
  WHERE e.batch_id = NEW.id AND e.status = 'active'
    AND (
      SELECT count(*) FROM enrollments e2
      JOIN batches b2 ON b2.id = e2.batch_id
      WHERE e2.user_id = e.user_id AND b2.status = 'completed'
    ) >= 5
  ON CONFLICT (user_id, badge_type, batch_id) DO NOTHING;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_award_batch_badges ON batches;
CREATE TRIGGER trg_award_batch_badges
AFTER INSERT OR UPDATE OF status ON batches
FOR EACH ROW EXECUTE FUNCTION award_batch_badges();

-- 5. Notifikasi reminder ke teacher saat batch selesai
CREATE OR REPLACE FUNCTION notify_teacher_batch_completed()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  t record;
  course_title text;
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.status <> 'completed' THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'INSERT' AND NEW.status <> 'completed' THEN
    RETURN NEW;
  END IF;

  SELECT c.title::text INTO course_title FROM courses c WHERE c.id = NEW.course_id;

  FOR t IN
    SELECT u.id AS user_id, ct.teacher_id
    FROM course_teachers ct
    JOIN teachers te ON te.id = ct.teacher_id
    JOIN users u ON u.id = te.user_id
    WHERE ct.course_id = NEW.course_id
  LOOP
    INSERT INTO notifications (user_id, type, title, body, link, is_read)
    VALUES (
      t.user_id,
      'info',
      'Batch selesai — unggah sertifikat',
      format('Batch %s dari %s telah selesai. Silakan unggah sertifikat untuk para siswa.', NEW.name, COALESCE(course_title, 'kelas')),
      '/teacher/sertifikat?batch_id=' || NEW.id,
      false
    );
  END LOOP;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_teacher_batch_completed ON batches;
CREATE TRIGGER trg_notify_teacher_batch_completed
AFTER INSERT OR UPDATE OF status ON batches
FOR EACH ROW EXECUTE FUNCTION notify_teacher_batch_completed();