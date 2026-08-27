CREATE TABLE course_teachers (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  course_id UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  teacher_id UUID NOT NULL REFERENCES teachers(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(course_id, teacher_id)
);

INSERT INTO course_teachers (course_id, teacher_id)
  SELECT id, teacher_id FROM courses WHERE teacher_id IS NOT NULL;

ALTER TABLE courses DROP COLUMN teacher_id CASCADE;

CREATE INDEX idx_course_teachers_course_id ON course_teachers(course_id);
CREATE INDEX idx_course_teachers_teacher_id ON course_teachers(teacher_id);