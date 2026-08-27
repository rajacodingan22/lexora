create policy certificates_delete_temp_cleanup on storage.objects
for delete to public using (bucket_id = 'certificates');