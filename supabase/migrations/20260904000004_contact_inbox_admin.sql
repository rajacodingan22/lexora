-- Allow admins to mark contact messages as read and delete them.
-- (contact_read_admin already exists; insert is public with non-empty check.)

create policy contact_update_admin on public.contact_messages
  for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy contact_delete_admin on public.contact_messages
  for delete to authenticated
  using (public.is_admin());
