alter table public.assignments
  add column teacher_id uuid references public.teachers(id);

alter table public.live_sessions
  add column teacher_id uuid references public.teachers(id);

create index if not exists idx_assignments_teacher_id on public.assignments(teacher_id);
create index if not exists idx_live_sessions_teacher_id on public.live_sessions(teacher_id);
create index if not exists idx_enrollments_teacher_id on public.enrollments(teacher_id);

drop policy assignments_read_enrolled on public.assignments;
create policy assignments_read_enrolled on public.assignments
  for select
  using (
    (
      exists (
        select 1 from public.enrollments e
        where e.course_id = assignments.course_id
          and e.user_id = auth.uid()
          and (
            e.teacher_id is null
            or assignments.teacher_id is null
            or e.teacher_id = assignments.teacher_id
          )
      )
    )
    or is_admin()
  );

drop policy assignments_insert_teacher on public.assignments;
create policy assignments_insert_teacher on public.assignments
  for insert
  with check (
    is_teacher_of_course(course_id)
    and (teacher_id is null or teacher_id = (select id from public.teachers where user_id = auth.uid()))
  );

drop policy assignments_update_teacher on public.assignments;
create policy assignments_update_teacher on public.assignments
  for update
  using (
    is_teacher_of_course(course_id)
    and (teacher_id is null or teacher_id = (select id from public.teachers where user_id = auth.uid()))
  )
  with check (
    is_teacher_of_course(course_id)
    and (teacher_id is null or teacher_id = (select id from public.teachers where user_id = auth.uid()))
  );

drop policy sessions_read_allowed on public.live_sessions;
create policy sessions_read_allowed on public.live_sessions
  for select
  using (
    (
      exists (
        select 1 from public.enrollments e
        where e.course_id = live_sessions.course_id
          and e.user_id = auth.uid()
          and (
            e.teacher_id is null
            or live_sessions.teacher_id is null
            or e.teacher_id = live_sessions.teacher_id
          )
      )
    )
    or (
      exists (
        select 1 from public.course_teachers ct
        join public.teachers t on t.id = ct.teacher_id
        where ct.course_id = live_sessions.course_id
          and t.user_id = auth.uid()
      )
    )
    or is_admin()
  );

drop policy sessions_write_teachers on public.live_sessions;
create policy sessions_write_teachers on public.live_sessions
  for insert
  with check (
    (
      exists (
        select 1 from public.course_teachers ct
        join public.teachers t on t.id = ct.teacher_id
        where ct.course_id = live_sessions.course_id
          and t.user_id = auth.uid()
      )
      and (teacher_id is null or teacher_id = (select id from public.teachers where user_id = auth.uid()))
    )
    or is_admin()
  );

drop policy sessions_update_teachers on public.live_sessions;
create policy sessions_update_teachers on public.live_sessions
  for update
  using (
    (
      exists (
        select 1 from public.course_teachers ct
        join public.teachers t on t.id = ct.teacher_id
        where ct.course_id = live_sessions.course_id
          and t.user_id = auth.uid()
      )
      and (teacher_id is null or teacher_id = (select id from public.teachers where user_id = auth.uid()))
    )
    or is_admin()
  )
  with check (
    (
      exists (
        select 1 from public.course_teachers ct
        join public.teachers t on t.id = ct.teacher_id
        where ct.course_id = live_sessions.course_id
          and t.user_id = auth.uid()
      )
      and (teacher_id is null or teacher_id = (select id from public.teachers where user_id = auth.uid()))
    )
    or is_admin()
  );