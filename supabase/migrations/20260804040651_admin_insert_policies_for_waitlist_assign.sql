drop policy if exists enrollments_insert_admin on enrollments;
create policy enrollments_insert_admin on enrollments
for insert to public with check (is_admin());

drop policy if exists payments_insert_admin on payments;
create policy payments_insert_admin on payments
for insert to public with check (is_admin());

drop policy if exists notif_insert_admin on notifications;
create policy notif_insert_admin on notifications
for insert to public with check (is_admin());