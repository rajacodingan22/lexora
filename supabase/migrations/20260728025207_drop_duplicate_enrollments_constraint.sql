-- Drop duplicate unique constraint (keep enrollments_user_course_unique)
ALTER TABLE public.enrollments DROP CONSTRAINT IF EXISTS enrollments_user_id_course_id_key;
