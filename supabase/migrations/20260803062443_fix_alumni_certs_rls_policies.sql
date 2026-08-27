-- 1) Alumni publik: boleh baca enrollments untuk batch yang sudah completed
DROP POLICY IF EXISTS "enrollments_read_alumni" ON public.enrollments;
CREATE POLICY "enrollments_read_alumni" ON public.enrollments
FOR SELECT TO public
USING (
  EXISTS (
    SELECT 1 FROM public.batches b
    WHERE b.id = enrollments.batch_id AND b.status = 'completed'
  )
);

-- 2) Alumni publik: boleh baca sertifikat untuk batch yang sudah completed
DROP POLICY IF EXISTS "certs_read_alumni" ON public.certificates;
CREATE POLICY "certs_read_alumni" ON public.certificates
FOR SELECT TO public
USING (
  EXISTS (
    SELECT 1 FROM public.batches b
    WHERE b.id = certificates.batch_id AND b.status = 'completed'
  )
);

-- 3) Storage: guru (dan admin) boleh upload ke bucket 'certificates'
DROP POLICY IF EXISTS "certificates_upload_authenticated" ON storage.objects;
CREATE POLICY "certificates_upload_authenticated" ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'certificates'
  AND (
    public.is_admin()
    OR EXISTS (
      SELECT 1 FROM public.teachers t WHERE t.user_id = auth.uid()
    )
  )
);

-- 4) Notifikasi: guru boleh kirim notif ke siswa yang terdaftar di batch yang dia ajar
DROP POLICY IF EXISTS "notif_insert_teacher" ON public.notifications;
CREATE POLICY "notif_insert_teacher" ON public.notifications
FOR INSERT TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.enrollments e
    JOIN public.batches b ON b.id = e.batch_id
    JOIN public.course_teachers ct ON ct.course_id = b.course_id
    JOIN public.teachers t ON t.id = ct.teacher_id
    WHERE e.user_id = notifications.user_id
      AND t.user_id = auth.uid()
      AND e.batch_id IS NOT NULL
  )
);