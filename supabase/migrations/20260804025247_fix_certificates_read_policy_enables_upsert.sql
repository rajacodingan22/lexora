DROP POLICY IF EXISTS diag_select_all ON storage.objects;

CREATE POLICY certificates_read_public ON storage.objects
FOR SELECT TO public
USING (bucket_id = 'certificates');

DROP POLICY IF EXISTS certificates_upload_authenticated ON storage.objects;
CREATE POLICY certificates_upload_authenticated ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'certificates');

DROP POLICY IF EXISTS certificates_update_authenticated ON storage.objects;
CREATE POLICY certificates_update_authenticated ON storage.objects
FOR UPDATE TO authenticated
USING (bucket_id = 'certificates')
WITH CHECK (bucket_id = 'certificates');