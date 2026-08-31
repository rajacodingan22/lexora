-- Fix enroll fail: find_or_create_batch auto-create tanpa zoom_link -> NOT NULL violation
-- Buat manual admin: zoom & jadwal tetap dibuat manual, kalau belum -> push notif

-- 1. Balikin zoom_link jadi nullable (manual admin), hapus unique strict, ganti jadi warning via notif
alter table public.batches alter column zoom_link drop not null;
drop index if exists batches_zoom_link_unique;
alter table public.batches drop constraint if exists batches_zoom_link_check;

-- Re-add check tapi allow null
do $$ begin
  if not exists (select 1 from pg_constraint where conname='batches_zoom_link_check') then
    alter table public.batches add constraint batches_zoom_link_check check (zoom_link is null or zoom_link ~ '^https://');
  end if;
end $$;

-- 2. Update find_or_create_batch biar auto kasih placeholder zoom_link biar enroll tidak 500, tapi tetap notif admin untuk ganti manual
create or replace function public.find_or_create_batch(p_course_id uuid)
returns table (batch_id uuid, batch_name text, code text, start_date timestamptz, end_date timestamptz, capacity int, current_students int, status text, created boolean)
language plpgsql security definer set search_path = public as $$
declare v_course public.courses%rowtype; v_batch public.batches%rowtype; v_now timestamptz := now(); v_capacity int; v_start timestamptz; v_end timestamptz; v_seq int; v_last_end timestamptz; v_course_title text; v_admin record;
begin
  select * into v_course from public.courses where id = p_course_id;
  if v_course.id is null then raise exception 'course not found' using errcode='P0001'; end if;
  select * into v_batch from public.batches b where b.course_id=p_course_id and b.status not in ('completed','cancelled') and (b.start_date is null or b.start_date>v_now) and (b.current_students is null or b.current_students < coalesce(b.capacity,20)) order by b.start_date asc nulls last limit 1 for update skip locked;
  if v_batch.id is not null then return query select v_batch.id, v_batch.name::text, v_batch.code::text, v_batch.start_date, v_batch.end_date, v_batch.capacity::int, v_batch.current_students::int, v_batch.status::text, false; return; end if;
  v_capacity := case when v_course.max_students is not null and v_course.max_students>0 then v_course.max_students else 20 end;
  v_start := v_now + interval '7 days';
  if v_course.starts_at is not null and v_course.starts_at>v_now then v_start:=v_course.starts_at; else select max(b.end_date) into v_last_end from public.batches b where b.course_id=p_course_id and b.end_date is not null; if v_last_end is not null and v_last_end>v_now then v_start:=v_last_end + interval '1 day'; end if; end if;
  v_end := v_start + interval '90 days';
  if v_course.starts_at is not null and v_course.ends_at is not null and v_course.ends_at>v_course.starts_at then v_end:=v_start + (v_course.ends_at - v_course.starts_at); end if;
  select count(*)+1 into v_seq from public.batches b where b.course_id=p_course_id and b.status not in ('completed','cancelled');
  insert into public.batches (course_id, name, capacity, start_date, end_date, status, zoom_link)
  values (p_course_id, 'Batch '||v_seq, v_capacity, v_start, v_end, 'upcoming', null)
  returning * into v_batch;
  v_course_title := coalesce(v_course.title->>'id', v_course.title->>'en', 'Kelas');
  for v_admin in select id from public.users where role='admin' and status='active' loop
    insert into public.notifications (user_id, type, title, body, link, is_read) values (v_admin.id,'warning','Batch baru butuh Zoom & Jadwal','Batch "'||v_batch.name||'" untuk "'||v_course_title||'" auto-terbuat tanpa Zoom/jadwal tetap. Segera isi link Zoom & jadwal di admin/batch & admin/jadwal.','/admin/batch', false);
  end loop;
  return query select v_batch.id, v_batch.name::text, v_batch.code::text, v_batch.start_date, v_batch.end_date, v_batch.capacity::int, v_batch.current_students::int, v_batch.status::text, true;
end; $$;
grant execute on function public.find_or_create_batch(uuid) to authenticated;

-- 3. Cron push notif jika batch tanpa zoom_link atau course tanpa jadwal
create or replace function public.notify_missing_zoom_schedule()
returns void language plpgsql security definer set search_path=public as $$
declare r record;
begin
  for r in select b.id, b.name, b.course_id, c.title from public.batches b join public.courses c on c.id=b.course_id where b.zoom_link is null or b.zoom_link='' loop
    for r in select id from public.users where role='admin' and status='active' loop
      if not exists (select 1 from public.notifications where user_id=r.id and template_key='missingZoom' and params->>'batchId'=b.id::text and created_at>now()-interval '1 day') then
        perform public.send_notification(r.id,'warning','Batch tanpa Zoom','Batch "'||b.name||'" belum ada link Zoom. Isi manual di admin/batch.','/admin/batch','missingZoom', jsonb_build_object('batchId',b.id));
      end if;
    end loop;
  end loop;
  for r in select c.id, c.title from public.courses c where not exists (select 1 from public.course_schedules cs where cs.course_id=c.id) and c.status='active' loop
    for r in select id from public.users where role='admin' and status='active' loop
      if not exists (select 1 from public.notifications where user_id=r.id and template_key='missingSchedule' and params->>'courseId'=c.id::text and created_at>now()-interval '1 day') then
        perform public.send_notification(r.id,'warning','Course tanpa Jadwal','Course "'||coalesce(c.title->>'id',c.title->>'en')||'" belum ada jadwal tetap. Isi di admin/jadwal.','/admin/jadwal','missingSchedule', jsonb_build_object('courseId',c.id));
      end if;
    end loop;
  end loop;
end; $$;
select cron.schedule('missing-zoom-schedule','0 9 * * *','select public.notify_missing_zoom_schedule()');
