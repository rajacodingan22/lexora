alter table public.users drop constraint if exists users_status_check;
alter table public.users add constraint users_status_check check (status in ('active', 'inactive', 'suspended', 'pending'));

create or replace function public.sync_auth_user()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  insert into public.users (id, email, display_name, role, status, created_at, updated_at)
  values (
    new.id,
    new.email,
    new.raw_user_meta_data ->> 'display_name',
    coalesce(new.raw_user_meta_data ->> 'role', 'student'),
    case
      when coalesce(new.raw_user_meta_data ->> 'role', 'student') = 'teacher' then 'pending'
      else 'active'
    end,
    new.created_at,
    new.created_at
  );
  return new;
end;
$function$;