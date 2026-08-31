-- Project diingatkan 2 minggu sebelum mulai (via batch_tasks.availability_start)
create or replace function public.notify_project_two_weeks()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
begin
  for r in
    select bt.id as batch_task_id, bt.batch_id, bt.task_id, b.name as batch_name, ct.title as task_title, ct.course_id, bt.availability_start, e.user_id
    from public.batch_tasks bt
    join public.batches b on b.id = bt.batch_id
    join public.course_tasks ct on ct.id = bt.task_id
    join public.enrollments e on e.batch_id = bt.batch_id
    where bt.status = 'published'
      and bt.availability_start is not null
      and bt.availability_start between now() + interval '13 days' and now() + interval '14 days'
      and e.status in ('active','pending')
      and not exists (
        select 1 from public.notifications n
        where n.user_id = e.user_id
          and n.template_key = 'projectTwoWeeks'
          and n.params->>'batchTaskId' = bt.id::text
          and n.created_at > now() - interval '15 days'
      )
  loop
    perform public.send_notification(
      r.user_id,
      'assignment',
      'Project Segera Dimulai',
      'Project "' || r.task_title || '" di batch ' || r.batch_name || ' akan mulai dalam 2 minggu.',
      '/student/kursus/' || r.course_id || '/tasks/' || r.task_id,
      'projectTwoWeeks',
      jsonb_build_object('batchTaskId', r.batch_task_id, 'task', r.task_title, 'batch', r.batch_name, 'start', r.availability_start)
    );
  end loop;
end;
$$;

-- schedule daily 09:00
select cron.schedule('project-2weeks', '0 9 * * *', 'select public.notify_project_two_weeks()');
