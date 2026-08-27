-- Hardening storage policies for permissive buckets

-- discussions: scope to owner folder
drop policy if exists "discussions_insert_authenticated" on storage.objects;
create policy "discussions_insert_authenticated" on storage.objects for insert to authenticated with check (bucket_id='discussions' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "discussions_delete_authenticated" on storage.objects;
create policy "discussions_delete_authenticated" on storage.objects for delete to authenticated using (bucket_id='discussions' and ((storage.foldername(name))[1] = auth.uid()::text or is_admin()));

drop policy if exists "discussions_update_authenticated" on storage.objects;
create policy "discussions_update_authenticated" on storage.objects for update to authenticated using (bucket_id='discussions' and ((storage.foldername(name))[1] = auth.uid()::text or is_admin())) with check (bucket_id='discussions' and ((storage.foldername(name))[1] = auth.uid()::text or is_admin()));

-- course-materials: admin only for write
drop policy if exists "course_materials_insert_authenticated" on storage.objects;
create policy "course_materials_insert_authenticated" on storage.objects for insert to authenticated with check (bucket_id='course-materials' and is_admin());

drop policy if exists "course_materials_delete_authenticated" on storage.objects;
create policy "course_materials_delete_authenticated" on storage.objects for delete to authenticated using (bucket_id='course-materials' and is_admin());

drop policy if exists "course_materials_update_authenticated" on storage.objects;
create policy "course_materials_update_authenticated" on storage.objects for update to authenticated using (bucket_id='course-materials' and is_admin()) with check (bucket_id='course-materials' and is_admin());

-- news-images: admin only for write
drop policy if exists "news_images_insert_authenticated" on storage.objects;
create policy "news_images_insert_authenticated" on storage.objects for insert to authenticated with check (bucket_id='news-images' and is_admin());

drop policy if exists "news_images_delete_authenticated" on storage.objects;
create policy "news_images_delete_authenticated" on storage.objects for delete to authenticated using (bucket_id='news-images' and is_admin());

drop policy if exists "news_images_update_authenticated" on storage.objects;
create policy "news_images_update_authenticated" on storage.objects for update to authenticated using (bucket_id='news-images' and is_admin()) with check (bucket_id='news-images' and is_admin());

-- cms: should be admin only
drop policy if exists "cms_insert_authenticated" on storage.objects;
create policy "cms_insert_authenticated" on storage.objects for insert to authenticated with check (bucket_id='cms' and is_admin());

drop policy if exists "cms_delete_authenticated" on storage.objects;
create policy "cms_delete_authenticated" on storage.objects for delete to authenticated using (bucket_id='cms' and is_admin());

drop policy if exists "cms_update_authenticated" on storage.objects;
create policy "cms_update_authenticated" on storage.objects for update to authenticated using (bucket_id='cms' and is_admin()) with check (bucket_id='cms' and is_admin());

-- certificates: scope to owner or admin (path like user_id/file or course_id/file). Use foldername[1] = auth.uid() or is_admin
drop policy if exists "certificates_upload_authenticated" on storage.objects;
create policy "certificates_upload_authenticated" on storage.objects for insert to authenticated with check (bucket_id='certificates' and ((storage.foldername(name))[1] = auth.uid()::text or is_admin()));

drop policy if exists "certificates_update_authenticated" on storage.objects;
create policy "certificates_update_authenticated" on storage.objects for update to authenticated using (bucket_id='certificates' and ((storage.foldername(name))[1] = auth.uid()::text or is_admin())) with check (bucket_id='certificates' and ((storage.foldername(name))[1] = auth.uid()::text or is_admin()));

drop policy if exists "certificates_delete_authenticated" on storage.objects;
create policy "certificates_delete_authenticated" on storage.objects for delete to authenticated using (bucket_id='certificates' and ((storage.foldername(name))[1] = auth.uid()::text or is_admin()));
