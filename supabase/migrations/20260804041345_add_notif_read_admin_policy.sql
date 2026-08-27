drop policy if exists notif_read_admin on notifications;
create policy notif_read_admin on notifications
for select to public using (is_admin());