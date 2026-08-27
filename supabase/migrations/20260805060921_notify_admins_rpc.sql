create or replace function public.notify_admins(p_title text, p_body text, p_link text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.notifications (user_id, type, title, body, link, is_read)
  select id, 'info', p_title, p_body, p_link, false
  from public.users
  where role = 'admin' and status = 'active';
end;
$$;