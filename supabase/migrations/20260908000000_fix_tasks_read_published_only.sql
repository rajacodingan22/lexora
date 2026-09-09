-- Fix Tasks RLS: student hanya boleh baca konten published via batch published
-- Sebelumnya read_enrolled tidak cek status sehingga konten draft bisa dibaca bila tahu ID.
-- Availability window tetap dicek di app layer (/api/student/progress + fetchAssignedTasks).

drop policy if exists task_lessons_read_enrolled on public.task_lessons;
create policy task_lessons_read_enrolled on public.task_lessons
  for select to public
  using (
    task_lessons.status = 'published'
    and exists (
      select 1 from batch_tasks bt
      join enrollments e on e.batch_id = bt.batch_id
      where bt.task_id = task_lessons.task_id
        and bt.status = 'published'
        and e.user_id = auth.uid()
    )
  );

drop policy if exists lesson_activities_read_enrolled on public.lesson_activities;
create policy lesson_activities_read_enrolled on public.lesson_activities
  for select to public
  using (
    lesson_activities.status = 'published'
    and exists (
      select 1 from task_lessons tl
      join batch_tasks bt on bt.task_id = tl.task_id
      join enrollments e on e.batch_id = bt.batch_id
      where tl.id = lesson_activities.lesson_id
        and tl.status = 'published'
        and bt.status = 'published'
        and e.user_id = auth.uid()
    )
  );

drop policy if exists activity_content_read_enrolled on public.activity_content;
create policy activity_content_read_enrolled on public.activity_content
  for select to public
  using (
    exists (
      select 1 from lesson_activities la
      join task_lessons tl on tl.id = la.lesson_id
      join batch_tasks bt on bt.task_id = tl.task_id
      join enrollments e on e.batch_id = bt.batch_id
      where la.id = activity_content.activity_id
        and la.status = 'published'
        and tl.status = 'published'
        and bt.status = 'published'
        and e.user_id = auth.uid()
    )
  );

-- Teacher yang mengajar course boleh kelola lessons/activities/content (sebelumnya hanya admin).
-- Mengandalkan helper public.is_teacher_of_course(course_id) via course_tasks.course_id.
drop policy if exists task_lessons_teacher_write on public.task_lessons;
create policy task_lessons_teacher_write on public.task_lessons
  for all to authenticated
  using (
    exists (
      select 1 from public.course_tasks ct
      where ct.id = task_lessons.task_id
        and (public.is_teacher_of_course(ct.course_id) or public.is_admin())
    )
  )
  with check (
    exists (
      select 1 from public.course_tasks ct
      where ct.id = task_lessons.task_id
        and (public.is_teacher_of_course(ct.course_id) or public.is_admin())
    )
  );

drop policy if exists lesson_activities_teacher_write on public.lesson_activities;
create policy lesson_activities_teacher_write on public.lesson_activities
  for all to authenticated
  using (
    exists (
      select 1 from public.task_lessons tl
      join public.course_tasks ct on ct.id = tl.task_id
      where tl.id = lesson_activities.lesson_id
        and (public.is_teacher_of_course(ct.course_id) or public.is_admin())
    )
  )
  with check (
    exists (
      select 1 from public.task_lessons tl
      join public.course_tasks ct on ct.id = tl.task_id
      where tl.id = lesson_activities.lesson_id
        and (public.is_teacher_of_course(ct.course_id) or public.is_admin())
    )
  );
