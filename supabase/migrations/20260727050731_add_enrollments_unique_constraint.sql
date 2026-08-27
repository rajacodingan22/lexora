-- Prevent duplicate enrollments by adding a unique constraint on (user_id, course_id)
ALTER TABLE public.enrollments
  DROP CONSTRAINT IF EXISTS enrollments_user_id_course_id_key;

ALTER TABLE public.enrollments
  ADD CONSTRAINT enrollments_user_id_course_id_key
  UNIQUE (user_id, course_id);