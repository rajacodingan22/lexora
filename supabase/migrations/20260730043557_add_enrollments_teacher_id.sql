ALTER TABLE enrollments ADD COLUMN IF NOT EXISTS teacher_id UUID REFERENCES teachers(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_enrollments_teacher_id ON enrollments(teacher_id);