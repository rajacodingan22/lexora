drop policy if exists users_read_public_teacher_profiles on public.users;

create policy users_read_public_teacher_profiles on public.users
for select to anon using (
  exists (
    select 1
    from public.teachers t
    where t.user_id = users.id
      and t.status = 'active'
      and t.marketplace_visible = true
  )
);

revoke select on public.users from anon;
grant select (id, display_name, photo_url, bio, role, status) on public.users to anon;