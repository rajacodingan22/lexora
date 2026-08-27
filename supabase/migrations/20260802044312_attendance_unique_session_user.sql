delete from public.attendance a using public.attendance b
where a.id > b.id and a.session_id = b.session_id and a.user_id = b.user_id;
create unique index if not exists attendance_session_user_key on public.attendance (session_id, user_id);