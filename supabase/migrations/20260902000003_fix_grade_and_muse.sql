-- Fix grade_aggregates RLS for teacher read + set muse-spark-1.2
-- grade_aggregates teacher can read via enrollments+course_teachers
drop policy if exists grade_aggregates_select_teacher on public.grade_aggregates;
create policy grade_aggregates_select_teacher on public.grade_aggregates
  for select to authenticated
  using (
    exists (
      select 1 from public.enrollments e
      join public.course_teachers ct on ct.course_id = e.course_id
      join public.teachers t on t.id = ct.teacher_id
      where e.id = grade_aggregates.enrollment_id
        and t.user_id = auth.uid()
    )
  );

-- Ensure ai_model is muse-spark-1.2 (OpenCode Zen)
insert into public.system_settings (key, value) values ('ai_model', '"muse-spark-1.2"'::jsonb)
on conflict (key) do update set value = '"muse-spark-1.2"'::jsonb;

-- Also ensure ai_enabled true
insert into public.system_settings (key, value) values ('ai_enabled', '"true"'::jsonb)
on conflict (key) do update set value = '"true"'::jsonb;
