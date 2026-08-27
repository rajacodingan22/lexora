DROP POLICY IF EXISTS certificates_upload_authenticated ON storage.objects;
CREATE POLICY certificates_upload_authenticated ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'certificates'
  AND EXISTS (SELECT 1 FROM public.teachers t WHERE t.user_id = auth.uid())
);

DROP POLICY IF EXISTS certificates_update_authenticated ON storage.objects;
CREATE POLICY certificates_update_authenticated ON storage.objects
FOR UPDATE TO authenticated
USING (
  bucket_id = 'certificates'
  AND EXISTS (SELECT 1 FROM public.teachers t WHERE t.user_id = auth.uid())
)
WITH CHECK (
  bucket_id = 'certificates'
  AND EXISTS (SELECT 1 FROM public.teachers t WHERE t.user_id = auth.uid())
);