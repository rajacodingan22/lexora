-- Fix speaking_review RLS: ct.teacher_id is teachers.id (FK), not auth.uid()
-- Must join teachers table
drop policy if exists srs_select_teacher on public.speaking_review_submissions;
create policy srs_select_teacher on public.speaking_review_submissions
  for select to authenticated
  using (
    exists (
      select 1 from public.enrollments e
      join public.course_teachers ct on ct.course_id = e.course_id
      join public.teachers t on t.id = ct.teacher_id
      where e.user_id = speaking_review_submissions.user_id
        and e.batch_id = speaking_review_submissions.batch_id
        and t.user_id = auth.uid()
        and e.status in ('active','completed')
    )
  );

drop policy if exists srs_update_teacher on public.speaking_review_submissions;
create policy srs_update_teacher on public.speaking_review_submissions
  for update to authenticated
  using (
    exists (
      select 1 from public.enrollments e
      join public.course_teachers ct on ct.course_id = e.course_id
      join public.teachers t on t.id = ct.teacher_id
      where e.user_id = speaking_review_submissions.user_id
        and e.batch_id = speaking_review_submissions.batch_id
        and t.user_id = auth.uid()
        and e.status in ('active','completed')
    )
  )
  with check (
    exists (
      select 1 from public.enrollments e
      join public.course_teachers ct on ct.course_id = e.course_id
      join public.teachers t on t.id = ct.teacher_id
      where e.user_id = speaking_review_submissions.user_id
        and e.batch_id = speaking_review_submissions.batch_id
        and t.user_id = auth.uid()
        and e.status in ('active','completed')
    )
  );
