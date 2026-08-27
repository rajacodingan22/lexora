DROP POLICY IF EXISTS certificates_upload_authenticated ON storage.objects;
CREATE POLICY certificates_upload_authenticated ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'certificates');