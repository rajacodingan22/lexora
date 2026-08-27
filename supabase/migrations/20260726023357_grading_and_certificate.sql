-- Fungsi menghitung grade aggregate dengan bobot: 30% absen, 20% tugas, 10% kuis, 40% final exam
CREATE OR REPLACE FUNCTION public.calculate_grade(p_enrollment_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = 'public'
AS $$
DECLARE
  v_attendance_rate NUMERIC := 0;
  v_assignment_avg NUMERIC := 0;
  v_quiz_avg NUMERIC := 0;
  v_final_exam_score NUMERIC := 0;
  v_total_sessions INT := 0;
  v_attended INT := 0;
  v_weighted_total NUMERIC := 0;
  v_grade_letter TEXT;
  v_grade_points NUMERIC;
  v_is_passing BOOLEAN;
  v_course_id UUID;
  v_user_id UUID;
BEGIN
  -- Get course_id and user_id from enrollment
  SELECT e.course_id, e.user_id INTO v_course_id, v_user_id
  FROM enrollments e WHERE e.id = p_enrollment_id;
  
  IF v_course_id IS NULL THEN RETURN; END IF;

  -- 1. Attendance rate (30%)
  SELECT COUNT(*), COUNT(*) FILTER (WHERE a.status = 'present')
  INTO v_total_sessions, v_attended
  FROM live_sessions ls
  LEFT JOIN attendance a ON a.session_id = ls.id AND a.user_id = v_user_id
  WHERE ls.course_id = v_course_id;

  IF v_total_sessions > 0 THEN
    v_attendance_rate := (v_attended::NUMERIC / v_total_sessions) * 100;
  END IF;

  -- 2. Assignment average (20%)
  SELECT COALESCE(AVG(s.grade), 0)
  INTO v_assignment_avg
  FROM assignments a
  JOIN submissions s ON s.assignment_id = a.id AND s.user_id = v_user_id
  WHERE a.course_id = v_course_id AND s.grade IS NOT NULL;

  -- 3. Quiz average (10%)
  SELECT COALESCE(AVG(qa.score), 0)
  INTO v_quiz_avg
  FROM quizzes q
  JOIN quiz_attempts qa ON qa.quiz_id = q.id AND qa.user_id = v_user_id
  WHERE q.course_id = v_course_id;

  -- 4. Final exam (40%)
  SELECT COALESCE(AVG(er.score), 0)
  INTO v_final_exam_score
  FROM final_exams fe
  JOIN exam_results er ON er.final_exam_id = fe.id AND er.user_id = v_user_id
  WHERE fe.course_id = v_course_id;

  -- Weighted total
  v_weighted_total := (v_attendance_rate * 0.30) + (v_assignment_avg * 0.20) + (v_quiz_avg * 0.10) + (v_final_exam_score * 0.40);

  -- Grade letter
  IF v_weighted_total >= 85 THEN
    v_grade_letter := 'A';
    v_grade_points := 4.0;
  ELSIF v_weighted_total >= 75 THEN
    v_grade_letter := 'B';
    v_grade_points := 3.0;
  ELSIF v_weighted_total >= 65 THEN
    v_grade_letter := 'C';
    v_grade_points := 2.0;
  ELSIF v_weighted_total >= 55 THEN
    v_grade_letter := 'D';
    v_grade_points := 1.0;
  ELSE
    v_grade_letter := 'E';
    v_grade_points := 0;
  END IF;

  v_is_passing := v_weighted_total >= 65;

  -- Upsert grade_aggregates
  INSERT INTO grade_aggregates (enrollment_id, weighted_total, grade_letter, grade_points, is_passing, last_updated)
  VALUES (p_enrollment_id, v_weighted_total, v_grade_letter, v_grade_points, v_is_passing, now())
  ON CONFLICT (enrollment_id) DO UPDATE SET
    weighted_total = EXCLUDED.weighted_total,
    grade_letter = EXCLUDED.grade_letter,
    grade_points = EXCLUDED.grade_points,
    is_passing = EXCLUDED.is_passing,
    last_updated = now();
END;
$$;

-- Trigger: auto-calculate grade after attendance, submission, quiz attempt, or exam result changes
CREATE OR REPLACE FUNCTION public.trigger_calculate_grade()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = 'public'
AS $$
DECLARE
  v_enrollment_id UUID;
BEGIN
  -- attendance changes
  IF TG_TABLE_NAME = 'attendance' THEN
    SELECT e.id INTO v_enrollment_id
    FROM enrollments e
    JOIN live_sessions ls ON ls.course_id = e.course_id
    WHERE ls.id = NEW.session_id AND e.user_id = NEW.user_id
    LIMIT 1;
  -- submission graded
  ELSIF TG_TABLE_NAME = 'submissions' AND NEW.grade IS NOT NULL THEN
    SELECT e.id INTO v_enrollment_id
    FROM enrollments e
    JOIN assignments a ON a.course_id = e.course_id
    WHERE a.id = NEW.assignment_id AND e.user_id = NEW.user_id
    LIMIT 1;
  -- quiz attempt
  ELSIF TG_TABLE_NAME = 'quiz_attempts' THEN
    SELECT e.id INTO v_enrollment_id
    FROM enrollments e
    JOIN quizzes q ON q.course_id = e.course_id
    WHERE q.id = NEW.quiz_id AND e.user_id = NEW.user_id
    LIMIT 1;
  -- exam result
  ELSIF TG_TABLE_NAME = 'exam_results' THEN
    SELECT e.id INTO v_enrollment_id
    FROM enrollments e
    JOIN final_exams fe ON fe.course_id = e.course_id
    WHERE fe.id = NEW.final_exam_id AND e.user_id = NEW.user_id
    LIMIT 1;
  END IF;

  IF v_enrollment_id IS NOT NULL THEN
    PERFORM public.calculate_grade(v_enrollment_id);
  END IF;

  RETURN NEW;
END;
$$;

-- Drop existing triggers if any
DROP TRIGGER IF EXISTS trg_calc_grade_attendance ON public.attendance;
DROP TRIGGER IF EXISTS trg_calc_grade_submission ON public.submissions;
DROP TRIGGER IF EXISTS trg_calc_grade_quiz ON public.quiz_attempts;
DROP TRIGGER IF EXISTS trg_calc_grade_exam ON public.exam_results;

CREATE TRIGGER trg_calc_grade_attendance
  AFTER INSERT OR UPDATE ON public.attendance
  FOR EACH ROW EXECUTE FUNCTION trigger_calculate_grade();

CREATE TRIGGER trg_calc_grade_submission
  AFTER UPDATE OF grade ON public.submissions
  FOR EACH ROW EXECUTE FUNCTION trigger_calculate_grade();

CREATE TRIGGER trg_calc_grade_quiz
  AFTER INSERT OR UPDATE OF score ON public.quiz_attempts
  FOR EACH ROW EXECUTE FUNCTION trigger_calculate_grade();

CREATE TRIGGER trg_calc_grade_exam
  AFTER INSERT OR UPDATE OF score ON public.exam_results
  FOR EACH ROW EXECUTE FUNCTION trigger_calculate_grade();

-- Fungsi auto-generate sertifikat ketika grade is_passing = true
CREATE OR REPLACE FUNCTION public.auto_generate_certificate()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = 'public'
AS $$
DECLARE
  v_course_id UUID;
  v_user_id UUID;
  v_cert_code TEXT;
  v_existing INT;
BEGIN
  -- Only generate when newly passing
  IF NEW.is_passing = true AND (OLD.is_passing IS NULL OR OLD.is_passing = false) THEN
    SELECT e.course_id, e.user_id INTO v_course_id, v_user_id
    FROM enrollments e WHERE e.id = NEW.enrollment_id;

    -- Check if certificate already exists
    SELECT COUNT(*) INTO v_existing
    FROM certificates
    WHERE enrollment_id = NEW.enrollment_id;

    IF v_existing = 0 THEN
      -- Generate certificate code
      v_cert_code := 'EDU-' || UPPER(SUBSTRING(MD5(NEW.id::TEXT || NOW()::TEXT) FROM 1 FOR 8));

      INSERT INTO certificates (enrollment_id, user_id, course_id, certificate_code, status, final_grade, issue_date)
      VALUES (NEW.enrollment_id, v_user_id, v_course_id, v_cert_code, 'generated', NEW.weighted_total, CURRENT_DATE);
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_auto_certificate ON public.grade_aggregates;

CREATE TRIGGER trg_auto_certificate
  AFTER INSERT OR UPDATE OF is_passing ON public.grade_aggregates
  FOR EACH ROW EXECUTE FUNCTION auto_generate_certificate();

-- Add unique constraint on enrollment_id for grade_aggregates
ALTER TABLE public.grade_aggregates ADD CONSTRAINT grade_aggregates_enrollment_id_key UNIQUE (enrollment_id);
