DROP POLICY IF EXISTS diag_insert_testname ON storage.objects;
DROP POLICY IF EXISTS certificates_upload_authenticated ON storage.objects;
CREATE POLICY certificates_upload_authenticated ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (true);

DROP POLICY IF EXISTS certificates_update_authenticated ON storage.objects;
CREATE POLICY certificates_update_authenticated ON storage.objects
FOR UPDATE TO authenticated
USING (true)
WITH CHECK (true);