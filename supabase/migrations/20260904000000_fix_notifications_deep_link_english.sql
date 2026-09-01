-- Fix notifications: deep link to exact resource + English params
-- All pushes now English only (template_key + params English), link deep

-- 1. notify_overdue_tasks: deep link to /student/kursus/{courseId}/tasks/{taskId}
create or replace function public.notify_overdue_tasks()
 returns void
 language plpgsql
 security definer
 set search_path = public
as $$
declare
  r record;
begin
  for r in
    select
      stp.user_id,
      stp.task_id,
      stp.batch_id,
      ct.title as task_title,
      c.title as course_title,
      c.id as course_id,
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
      'Task Overdue',
      format('Task "%s" for course "%s" is overdue.', r.task_title, coalesce(r.course_title->>'en', r.course_title->>'id', 'Course')),
      '/student/kursus/' || r.course_id || '/tasks/' || r.task_id,
      'taskOverdue',
      jsonb_build_object('task', r.task_title, 'course', coalesce(r.course_title->>'en', r.course_title->>'id', 'Course'), 'taskId', r.task_id::text, 'courseId', r.course_id::text, 'batchId', r.batch_id::text)
    );
  end loop;

  for r in
    select
      e.user_id,
      bt.task_id,
      bt.batch_id,
      ct.title as task_title,
      c.title as course_title,
      c.id as course_id,
      bt.availability_end
    from public.batch_tasks bt
    join public.course_tasks ct on ct.id = bt.task_id
    join public.batches b on b.id = bt.batch_id
    join public.courses c on c.id = b.course_id
    join public.enrollments e on e.batch_id = bt.batch_id and e.status = 'active'
    where bt.status = 'published'
      and bt.availability_end is not null
      and bt.availability_end < now()
      and not exists (
        select 1 from public.student_task_progress stp
        where stp.user_id = e.user_id and stp.task_id = bt.task_id and stp.batch_id = bt.batch_id
      )
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
      'Task Not Started — Overdue',
      format('Task "%s" for course "%s" is overdue and not yet started.', r.task_title, coalesce(r.course_title->>'en', r.course_title->>'id', 'Course')),
      '/student/kursus/' || r.course_id || '/tasks/' || r.task_id,
      'taskOverdue',
      jsonb_build_object('task', r.task_title, 'course', coalesce(r.course_title->>'en', r.course_title->>'id', 'Course'), 'taskId', r.task_id::text, 'courseId', r.course_id::text, 'batchId', r.batch_id::text)
    );
  end loop;
end;
$$;

-- 2. notify_batch_behind_schedule: deep link with courseId & batchId
create or replace function public.notify_batch_behind_schedule()
 returns void
 language plpgsql
 security definer
 set search_path = public
as $$
declare
  r record;
  v_progress record;
  v_course_title text;
  v_teacher_uid record;
begin
  for r in
    select b.id, b.course_id, b.name, b.teacher_id, b.meetings_per_week,
           c.title as course_title, c.meeting_count
    from batches b
    join courses c on c.id = b.course_id
    where b.status = 'active'
      and b.end_date is not null
      and b.end_date > now()
      and b.end_date <= now() + interval '7 days'
  loop
    select * from get_batch_meeting_progress(r.id) into v_progress;

    if v_progress.sessions_remaining > 0 and not v_progress.is_on_track then
      v_course_title := coalesce(r.course_title ->> 'en', r.course_title ->> 'id', 'Course');

      if r.teacher_id is not null then
        for v_teacher_uid in
          select t.user_id from teachers t where t.id = r.teacher_id
        loop
          insert into notifications (user_id, type, title, body, link, is_read, template_key, params)
          values (
            v_teacher_uid.user_id, 'warning',
            'Batch Behind Schedule!',
            'Batch "' || r.name || '" for "' || v_course_title || '" has ' ||
            v_progress.sessions_remaining || ' sessions remaining of ' || r.meeting_count ||
            ' meetings, but only ' || round(v_progress.weeks_remaining, 0) ||
            ' days left. Schedule ' || ceil(v_progress.sessions_remaining::numeric / nullif(v_progress.weeks_remaining,0)) ||
            ' sessions per day to catch up!',
            '/teacher/kelas?course_id=' || r.course_id || '&batchId=' || r.id,
            false,
            'batchBehind',
            jsonb_build_object('batch', r.name, 'course', v_course_title, 'batchId', r.id::text, 'courseId', r.course_id::text)
          );
        end loop;
      end if;
    end if;
  end loop;
end;
$$;

-- 3. class_lifecycle_check: deep links with courseId/batchId/sessionId
create or replace function public.class_lifecycle_check()
 returns void
 language plpgsql
 security definer
 set search_path = public
as $$
declare
  r record;
  v_course text;
  v_date text;
  v_params jsonb;
begin
  -- 1. Reminder H-1: upcoming will start
  for r in
    select b.id, b.course_id, b.name, b.start_date, c.title as course_title
    from batches b
    join courses c on c.id = b.course_id
    where b.status = 'upcoming'
      and b.reminder_sent = false
      and b.start_date is not null
      and b.start_date > now()
      and b.start_date <= now() + interval '24 hours'
  loop
    v_course := coalesce(r.course_title ->> 'en', r.course_title ->> 'id', 'Course');
    v_date := to_char(r.start_date at time zone 'Asia/Jakarta', 'DD-MM-YYYY HH24:MI');
    v_params := jsonb_build_object('course', v_course, 'batch', r.name, 'start', v_date, 'courseId', r.course_id::text, 'batchId', r.id::text);

    insert into notifications (user_id, type, template_key, params, link)
    select e.user_id, 'info', 'classUpcoming', v_params, '/student/kursus/' || r.course_id
    from enrollments e
    where e.batch_id = r.id and e.status in ('active', 'pending');

    insert into notifications (user_id, type, template_key, params, link)
    select t.user_id, 'info', 'classUpcoming', v_params, '/teacher/kelas?course_id=' || r.course_id || '&batchId=' || r.id
    from course_teachers ct
    join teachers t on t.id = ct.teacher_id
    where ct.course_id = r.course_id;

    update batches set reminder_sent = true where id = r.id;
  end loop;

  -- 2. upcoming -> active
  for r in
    select b.id, b.course_id, b.name, c.title as course_title
    from batches b
    join courses c on c.id = b.course_id
    where b.status = 'upcoming'
      and b.start_date is not null
      and b.start_date <= now()
  loop
    v_course := coalesce(r.course_title ->> 'en', r.course_title ->> 'id', 'Course');
    v_params := jsonb_build_object('course', v_course, 'batch', r.name, 'courseId', r.course_id::text, 'batchId', r.id::text);

    insert into notifications (user_id, type, template_key, params, link)
    select e.user_id, 'info', 'classStarted', v_params, '/student/kursus/' || r.course_id
    from enrollments e
    where e.batch_id = r.id and e.status in ('active', 'pending');

    insert into notifications (user_id, type, template_key, params, link)
    select t.user_id, 'info', 'classStarted', v_params, '/teacher/kelas?course_id=' || r.course_id || '&batchId=' || r.id
    from course_teachers ct
    join teachers t on t.id = ct.teacher_id
    where ct.course_id = r.course_id;

    update batches set status = 'active', started_at = now() where id = r.id;
  end loop;

  -- 3. active -> completed
  for r in
    select b.id, b.course_id, b.name, c.title as course_title
    from batches b
    join courses c on c.id = b.course_id
    where b.status = 'active'
      and b.end_date is not null
      and b.end_date < now()
  loop
    v_course := coalesce(r.course_title ->> 'en', r.course_title ->> 'id', 'Course');
    v_params := jsonb_build_object('course', v_course, 'batch', r.name, 'courseId', r.course_id::text, 'batchId', r.id::text);

    insert into notifications (user_id, type, template_key, params, link)
    select e.user_id, 'info', 'classCompleted', v_params, '/student/kursus/' || r.course_id
    from enrollments e
    where e.batch_id = r.id and e.status in ('active', 'pending');

    insert into notifications (user_id, type, template_key, params, link)
    select t.user_id, 'info', 'classCompleted', v_params, '/teacher/kelas?course_id=' || r.course_id || '&batchId=' || r.id
    from course_teachers ct
    join teachers t on t.id = ct.teacher_id
    where ct.course_id = r.course_id;

    update batches set status = 'completed', completed_at = now() where id = r.id;
  end loop;

  -- 4. Zoom missing (teacher)
  for r in
    select ls.id, ls.course_id, ls.title as session_title, ls.starts_at, c.title as course_title
    from live_sessions ls
    join courses c on c.id = ls.course_id
    where ls.zoom_reminder_sent = false
      and (ls.meeting_link is null or ls.meeting_link = '')
      and ls.starts_at is not null
      and ls.starts_at >= now() - interval '1 hour'
      and ls.starts_at <= now() + interval '24 hours'
  loop
    v_course := coalesce(r.course_title ->> 'en', r.course_title ->> 'id', 'Course');
    v_date := to_char(r.starts_at at time zone 'Asia/Jakarta', 'DD-MM-YYYY HH24:MI');
    v_params := jsonb_build_object('session', r.session_title, 'course', v_course, 'start', v_date, 'sessionId', r.id::text, 'courseId', r.course_id::text);

    insert into notifications (user_id, type, template_key, params, link)
    select t.user_id, 'meeting', 'zoomLinkMissing', v_params, '/teacher/pertemuan?sessionId=' || r.id || '&courseId=' || r.course_id
    from course_teachers ct
    join teachers t on t.id = ct.teacher_id
    where ct.course_id = r.course_id;

    update live_sessions set zoom_reminder_sent = true where id = r.id;
  end loop;
end;
$$;

-- 4. notify_batch_needs_teacher: deep link with batchId
create or replace function public.notify_batch_needs_teacher()
 returns trigger
 language plpgsql
 security definer
 set search_path = public
as $$
declare
  v_course_title text;
begin
  if new.teacher_id is null then
    select coalesce(c.title->>'en', c.title->>'id', 'Course') into v_course_title
    from public.courses c
    where c.id = new.course_id;

    insert into public.notifications (user_id, type, title, body, link, is_read, template_key, params)
    select u.id, 'info',
      'Batch Needs Teacher',
      'Batch "' || coalesce(new.name, '') || '" for "' || coalesce(v_course_title, 'Course') || '" has no teacher yet. Please assign a teacher.',
      '/admin/batch?batchId=' || new.id,
      false,
      'batchNeedsTeacher',
      jsonb_build_object('batch', coalesce(new.name,''), 'course', coalesce(v_course_title,'Course'), 'batchId', new.id::text, 'courseId', new.course_id::text)
    from public.users u
    where u.role = 'admin' and u.status = 'active';
  end if;
  return new;
end;
$$;

-- 5. notify_missing_zoom_schedule: deep links
create or replace function public.notify_missing_zoom_schedule()
 returns void
 language plpgsql
 security definer
 set search_path = public
as $$
declare r record;
begin
  for r in select b.id, b.name, b.course_id, c.title from public.batches b join public.courses c on c.id=b.course_id where b.zoom_link is null or b.zoom_link='' loop
    for r in select u.id from public.users u where u.role='admin' and u.status='active' loop
      if not exists (select 1 from public.notifications where user_id=r.id and template_key='missingZoom' and params->>'batchId'=b.id::text and created_at>now()-interval '1 day') then
        perform public.send_notification(r.id,'warning','Batch Missing Zoom','Batch "'||b.name||'" is missing Zoom link. Please add it in admin/batch.','/admin/batch?batchId='||b.id::text,'missingZoom', jsonb_build_object('batch',b.name,'batchId',b.id::text,'courseId',b.course_id::text));
      end if;
    end loop;
  end loop;
  for r in select c.id, c.title from public.courses c where not exists (select 1 from public.course_schedules cs where cs.course_id=c.id) and c.status='active' loop
    for r in select u.id from public.users u where u.role='admin' and u.status='active' loop
      if not exists (select 1 from public.notifications where user_id=r.id and template_key='missingSchedule' and params->>'courseId'=c.id::text and created_at>now()-interval '1 day') then
        perform public.send_notification(r.id,'warning','Course Missing Schedule','Course "'||coalesce(c.title->>'en',c.title->>'id','Course')||'" has no fixed schedule. Please add it in admin/jadwal.','/admin/jadwal?courseId='||c.id::text,'missingSchedule', jsonb_build_object('course',coalesce(c.title->>'en',c.title->>'id','Course'),'courseId',c.id::text));
      end if;
    end loop;
  end loop;
end;
$$;

-- 6. New: submission waiting assessment notification (for assignment submissions)
create or replace function public.notify_submission_waiting()
 returns trigger
 language plpgsql
 security definer
 set search_path = public
as $$
declare
  v_course_id uuid;
  v_course_title text;
  v_assignment_title text;
  v_student_name text;
  v_batch_id uuid;
begin
  select a.course_id, a.title into v_course_id, v_assignment_title from public.assignments a where a.id = new.assignment_id;
  if v_course_id is null then return new; end if;
  select coalesce(c.title->>'en', c.title->>'id', 'Course') into v_course_title from public.courses c where c.id = v_course_id;
  select display_name into v_student_name from public.users where id = new.user_id;
  -- get student's batch for link
  select batch_id into v_batch_id from public.enrollments where user_id = new.user_id and course_id = v_course_id and status in ('active','pending') limit 1;

  -- notify teachers of this course
  insert into public.notifications (user_id, type, title, body, link, template_key, params)
  select t.user_id, 'info',
    'Assessment Waiting for Review: "' || coalesce(v_assignment_title,'Assignment') || '"',
    'Student ' || coalesce(v_student_name,'Student') || ' submitted "' || coalesce(v_assignment_title,'Assignment') || '" for course "' || coalesce(v_course_title,'Course') || '". Please review.',
    '/teacher/penilaian?assignmentId=' || new.assignment_id || '&submissionId=' || new.id || '&courseId=' || v_course_id::text,
    'assessmentWaiting',
    jsonb_build_object('assessment', coalesce(v_assignment_title,'Assignment'), 'assignmentId', new.assignment_id::text, 'submissionId', new.id::text, 'course', coalesce(v_course_title,'Course'), 'courseId', v_course_id::text, 'batchId', coalesce(v_batch_id::text,''), 'student', coalesce(v_student_name,'Student'), 'studentId', new.user_id::text)
  from public.course_teachers ct join public.teachers t on t.id = ct.teacher_id
  where ct.course_id = v_course_id;

  return new;
end;
$$;

drop trigger if exists trg_notify_submission_waiting on public.submissions;
create trigger trg_notify_submission_waiting
  after insert on public.submissions
  for each row execute function public.notify_submission_waiting();

-- 7. Ensure send_notification respects English (no logic change, just note)
