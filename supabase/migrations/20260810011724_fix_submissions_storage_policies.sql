-- ============================================================
-- Perbaiki RLS storage bucket 'submissions'.
-- Path upload aplikasi: {assignment_id}/{user_id}_{ts}.{ext}
-- Policy lama memakai storage.foldername(name)[2] (asumsi path
-- 2-folder) sehingga foldername[2] = NULL -> upload 400.
-- Ganti dengan pemeriksaan nama file: storage.filename(name).
-- ============================================================

-- INSERT: student boleh upload bila nama file diawali user_id-nya
drop policy if exists submissions_insert_scoped on storage.objects;
create policy submissions_insert_scoped on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'submissions'
    and storage.filename(name) like (auth.uid()::text || '_%')
  );

-- SELECT: pemilik file, teacher course, atau admin
drop policy if exists submissions_read_scoped on storage.objects;
create policy submissions_read_scoped on storage.objects
  for select to authenticated
  using (
    bucket_id = 'submissions'
    and (
      storage.filename(name) like (auth.uid()::text || '_%')
      or exists (
        select 1 from assignments a
        where a.id = (storage.foldername(objects.name))[1]::uuid
          and is_teacher_of_course(a.course_id)
      )
      or is_admin()
    )
  );

-- UPDATE: pemilik file atau admin (resubmission del replace)
drop policy if exists submissions_update_scoped on storage.objects;
create policy submissions_update_scoped on storage.objects
  for update to authenticated
  using (
    bucket_id = 'submissions'
    and (
      storage.filename(name) like (auth.uid()::text || '_%')
      or is_admin()
    )
  )
  with check (
    bucket_id = 'submissions'
    and (
      storage.filename(name) like (auth.uid()::text || '_%')
      or is_admin()
    )
  );

-- DELETE: pemilik file atau admin
drop policy if exists submissions_delete_own on storage.objects;
create policy submissions_delete_own on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'submissions'
    and (
      storage.filename(name) like (auth.uid()::text || '_%')
      or is_admin()
    )
  );