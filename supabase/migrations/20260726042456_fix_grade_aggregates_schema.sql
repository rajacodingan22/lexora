-- Add missing columns to grade_aggregates
ALTER TABLE public.grade_aggregates ADD COLUMN IF NOT EXISTS attendance_score NUMERIC DEFAULT 0;
ALTER TABLE public.grade_aggregates ADD COLUMN IF NOT EXISTS assignment_average NUMERIC DEFAULT 0;
ALTER TABLE public.grade_aggregates ADD COLUMN IF NOT EXISTS quiz_average NUMERIC DEFAULT 0;
ALTER TABLE public.grade_aggregates ADD COLUMN IF NOT EXISTS final_exam_score NUMERIC DEFAULT 0;

-- Create index on enrollment_id for faster lookup
CREATE INDEX IF NOT EXISTS idx_grade_aggregates_enrollment ON grade_aggregates(enrollment_id);