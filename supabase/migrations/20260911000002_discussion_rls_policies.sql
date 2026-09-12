-- discussion_posts selama ini RLS-nya ON tanpa policy (baca/tulis selalu 0 baris).
-- Aturan: se-batch aktif + guru pengampu + admin. Student tidak bisa edit.
-- Reply wajib satu course, ke thread yang tidak terkunci & tidak terhapus (dicek di DB).

-- 1. SELECT: milik sendiri, se-batch aktif, guru pengampu, admin
drop policy if exists discussion_posts_read_batch on public.discussion_posts;
create policy discussion_posts_read_batch on public.discussion_posts
  for select
  to authenticated
  using (
    user_id = (select auth.uid())
    or is_admin()
    or is_teacher_of_course(course_id)
    or exists (
      select 1
      from public.enrollments e_me
      join public.enrollments e_them
        on e_them.course_id = discussion_posts.course_id
       and e_them.user_id = discussion_posts.user_id
       and e_them.status = 'active'
      where e_me.course_id = discussion_posts.course_id
        and e_me.user_id = (select auth.uid())
        and e_me.status = 'active'
        and e_me.batch_id is not null
        and e_me.batch_id = e_them.batch_id
    )
  );

-- 2. INSERT: anti-spoofing user_id + parent satu course & tidak locked/deleted
drop policy if exists discussion_posts_insert_batch on public.discussion_posts;
create policy discussion_posts_insert_batch on public.discussion_posts
  for insert
  to authenticated
  with check (
    user_id = (select auth.uid())
    and (
      is_admin()
      or is_teacher_of_course(course_id)
      or exists (
        select 1
        from public.enrollments e
        where e.course_id = discussion_posts.course_id
          and e.user_id = (select auth.uid())
          and e.status = 'active'
          and e.batch_id is not null
      )
    )
    and (
      parent_id is null
      or exists (
        select 1
        from public.discussion_posts p
        where p.id = discussion_posts.parent_id
          and p.course_id = discussion_posts.course_id
          and p.is_locked = false
          and p.is_deleted = false
      )
    )
  );

-- 3. UPDATE: hanya guru pengampu + admin (pin/lock/soft-delete). Student: kirim = final.
drop policy if exists discussion_posts_update_staff on public.discussion_posts;
create policy discussion_posts_update_staff on public.discussion_posts
  for update
  to authenticated
  using (is_admin() or is_teacher_of_course(course_id))
  with check (is_admin() or is_teacher_of_course(course_id));

-- Tanpa policy DELETE: hapus permanen hanya via service_role. Aplikasi memakai is_deleted.
