create policy "attendance_read_admin" on public.attendance
  for select to authenticated using (is_admin());