create or replace function public.notify_course_teachers(p_course_id uuid, p_title text, p_body text, p_link text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Unauthorized';
  end if;
  insert into notifications (user_id, type, title, body, link, is_read)
  select t.user_id, 'info', p_title, p_body, p_link, false
  from course_teachers ct
  join teachers t on t.id = ct.teacher_id
  where ct.course_id = p_course_id
    and t.user_id is not null;
end;
$$;

revoke all on function public.notify_course_teachers(uuid, text, text, text) from public;
grant execute on function public.notify_course_teachers(uuid, text, text, text) to authenticated;