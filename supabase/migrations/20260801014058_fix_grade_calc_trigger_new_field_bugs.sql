-- Fix two bugs that silently failed quiz/exam/submission inserts:
-- 1) NEW.grade was referenced in a shared ELSIF branch, so any insert/update
--    on quiz_attempts / exam_results / attendance crashed with
--    'record "new" has no field "grade"'.
-- 2) exam_results uses column "exam_id", not "final_exam_id".
CREATE OR REPLACE FUNCTION public.trigger_calculate_grade()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
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
  -- submission graded (grade field only exists on submissions)
  ELSIF TG_TABLE_NAME = 'submissions' THEN
    IF NEW.grade IS NOT NULL THEN
      SELECT e.id INTO v_enrollment_id
      FROM enrollments e
      JOIN assignments a ON a.course_id = e.course_id
      WHERE a.id = NEW.assignment_id AND e.user_id = NEW.user_id
      LIMIT 1;
    END IF;
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
    WHERE fe.id = NEW.exam_id AND e.user_id = NEW.user_id
    LIMIT 1;
  END IF;

  IF v_enrollment_id IS NOT NULL THEN
    PERFORM public.calculate_grade(v_enrollment_id);
  END IF;

  RETURN NEW;
END;
$function$;