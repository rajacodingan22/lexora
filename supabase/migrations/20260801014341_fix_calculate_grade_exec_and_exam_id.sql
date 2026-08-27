-- 1) Allow authenticated users to invoke the (already SECURITY DEFINER)
--    calculate_grade function from the AFTER INSERT/UPDATE triggers.
GRANT EXECUTE ON FUNCTION public.calculate_grade(uuid) TO authenticated;

-- 2) exam_results uses column "exam_id", not "final_exam_id". The old
--    reference raised column-does-not-exist at runtime and nullified the
--    final exam portion of every grade calculation.
CREATE OR REPLACE FUNCTION public.calculate_grade(p_enrollment_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
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
    v_attendance_rate := ROUND((v_attended::NUMERIC / v_total_sessions) * 100, 2);
  END IF;

  -- 2. Assignment average (20%)
  SELECT COALESCE(ROUND(AVG(s.grade), 2), 0)
  INTO v_assignment_avg
  FROM assignments a
  JOIN submissions s ON s.assignment_id = a.id AND s.user_id = v_user_id
  WHERE a.course_id = v_course_id AND s.grade IS NOT NULL;

  -- 3. Quiz average (10%)
  SELECT COALESCE(ROUND(AVG(qa.score), 2), 0)
  INTO v_quiz_avg
  FROM quizzes q
  JOIN quiz_attempts qa ON qa.quiz_id = q.id AND qa.user_id = v_user_id
  WHERE q.course_id = v_course_id;

  -- 4. Final exam (40%)
  SELECT COALESCE(ROUND(AVG(er.score), 2), 0)
  INTO v_final_exam_score
  FROM final_exams fe
  JOIN exam_results er ON er.exam_id = fe.id AND er.user_id = v_user_id
  WHERE fe.course_id = v_course_id;

  -- Weighted total
  v_weighted_total := ROUND(
    (v_attendance_rate * 0.30) +
    (v_assignment_avg * 0.20) +
    (v_quiz_avg * 0.10) +
    (v_final_exam_score * 0.40),
    2
  );

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

  INSERT INTO grade_aggregates (
    enrollment_id, attendance_score, assignment_average, quiz_average, final_exam_score,
    weighted_total, grade_letter, grade_points, is_passing, last_updated
  )
  VALUES (
    p_enrollment_id, v_attendance_rate, v_assignment_avg, v_quiz_avg, v_final_exam_score,
    v_weighted_total, v_grade_letter, v_grade_points, v_is_passing, now()
  )
  ON CONFLICT (enrollment_id) DO UPDATE SET
    attendance_score = EXCLUDED.attendance_score,
    assignment_average = EXCLUDED.assignment_average,
    quiz_average = EXCLUDED.quiz_average,
    final_exam_score = EXCLUDED.final_exam_score,
    weighted_total = EXCLUDED.weighted_total,
    grade_letter = EXCLUDED.grade_letter,
    grade_points = EXCLUDED.grade_points,
    is_passing = EXCLUDED.is_passing,
    last_updated = now();
END;
$function$;