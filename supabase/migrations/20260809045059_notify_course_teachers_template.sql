create or replace function public.notify_course_teachers(
  p_course_id uuid,
  p_title text,
  p_body text,
  p_link text default null,
  p_template_key text default null,
  p_params jsonb default null
)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if auth.uid() is null then
    raise exception 'Unauthorized';
  end if;
  insert into notifications (user_id, type, title, body, link, is_read, template_key, params)
  select t.user_id, 'info', p_title, p_body, p_link, false, p_template_key, p_params
  from course_teachers ct
  join teachers t on t.id = ct.teacher_id
  where ct.course_id = p_course_id
    and t.user_id is not null;
end;
$function$;

grant execute on function public.notify_course_teachers(uuid, text, text, text, text, jsonb) to authenticated;