-- Fix teacher "new student joined" : only notify if course is active and teacher is active,
-- and make title/body English and deep link already handled in API.
-- Patch both overloads of notify_course_teachers to guard.

create or replace function public.notify_course_teachers(p_course_id uuid, p_title text, p_body text, p_link text default null::text)
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $$
begin
  if auth.uid() is null then
    raise exception 'Unauthorized';
  end if;
  -- Guard: only if course is active (approved by admin)
  if not exists (select 1 from public.courses c where c.id = p_course_id and c.status = 'active') then
    return;
  end if;
  insert into notifications (user_id, type, title, body, link, is_read)
  select t.user_id, 'info', p_title, p_body, p_link, false
  from course_teachers ct
  join teachers t on t.id = ct.teacher_id
  where ct.course_id = p_course_id
    and t.user_id is not null
    and coalesce(t.status,'active') = 'active';
end;
$$;

create or replace function public.notify_course_teachers(p_course_id uuid, p_title text, p_body text, p_link text default null::text, p_template_key text default null::text, p_params jsonb default null::jsonb)
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $$
begin
  if auth.uid() is null then
    raise exception 'Unauthorized';
  end if;
  if not exists (select 1 from public.courses c where c.id = p_course_id and c.status = 'active') then
    return;
  end if;
  insert into notifications (user_id, type, title, body, link, is_read, template_key, params)
  select t.user_id, 'info', p_title, p_body, p_link, false, p_template_key, p_params
  from course_teachers ct
  join teachers t on t.id = ct.teacher_id
  where ct.course_id = p_course_id
    and t.user_id is not null
    and coalesce(t.status,'active') = 'active';
end;
$$;
