-- C4: batches zoom_link missing
alter table public.batches add column if not exists zoom_link text;

-- H1: tighten student_task_progress RLS — require enrollment in batch
drop policy if exists stp_update_own on public.student_task_progress;
create policy stp_update_own on public.student_task_progress
  for update to authenticated
  using (user_id = auth.uid())
  with check (
    user_id = auth.uid()
    and exists (select 1 from public.enrollments e where e.user_id = auth.uid() and e.batch_id = student_task_progress.batch_id)
  );

drop policy if exists stp_insert_own on public.student_task_progress;
create policy stp_insert_own on public.student_task_progress
  for insert to authenticated
  with check (
    user_id = auth.uid()
    and exists (select 1 from public.enrollments e where e.user_id = auth.uid() and e.batch_id = student_task_progress.batch_id)
  );

-- M3: keep calculate_grade granted to authenticated (needed for speaking review & dialog complete via anon client)
-- Rate limiting via proxy.ts + RLS inside function; revoke would break existing flow, so no change here
