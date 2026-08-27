insert into storage.buckets (id, name, public)
values ('discussions', 'discussions', true)
on conflict (id) do nothing;

-- discussions (student/diskusi)
create policy "discussions_insert_authenticated"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'discussions');
create policy "discussions_read_public"
  on storage.objects for select
  using (bucket_id = 'discussions');
create policy "discussions_delete_authenticated"
  on storage.objects for delete to authenticated
  using (bucket_id = 'discussions');

-- course-materials (admin/kursus)
create policy "course_materials_insert_authenticated"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'course-materials');
create policy "course_materials_read_public"
  on storage.objects for select
  using (bucket_id = 'course-materials');
create policy "course_materials_update_authenticated"
  on storage.objects for update to authenticated
  using (bucket_id = 'course-materials')
  with check (bucket_id = 'course-materials');
create policy "course_materials_delete_authenticated"
  on storage.objects for delete to authenticated
  using (bucket_id = 'course-materials');

-- news-images (admin/berita)
create policy "news_images_insert_authenticated"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'news-images');
create policy "news_images_read_public"
  on storage.objects for select
  using (bucket_id = 'news-images');
create policy "news_images_delete_authenticated"
  on storage.objects for delete to authenticated
  using (bucket_id = 'news-images');

-- teacher-documents (teacher/apply)
create policy "teacher_documents_insert_authenticated"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'teacher-documents');
create policy "teacher_documents_read_public"
  on storage.objects for select
  using (bucket_id = 'teacher-documents');
create policy "teacher_documents_delete_authenticated"
  on storage.objects for delete to authenticated
  using (bucket_id = 'teacher-documents');