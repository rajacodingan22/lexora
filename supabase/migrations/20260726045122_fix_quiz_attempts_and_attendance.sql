-- Add status and created_at columns to quiz_attempts
ALTER TABLE quiz_attempts ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'in_progress';
ALTER TABLE quiz_attempts ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT now();

-- Add marked_at column to attendance
ALTER TABLE attendance ADD COLUMN IF NOT EXISTS marked_at TIMESTAMPTZ;
