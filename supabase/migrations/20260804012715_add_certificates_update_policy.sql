CREATE POLICY certificates_update_authenticated ON storage.objects
FOR UPDATE TO authenticated
USING (
  bucket_id = 'certificates'
  AND (public.is_admin() OR EXISTS (SELECT 1 FROM public.teachers t WHERE t.user_id = auth.uid()))
)
WITH CHECK (
  bucket_id = 'certificates'
  AND (public.is_admin() OR EXISTS (SELECT 1 FROM public.teachers t WHERE t.user_id = auth.uid()))
);