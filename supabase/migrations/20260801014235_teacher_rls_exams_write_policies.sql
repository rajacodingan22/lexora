-- ============ final_exams ============
DROP POLICY IF EXISTS fe_delete_teacher ON final_exams;
CREATE POLICY fe_delete_teacher ON final_exams
  FOR DELETE TO authenticated USING ((auth.uid() = teacher_id) OR public.is_admin());

-- ============ exam_questions ============
DROP POLICY IF EXISTS eq_update_teacher ON exam_questions;
CREATE POLICY eq_update_teacher ON exam_questions
  FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM final_exams fe WHERE fe.id = exam_questions.exam_id AND fe.teacher_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM final_exams fe WHERE fe.id = exam_questions.exam_id AND fe.teacher_id = auth.uid()));
DROP POLICY IF EXISTS eq_delete_teacher ON exam_questions;
CREATE POLICY eq_delete_teacher ON exam_questions
  FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM final_exams fe WHERE fe.id = exam_questions.exam_id AND fe.teacher_id = auth.uid()));

-- ============ exam_results ============
DROP POLICY IF EXISTS er_delete_teacher ON exam_results;
CREATE POLICY er_delete_teacher ON exam_results
  FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM final_exams fe WHERE fe.id = exam_results.exam_id AND fe.teacher_id = auth.uid()));