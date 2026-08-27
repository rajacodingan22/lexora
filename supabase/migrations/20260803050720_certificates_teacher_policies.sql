-- Teacher read: guru yang mengampu course batch bisa lihat sertifikat siswanya
CREATE POLICY certs_read_teacher ON public.certificates
  FOR SELECT USING (
    is_admin() OR (
      EXISTS (
        SELECT 1 FROM course_teachers ct
        WHERE ct.course_id = certificates.course_id
          AND ct.teacher_id IN (SELECT id FROM teachers WHERE user_id = auth.uid())
      )
    )
  );

-- Teacher update: replace sertifikat yang dia upload sendiri
CREATE POLICY certs_update_teacher ON public.certificates
  FOR UPDATE USING (
    source = 'uploaded' AND EXISTS (
      SELECT 1 FROM course_teachers ct
      WHERE ct.course_id = certificates.course_id
        AND ct.teacher_id IN (SELECT id FROM teachers WHERE user_id = auth.uid())
    )
  );