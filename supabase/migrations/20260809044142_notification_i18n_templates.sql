-- ============================================================
-- Notifikasi berbasis template i18n:
--  - kolom template_key + params (jsonb) pada tabel notifications
--  - fungsi-fungsi pembuat notif menulis template key + params,
--    bukan teks statis bahasa Indonesia
--  - perbaiki bug: courses.title (jsonb) ditulis mentah ke body
--  - backfill data lama yang mengandung objek JSON di body
-- ============================================================

alter table public.notifications
  add column if not exists template_key text,
  add column if not exists params jsonb;

comment on column public.notifications.template_key is 'I18n template key untuk dirender oleh klien (mis. classUpcoming)';
comment on column public.notifications.params is 'Parameter untuk template i18n (jsonb)';

-- ------------------------------------------------------------
-- class_lifecycle_check: template-based + fix jsonb title
-- ------------------------------------------------------------
create or replace function public.class_lifecycle_check()
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  r record;
  v_course text;
  v_date text;
  v_params jsonb;
begin
  -- 1. Reminder H-1: kelas upcoming akan segera dimulai (notif student + teacher)
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
    v_course := coalesce(r.course_title ->> 'id', r.course_title ->> 'en', 'Kelas');
    v_date := to_char(r.start_date at time zone 'Asia/Jakarta', 'DD-MM-YYYY HH24:MI');
    v_params := jsonb_build_object('course', v_course, 'batch', r.name, 'start', v_date);

    insert into notifications (user_id, type, template_key, params, link)
    select e.user_id, 'info', 'classUpcoming', v_params, '/student/kursus'
    from enrollments e
    where e.batch_id = r.id and e.status in ('active', 'pending');

    insert into notifications (user_id, type, template_key, params, link)
    select t.user_id, 'info', 'classUpcoming', v_params, '/teacher/kelas'
    from course_teachers ct
    join teachers t on t.id = ct.teacher_id
    where ct.course_id = r.course_id;

    update batches set reminder_sent = true where id = r.id;
  end loop;

  -- 2. Transisi upcoming -> active (kelas dimulai)
  for r in
    select b.id, b.course_id, b.name, c.title as course_title
    from batches b
    join courses c on c.id = b.course_id
    where b.status = 'upcoming'
      and b.start_date is not null
      and b.start_date <= now()
  loop
    v_course := coalesce(r.course_title ->> 'id', r.course_title ->> 'en', 'Kelas');
    v_params := jsonb_build_object('course', v_course, 'batch', r.name);

    insert into notifications (user_id, type, template_key, params, link)
    select e.user_id, 'info', 'classStarted', v_params, '/student/kursus'
    from enrollments e
    where e.batch_id = r.id and e.status in ('active', 'pending');

    insert into notifications (user_id, type, template_key, params, link)
    select t.user_id, 'info', 'classStarted', v_params, '/teacher/kelas'
    from course_teachers ct
    join teachers t on t.id = ct.teacher_id
    where ct.course_id = r.course_id;

    update batches set status = 'active', started_at = now() where id = r.id;
  end loop;

  -- 3. Transisi active -> completed (kelas selesai)
  for r in
    select b.id, b.course_id, b.name, c.title as course_title
    from batches b
    join courses c on c.id = b.course_id
    where b.status = 'active'
      and b.end_date is not null
      and b.end_date < now()
  loop
    v_course := coalesce(r.course_title ->> 'id', r.course_title ->> 'en', 'Kelas');
    v_params := jsonb_build_object('course', v_course, 'batch', r.name);

    insert into notifications (user_id, type, template_key, params, link)
    select e.user_id, 'info', 'classCompleted', v_params, '/student/kursus'
    from enrollments e
    where e.batch_id = r.id and e.status in ('active', 'pending');

    insert into notifications (user_id, type, template_key, params, link)
    select t.user_id, 'info', 'classCompleted', v_params, '/teacher/kelas'
    from course_teachers ct
    join teachers t on t.id = ct.teacher_id
    where ct.course_id = r.course_id;

    update batches set status = 'completed', completed_at = now() where id = r.id;
  end loop;

  -- 4. Reminder link Zoom belum dibagikan (teacher)
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
    v_course := coalesce(r.course_title ->> 'id', r.course_title ->> 'en', 'Kelas');
    v_date := to_char(r.starts_at at time zone 'Asia/Jakarta', 'DD-MM-YYYY HH24:MI');
    v_params := jsonb_build_object('session', r.session_title, 'course', v_course, 'start', v_date);

    insert into notifications (user_id, type, template_key, params, link)
    select t.user_id, 'meeting', 'zoomLinkMissing', v_params, '/teacher/pertemuan'
    from course_teachers ct
    join teachers t on t.id = ct.teacher_id
    where ct.course_id = r.course_id;

    update live_sessions set zoom_reminder_sent = true where id = r.id;
  end loop;
end;
$function$;

-- ------------------------------------------------------------
-- notify_teachers_class_ready: template-based
-- ------------------------------------------------------------
create or replace function public.notify_teachers_class_ready()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  c record;
  active_count int;
  t record;
  course_title text;
  teacher_uid uuid;
  v_params jsonb;
begin
  if new.status = 'active' then
    select min_students, title into c from courses where id = new.course_id;
    if c is null or c.min_students is null or c.min_students <= 0 then
      return new;
    end if;

    select count(*) into active_count from enrollments
      where course_id = new.course_id and status = 'active';

    if active_count >= c.min_students then
      course_title := coalesce(c.title->>'id', c.title->>'en', 'Kelas ini');
      v_params := jsonb_build_object('course', course_title, 'count', active_count, 'min', c.min_students);

      for t in
        select ct.teacher_id from course_teachers ct where ct.course_id = new.course_id
      loop
        select user_id into teacher_uid from teachers where id = t.teacher_id;
        if teacher_uid is null then
          continue;
        end if;

        if not exists (
          select 1 from notifications
          where user_id = teacher_uid
            and type = 'info'
            and template_key = 'teacherClassReady'
            and link = '/teacher/kelas?course_id=' || new.course_id
        ) then
          insert into notifications (user_id, type, template_key, params, link, is_read, created_at)
          values (
            teacher_uid,
            'info',
            'teacherClassReady',
            v_params,
            '/teacher/kelas?course_id=' || new.course_id,
            false,
            now()
          );
        end if;
      end loop;
    end if;
  end if;
  return new;
end;
$function$;

-- ------------------------------------------------------------
-- notify_teacher_batch_completed: template-based
-- ------------------------------------------------------------
create or replace function public.notify_teacher_batch_completed()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  t record;
  course_title text;
  v_params jsonb;
begin
  if TG_OP = 'UPDATE' AND NEW.status <> 'completed' THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'INSERT' AND NEW.status <> 'completed' THEN
    RETURN NEW;
  END IF;

  SELECT c.title::text INTO course_title FROM courses c WHERE c.id = NEW.course_id;
  -- jsonb title -> ambil id/en
  SELECT coalesce(c.title->>'id', c.title->>'en', 'Kelas') INTO course_title
  FROM courses c WHERE c.id = NEW.course_id;

  v_params := jsonb_build_object('course', course_title, 'batch', NEW.name);

  FOR t IN
    SELECT ct.teacher_id FROM course_teachers ct WHERE ct.course_id = NEW.course_id
  LOOP
    INSERT INTO notifications (user_id, type, template_key, params, link, is_read)
    SELECT t.user_id, 'info', 'teacherBatchCompleted', v_params, '/teacher/sertifikat', false
    FROM teachers th WHERE th.id = t.teacher_id;
  END LOOP;

  RETURN NEW;
END;
$function$;

-- ------------------------------------------------------------
-- send_notification: dukung template_key + params opsional
-- ------------------------------------------------------------
create or replace function public.send_notification(
  p_user_id uuid,
  p_type text,
  p_title text,
  p_body text,
  p_link text default null,
  p_template_key text default null,
  p_params jsonb default null
)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if auth.uid() != p_user_id and not is_admin() then
    raise exception 'Not authorized to send notification for this user';
  end if;
  insert into notifications (user_id, sender_id, type, title, body, link, template_key, params)
  values (p_user_id, auth.uid(), p_type, p_title, p_body, p_link, p_template_key, p_params);
end;
$function$;

grant execute on function public.send_notification(uuid, text, text, text, text, text, jsonb) to authenticated;
revoke execute on function public.send_notification(uuid, text, text, text, text) from public, anon;

-- ------------------------------------------------------------
-- Backfill: bersihkan objek JSON yang bocor ke body (bug lama)
-- ------------------------------------------------------------
do $$
declare
  r record;
  m text;
  j jsonb;
  fixed text;
begin
  for r in
    select id, body from notifications
    where body ~ '\{[^{}]*\}'
  loop
    m := (select substring(r.body from '(\{[^{}]*\})'));
    if m is not null then
      begin
        j := m::jsonb;
        fixed := coalesce(j->>'id', j->>'en', j->>'title');
        if fixed is not null then
          update notifications set body = replace(body, m, fixed) where id = r.id;
        end if;
      exception when others then
        null;
      end;
    end if;
  end loop;
end;
$$;