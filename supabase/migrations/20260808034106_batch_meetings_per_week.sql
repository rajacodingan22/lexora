-- ============================================================
-- Batch Meeting Auto-Scheduling
-- 
-- Teacher sets meetings_per_week → system auto-calculates
-- end_date based on course.meeting_count / meetings_per_week.
-- System warns if live_sessions remaining > weeks remaining.
-- ============================================================

-- 1. Add meetings_per_week column to batches
alter table public.batches
  add column if not exists meetings_per_week integer not null default 2;

-- 2. Auto-calculate end_date when start_date or meetings_per_week changes
create or replace function public.calculate_batch_end_date()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_meeting_count int;
  v_weeks int;
begin
  -- Get total meetings from course
  select coalesce(c.meeting_count, 0) into v_meeting_count
  from public.courses c
  where c.id = new.course_id;

  if new.start_date is not null and new.meetings_per_week > 0 and v_meeting_count > 0 then
    -- Calculate: weeks = ceil(meeting_count / meetings_per_week)
    v_weeks := ceil(v_meeting_count::numeric / new.meetings_per_week::numeric);
    
    -- end_date = start_date + (weeks * 7) days
    -- We add an extra day so the last meeting can be on that day
    new.end_date := new.start_date + (v_weeks * 7 || ' days')::interval;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_batch_end_date on public.batches;
create trigger trg_batch_end_date
  before insert or update of start_date, meetings_per_week
  on public.batches
  for each row
  execute function public.calculate_batch_end_date();

-- 3. Function to get batch meeting progress
create or replace function public.get_batch_meeting_progress(p_batch_id uuid)
returns table (
  total_meetings int,
  sessions_created int,
  sessions_remaining int,
  weeks_remaining numeric,
  is_on_track boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_batch public.batches%rowtype;
  v_course_meetings int;
  v_now timestamptz := now();
  v_days_remaining numeric;
begin
  select * into v_batch from public.batches where id = p_batch_id;
  if v_batch.id is null then return; end if;

  select coalesce(c.meeting_count, 0) into v_course_meetings
  from public.courses c where c.id = v_batch.course_id;

  total_meetings := v_course_meetings;

  select count(*) into sessions_created
  from public.live_sessions
  where course_id = v_batch.course_id
    and status in ('scheduled', 'ongoing', 'completed')
    and starts_at >= v_batch.start_date
    and (v_batch.end_date is null or starts_at <= v_batch.end_date);

  sessions_remaining := greatest(0, total_meetings - sessions_created);

  if v_batch.end_date is not null then
    v_days_remaining := extract(epoch from (v_batch.end_date - v_now)) / 86400.0;
    weeks_remaining := greatest(0, round(v_days_remaining / 7.0, 1));
    
    -- On track if: sessions_remaining <= weeks_remaining * meetings_per_week
    is_on_track := sessions_remaining <= ceil(weeks_remaining * v_batch.meetings_per_week);
  else
    weeks_remaining := 0;
    is_on_track := true;
  end if;

  return next;
end;
$$;

revoke execute on function public.get_batch_meeting_progress(uuid) from public, anon;
grant execute on function public.get_batch_meeting_progress(uuid) to authenticated;

-- 4. Update class_lifecycle_check: warn if batch behind schedule
--    (added as a new section at the end)
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
      v_course_title := coalesce(r.course_title ->> 'id', r.course_title ->> 'en', 'Kelas');

      if r.teacher_id is not null then
        for v_teacher_uid in
          select t.user_id from teachers t where t.id = r.teacher_id
        loop
          insert into notifications (user_id, type, title, body, link, is_read)
          values (
            v_teacher_uid.user_id, 'warning',
            '⚠️ Batch tertinggal!',
            'Batch "' || r.name || '" untuk "' || v_course_title || '" memiliki ' ||
            v_progress.sessions_remaining || ' sesi tersisa dari ' || r.meeting_count ||
            ' pertemuan, namun tinggal ' || round(v_progress.weeks_remaining, 0) ||
            ' hari lagi. Buat ' || ceil(v_progress.sessions_remaining::numeric / v_progress.weeks_remaining) ||
            ' sesi per hari untuk mengejar!',
            '/teacher/kelas', false
          );
        end loop;
      end if;
    end if;
  end loop;
end;
$$;

revoke execute on function public.notify_batch_behind_schedule() from public, anon, authenticated;
grant execute on function public.notify_batch_behind_schedule() to service_role;

-- Add behind-schedule check to pg_cron (runs every 6 hours)
select cron.schedule(
  'batch-behind-schedule-check',
  '0 */6 * * *',
  'select public.notify_batch_behind_schedule()'
);