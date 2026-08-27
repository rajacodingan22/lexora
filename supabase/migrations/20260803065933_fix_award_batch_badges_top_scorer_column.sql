CREATE OR REPLACE FUNCTION public.award_batch_badges()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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

  INSERT INTO student_badges (user_id, badge_type, title, description, course_id, batch_id)
  SELECT e.user_id, 'graduation', 'Lulus Kelas', 'Menyelesaikan seluruh program kelas', e.course_id, NEW.id
  FROM enrollments e
  WHERE e.batch_id = NEW.id AND e.status = 'active'
  ON CONFLICT (user_id, badge_type, batch_id) DO NOTHING;

  SELECT e.user_id INTO top_id
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
$function$;