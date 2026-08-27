-- Helper: is the current auth user a teacher of the given course
-- (via course_teachers -> teachers), or an admin?
CREATE OR REPLACE FUNCTION public.is_teacher_of_course(course_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM course_teachers ct
    JOIN teachers t ON t.id = ct.teacher_id
    WHERE ct.course_id = $1 AND t.user_id = auth.uid()
  ) OR public.is_admin()
$$;