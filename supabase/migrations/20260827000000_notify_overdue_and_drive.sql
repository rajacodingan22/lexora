-- ============================================================
-- Overdue Task Notifications + Google Drive Reminder
--
-- 1. notify_overdue_tasks(): cek task lewat deadline belum selesai
--    → kirim notif ke siswa (dedup: jangan spam)
-- 2. notify_drive_not_connected(): cek siswa image_speak tanpa Drive
--    → kirim pengingat hubungkan Google Drive
-- ============================================================

-- 1. Function: notify_overdue_tasks
create or replace function public.notify_overdue_tasks()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
  v_count int;
begin
  -- Cari task yang sudah lewat availability_end tapi belum completed
  for r in
    select
      stp.user_id,
      stp.task_id,
      stp.batch_id,
      ct.title as task_title,
      c.title as course_title,
      bt.availability_end
    from public.student_task_progress stp
    join public.batch_tasks bt on bt.batch_id = stp.batch_id and bt.task_id = stp.task_id
    join public.course_tasks ct on ct.id = stp.task_id
    join public.batches b on b.id = stp.batch_id
    join public.courses c on c.id = b.course_id
    where stp.status != 'completed'
      and bt.status = 'published'
      and bt.availability_end is not null
      and bt.availability_end < now()
      -- Dedup: jangan kirim kalau sudah ada unread notif taskOverdue untuk task+user ini dalam 3 hari terakhir
      and not exists (
        select 1 from public.notifications n
        where n.user_id = stp.user_id
          and n.template_key = 'taskOverdue'
          and n.params->>'taskId' = stp.task_id::text
          and n.created_at > now() - interval '3 days'
      )
  loop
    insert into public.notifications (user_id, type, title, body, link, template_key, params)
    values (
      r.user_id,
      'warning',
      'Tugas belum selesai',
      format('Tugas "%s" di kursus "%s" sudah lewat deadline.', r.task_title, r.course_title),
      '/student/kursus',
      'taskOverdue',
      jsonb_build_object('task', r.task_title, 'course', r.course_title, 'taskId', r.task_id::text)
    );
  end loop;

  -- Also check tasks with NO progress record at all (never started) + past deadline
  for r in
    select
      e.user_id,
      bt.task_id,
      bt.batch_id,
      ct.title as task_title,
      c.title as course_title,
      bt.availability_end
    from public.batch_tasks bt
    join public.course_tasks ct on ct.id = bt.task_id
    join public.batches b on b.id = bt.batch_id
    join public.courses c on c.id = b.course_id
    join public.enrollments e on e.batch_id = bt.batch_id and e.status = 'active'
    where bt.status = 'published'
      and bt.availability_end is not null
      and bt.availability_end < now()
      -- No progress record at all
      and not exists (
        select 1 from public.student_task_progress stp
        where stp.user_id = e.user_id and stp.task_id = bt.task_id and stp.batch_id = bt.batch_id
      )
      -- Dedup
      and not exists (
        select 1 from public.notifications n
        where n.user_id = e.user_id
          and n.template_key = 'taskOverdue'
          and n.params->>'taskId' = bt.task_id::text
          and n.created_at > now() - interval '3 days'
      )
  loop
    insert into public.notifications (user_id, type, title, body, link, template_key, params)
    values (
      r.user_id,
      'warning',
      'Tugas belum dikerjakan',
      format('Tugas "%s" di kursus "%s" sudah lewat deadline dan belum dikerjakan.', r.task_title, r.course_title),
      '/student/kursus',
      'taskOverdue',
      jsonb_build_object('task', r.task_title, 'course', r.course_title, 'taskId', r.task_id::text)
    );
  end loop;
end;
$$;

revoke execute on function public.notify_overdue_tasks() from public, anon, authenticated;
grant execute on function public.notify_overdue_tasks() to service_role;

-- 2. Function: notify_drive_not_connected
create or replace function public.notify_drive_not_connected()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
begin
  -- Cari semua siswa aktif yang belum connect Google Drive
  for r in
    select distinct
      e.user_id
    from public.enrollments e
    where e.status = 'active'
      -- Belum connect Drive
      and not exists (
        select 1 from public.user_drive_tokens udt
        where udt.user_id = e.user_id
      )
      -- Dedup: jangan spam, cukup 1x sehari
      and not exists (
        select 1 from public.notifications n
        where n.user_id = e.user_id
          and n.template_key = 'driveNotConnected'
          and n.created_at > now() - interval '1 day'
      )
  loop
    insert into public.notifications (user_id, type, title, body, link, template_key, params)
    values (
      r.user_id,
      'warning',
      'Hubungkan Google Drive',
      'Hubungkan Google Drive di profil kamu agar data dan aktivitas tersimpan dengan aman.',
      '/student/profil',
      'driveNotConnected',
      null
    );
  end loop;
end;
$$;

revoke execute on function public.notify_drive_not_connected() from public, anon, authenticated;
grant execute on function public.notify_drive_not_connected() to service_role;

-- 3. Cron jobs
select cron.schedule(
  'overdue-tasks-check',
  '0 */6 * * *',
  'select public.notify_overdue_tasks()'
);

select cron.schedule(
  'drive-not-connected-check',
  '0 9 * * *',
  'select public.notify_drive_not_connected()'
);
