-- The student assignment upload flow references a storage bucket named
-- 'submissions' which never existed -> uploads silently failed. Create it
-- as a public bucket (like the sibling 'assignment-submissions' bucket)
-- with matching RLS policies.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'submissions',
  'submissions',
  true,
  10485760,
  ARRAY[
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'image/png',
    'image/jpeg'
  ]
)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS submissions_read_public ON storage.objects;
CREATE POLICY submissions_read_public ON storage.objects
  FOR SELECT TO public USING (bucket_id = 'submissions');

DROP POLICY IF EXISTS submissions_insert_authenticated ON storage.objects;
CREATE POLICY submissions_insert_authenticated ON storage.objects
  FOR INSERT TO authenticated WITH CHECK (bucket_id = 'submissions');

DROP POLICY IF EXISTS submissions_update_authenticated ON storage.objects;
CREATE POLICY submissions_update_authenticated ON storage.objects
  FOR UPDATE TO authenticated USING (bucket_id = 'submissions')
  WITH CHECK (bucket_id = 'submissions');

-- Files are stored as "<assignment_id>/<user_id>_<timestamp>.<ext>" so the
-- owner match is on the second path segment with a user-id prefix.
DROP POLICY IF EXISTS submissions_delete_own ON storage.objects;
CREATE POLICY submissions_delete_own ON storage.objects
  FOR DELETE TO authenticated
  USING ((bucket_id = 'submissions') AND ((storage.foldername(name))[2] LIKE (auth.uid())::text || '_%'));