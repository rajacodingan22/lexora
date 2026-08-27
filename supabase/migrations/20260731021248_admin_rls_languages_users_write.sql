-- languages: allow admin writes
create policy "langs_admin_insert" on public.languages
  for insert to public with check (is_admin());

create policy "langs_admin_update" on public.languages
  for update to public using (is_admin()) with check (is_admin());

create policy "langs_admin_delete" on public.languages
  for delete to public using (is_admin());

-- users: allow admin to insert/update/delete any user
create policy "users_insert_admin" on public.users
  for insert to public with check (is_admin());

create policy "users_update_admin" on public.users
  for update to public using (is_admin()) with check (is_admin());

create policy "users_delete_admin" on public.users
  for delete to public using (is_admin());