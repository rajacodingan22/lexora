-- ============ assignments ============
DROP POLICY IF EXISTS assignments_read_teacher ON assignments;
CREATE POLICY assignments_read_teacher ON assignments
  FOR SELECT TO authenticated USING (is_teacher_of_course(course_id));
DROP POLICY IF EXISTS assignments_insert_teacher ON assignments;
CREATE POLICY assignments_insert_teacher ON assignments
  FOR INSERT TO authenticated WITH CHECK (is_teacher_of_course(course_id));
DROP POLICY IF EXISTS assignments_update_teacher ON assignments;
CREATE POLICY assignments_update_teacher ON assignments
  FOR UPDATE TO authenticated USING (is_teacher_of_course(course_id))
  WITH CHECK (is_teacher_of_course(course_id));
DROP POLICY IF EXISTS assignments_delete_teacher ON assignments;
CREATE POLICY assignments_delete_teacher ON assignments
  FOR DELETE TO authenticated USING (is_teacher_of_course(course_id));

-- ============ quizzes ============
DROP POLICY IF EXISTS quizzes_read_teacher ON quizzes;
CREATE POLICY quizzes_read_teacher ON quizzes
  FOR SELECT TO authenticated USING (is_teacher_of_course(course_id));
DROP POLICY IF EXISTS quizzes_insert_teacher ON quizzes;
CREATE POLICY quizzes_insert_teacher ON quizzes
  FOR INSERT TO authenticated WITH CHECK (is_teacher_of_course(course_id));
DROP POLICY IF EXISTS quizzes_update_teacher ON quizzes;
CREATE POLICY quizzes_update_teacher ON quizzes
  FOR UPDATE TO authenticated USING (is_teacher_of_course(course_id))
  WITH CHECK (is_teacher_of_course(course_id));
DROP POLICY IF EXISTS quizzes_delete_teacher ON quizzes;
CREATE POLICY quizzes_delete_teacher ON quizzes
  FOR DELETE TO authenticated USING (is_teacher_of_course(course_id));

-- ============ quiz_questions ============
DROP POLICY IF EXISTS qq_read_teacher ON quiz_questions;
CREATE POLICY qq_read_teacher ON quiz_questions
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM quizzes q WHERE q.id = quiz_questions.quiz_id AND is_teacher_of_course(q.course_id)));
DROP POLICY IF EXISTS qq_insert_teacher ON quiz_questions;
CREATE POLICY qq_insert_teacher ON quiz_questions
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM quizzes q WHERE q.id = quiz_questions.quiz_id AND is_teacher_of_course(q.course_id)));
DROP POLICY IF EXISTS qq_update_teacher ON quiz_questions;
CREATE POLICY qq_update_teacher ON quiz_questions
  FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM quizzes q WHERE q.id = quiz_questions.quiz_id AND is_teacher_of_course(q.course_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM quizzes q WHERE q.id = quiz_questions.quiz_id AND is_teacher_of_course(q.course_id)));
DROP POLICY IF EXISTS qq_delete_teacher ON quiz_questions;
CREATE POLICY qq_delete_teacher ON quiz_questions
  FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM quizzes q WHERE q.id = quiz_questions.quiz_id AND is_teacher_of_course(q.course_id)));

-- ============ quiz_attempts (teacher read/update/delete for grading) ============
DROP POLICY IF EXISTS qa_read_teacher ON quiz_attempts;
CREATE POLICY qa_read_teacher ON quiz_attempts
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM quizzes q WHERE q.id = quiz_attempts.quiz_id AND is_teacher_of_course(q.course_id)));
DROP POLICY IF EXISTS qa_update_teacher ON quiz_attempts;
CREATE POLICY qa_update_teacher ON quiz_attempts
  FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM quizzes q WHERE q.id = quiz_attempts.quiz_id AND is_teacher_of_course(q.course_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM quizzes q WHERE q.id = quiz_attempts.quiz_id AND is_teacher_of_course(q.course_id)));
DROP POLICY IF EXISTS qa_delete_teacher ON quiz_attempts;
CREATE POLICY qa_delete_teacher ON quiz_attempts
  FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM quizzes q WHERE q.id = quiz_attempts.quiz_id AND is_teacher_of_course(q.course_id)));

-- ============ submissions (teacher read/update for grading) ============
DROP POLICY IF EXISTS submissions_read_teacher ON submissions;
CREATE POLICY submissions_read_teacher ON submissions
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM assignments a WHERE a.id = submissions.assignment_id AND is_teacher_of_course(a.course_id)));
DROP POLICY IF EXISTS submissions_update_teacher ON submissions;
CREATE POLICY submissions_update_teacher ON submissions
  FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM assignments a WHERE a.id = submissions.assignment_id AND is_teacher_of_course(a.course_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM assignments a WHERE a.id = submissions.assignment_id AND is_teacher_of_course(a.course_id)));

-- ============ materials (teacher read/write) ============
DROP POLICY IF EXISTS materials_read_teacher ON materials;
CREATE POLICY materials_read_teacher ON materials
  FOR SELECT TO authenticated USING (is_teacher_of_course(course_id));
DROP POLICY IF EXISTS materials_insert_teacher ON materials;
CREATE POLICY materials_insert_teacher ON materials
  FOR INSERT TO authenticated WITH CHECK (is_teacher_of_course(course_id));
DROP POLICY IF EXISTS materials_update_teacher ON materials;
CREATE POLICY materials_update_teacher ON materials
  FOR UPDATE TO authenticated USING (is_teacher_of_course(course_id))
  WITH CHECK (is_teacher_of_course(course_id));
DROP POLICY IF EXISTS materials_delete_teacher ON materials;
CREATE POLICY materials_delete_teacher ON materials
  FOR DELETE TO authenticated USING (is_teacher_of_course(course_id));