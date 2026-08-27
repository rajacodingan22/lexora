-- Teachers must be able to mark attendance for sessions of courses they teach.
-- Previously only attendance_insert (self) and attendance_read_own existed, so
-- upserting/marking attendance for students returned 403 and reading/deleting
-- attendance for a session returned no rows / failed.

create policy "attendance_delete_teacher" on public.attendance
  for delete to public
  using (exists (select 1 from live_sessions ls where ls.id = attendance.session_id and is_teacher_of_course(ls.course_id)));

create policy "attendance_insert_teacher" on public.attendance
  for insert to public
  with check (exists (select 1 from live_sessions ls where ls.id = attendance.session_id and is_teacher_of_course(ls.course_id)));

create policy "attendance_read_teacher" on public.attendance
  for select to public
  using (exists (select 1 from live_sessions ls where ls.id = attendance.session_id and is_teacher_of_course(ls.course_id)));

create policy "attendance_update_teacher" on public.attendance
  for update to public
  using (exists (select 1 from live_sessions ls where ls.id = attendance.session_id and is_teacher_of_course(ls.course_id)))
  with check (exists (select 1 from live_sessions ls where ls.id = attendance.session_id and is_teacher_of_course(ls.course_id)));