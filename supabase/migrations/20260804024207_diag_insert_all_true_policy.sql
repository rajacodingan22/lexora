CREATE POLICY diag_insert_all_true ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (true);