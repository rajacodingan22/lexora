-- ==========================================
-- 1. MISSING INDEXES (HIGH PRIORITY)
-- ==========================================
-- NOTE: CONCURRENTLY is omitted because apply_migration runs inside a transaction,
-- and CREATE INDEX CONCURRENTLY cannot execute in a transaction block.
-- IF NOT EXISTS still prevents errors on re-run.

CREATE INDEX IF NOT EXISTS idx_enrollments_user ON enrollments(user_id);
CREATE INDEX IF NOT EXISTS idx_enrollments_course ON enrollments(course_id);
CREATE INDEX IF NOT EXISTS idx_enrollments_batch ON enrollments(batch_id);
CREATE INDEX IF NOT EXISTS idx_enrollments_user_course ON enrollments(user_id, course_id);
CREATE INDEX IF NOT EXISTS idx_enrollments_course_status ON enrollments(course_id, status);
CREATE INDEX IF NOT EXISTS idx_courses_teacher ON courses(teacher_id);
CREATE INDEX IF NOT EXISTS idx_courses_program ON courses(program_id);
CREATE INDEX IF NOT EXISTS idx_batches_course ON batches(course_id);
CREATE INDEX IF NOT EXISTS idx_assignments_course ON assignments(course_id);
CREATE INDEX IF NOT EXISTS idx_quizzes_course ON quizzes(course_id);
CREATE INDEX IF NOT EXISTS idx_materials_course ON materials(course_id);
CREATE INDEX IF NOT EXISTS idx_submissions_assignment ON submissions(assignment_id);
CREATE INDEX IF NOT EXISTS idx_submissions_user ON submissions(user_id);
CREATE INDEX IF NOT EXISTS idx_quiz_questions_quiz ON quiz_questions(quiz_id);
CREATE INDEX IF NOT EXISTS idx_exam_questions_exam ON exam_questions(exam_id);
CREATE INDEX IF NOT EXISTS idx_attendance_session ON attendance(session_id);
CREATE INDEX IF NOT EXISTS idx_attendance_user ON attendance(user_id);
CREATE INDEX IF NOT EXISTS idx_discussion_course ON discussion_posts(course_id);
CREATE INDEX IF NOT EXISTS idx_discussion_parent ON discussion_posts(parent_id);
CREATE INDEX IF NOT EXISTS idx_discussion_user ON discussion_posts(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_user_read ON notifications(user_id, is_read);
CREATE INDEX IF NOT EXISTS idx_certificates_user ON certificates(user_id);
CREATE INDEX IF NOT EXISTS idx_live_sessions_course ON live_sessions(course_id);
CREATE INDEX IF NOT EXISTS idx_quiz_attempts_quiz ON quiz_attempts(quiz_id);
CREATE INDEX IF NOT EXISTS idx_quiz_attempts_user ON quiz_attempts(user_id);
CREATE INDEX IF NOT EXISTS idx_final_exams_course ON final_exams(course_id);
CREATE INDEX IF NOT EXISTS idx_placement_questions_test ON placement_questions(test_id);
CREATE INDEX IF NOT EXISTS idx_teachers_user ON teachers(user_id);
CREATE INDEX IF NOT EXISTS idx_teacher_applications_user ON teacher_applications(user_id);
CREATE INDEX IF NOT EXISTS idx_exam_results_exam ON exam_results(exam_id);
CREATE INDEX IF NOT EXISTS idx_exam_results_user ON exam_results(user_id);

-- ==========================================
-- 2. UNIQUE CONSTRAINTS
-- ==========================================

-- Remove duplicates first if any, then add constraint
DELETE FROM enrollments a USING (
  SELECT MIN(ctid) as ctid, user_id, course_id
  FROM enrollments GROUP BY user_id, course_id HAVING COUNT(*) > 1
) b
WHERE a.user_id = b.user_id AND a.course_id = b.course_id AND a.ctid <> b.ctid;

ALTER TABLE enrollments ADD CONSTRAINT enrollments_user_course_unique UNIQUE (user_id, course_id);

-- Remove duplicate emails
DELETE FROM users a USING (
  SELECT MIN(ctid) as ctid, email
  FROM users GROUP BY email HAVING COUNT(*) > 1
) b
WHERE a.email = b.email AND a.ctid <> b.ctid;

ALTER TABLE users ADD CONSTRAINT users_email_unique UNIQUE (email);

-- ==========================================
-- 3. SET NOT NULL ON CRITICAL FK COLUMNS
-- ==========================================

-- Only if they don't have NULLs (safety check - alter only if safe)
DO $$ BEGIN
  -- enrollments
  IF NOT EXISTS (SELECT 1 FROM enrollments WHERE user_id IS NULL LIMIT 1) THEN
    ALTER TABLE enrollments ALTER COLUMN user_id SET NOT NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM enrollments WHERE course_id IS NULL LIMIT 1) THEN
    ALTER TABLE enrollments ALTER COLUMN course_id SET NOT NULL;
  END IF;
  
  -- teachers
  IF NOT EXISTS (SELECT 1 FROM teachers WHERE user_id IS NULL LIMIT 1) THEN
    ALTER TABLE teachers ALTER COLUMN user_id SET NOT NULL;
  END IF;
  
  -- teacher_applications
  IF NOT EXISTS (SELECT 1 FROM teacher_applications WHERE user_id IS NULL LIMIT 1) THEN
    ALTER TABLE teacher_applications ALTER COLUMN user_id SET NOT NULL;
  END IF;
END $$;

-- ==========================================
-- 4. CHECK CONSTRAINTS
-- ==========================================

ALTER TABLE quiz_attempts ADD CONSTRAINT quiz_attempts_score_range 
  CHECK (score IS NULL OR (score >= 0 AND score <= 100));
ALTER TABLE exam_results ADD CONSTRAINT exam_results_score_range 
  CHECK (score IS NULL OR (score >= 0 AND score <= (CASE WHEN total_points > 0 THEN total_points ELSE 100 END)));
ALTER TABLE courses ADD CONSTRAINT courses_max_students_positive 
  CHECK (max_students IS NULL OR max_students > 0);
ALTER TABLE teachers ADD CONSTRAINT teachers_user_id_unique UNIQUE (user_id);
