-- RPC aman: siswa (yang terdaftar di course) atau admin bisa mengirim notif ke semua admin.
-- security definer -> jalan dengan hak owner sehingga tidak terblokir RLS notifications.
create or replace function public.notify_admins_for_course(
  p_course_id uuid,
  p_title text,
  p_body text,
  p_link text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_enrolled boolean;
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  select exists (
    select 1 from public.enrollments e
    where e.user_id = v_uid and e.course_id = p_course_id
  ) into v_enrolled;

  if not v_enrolled and not public.is_admin() then
    raise exception 'Not authorized';
  end if;

  insert into public.notifications (user_id, type, title, body, link, is_read)
  select id, 'info', p_title, p_body, p_link, false
  from public.users
  where role = 'admin' and status = 'active'
    and (notification_settings is null
         or coalesce((notification_settings -> 'admin')::boolean, true));
end;
$$;

revoke execute on function public.notify_admins_for_course(uuid, text, text, text) from public, anon;
grant execute on function public.notify_admins_for_course(uuid, text, text, text) to authenticated, service_role;