-- Fix: "column reference \"status\" is ambiguous" in find_or_create_batch
-- Root cause: RETURNS TABLE(status text, ...) creates implicit PL/pgSQL variable "status"
-- Any bare "status" in SQL then becomes ambiguous: variable vs column.
-- The FOR loop "select id from users where status='active'" hits this.
-- Also fix create_course_enrollment UPDATE syntax: SET should use bare column names, not alias-qualified.

-- 1. Fix find_or_create_batch: qualify users.status and ensure all columns qualified
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
  for v_admin in select u.id from public.users u where u.role='admin' and u.status='active' loop
    insert into public.notifications (user_id, type, title, body, link, is_read) values (v_admin.id,'warning','Batch baru butuh Zoom & Jadwal','Batch "'||v_batch.name||'" untuk "'||v_course_title||'" auto-terbuat tanpa Zoom/jadwal tetap. Segera isi link Zoom & jadwal di admin/batch & admin/jadwal.','/admin/batch', false);
  end loop;
  return query select v_batch.id, v_batch.name::text, v_batch.code::text, v_batch.start_date, v_batch.end_date, v_batch.capacity::int, v_batch.current_students::int, v_batch.status::text, true;
end; $$;
grant execute on function public.find_or_create_batch(uuid) to authenticated;

-- 2. Fix create_course_enrollment: use bare column names in UPDATE SET (not alias-qualified) to avoid confusion
create or replace function public.create_course_enrollment(p_course_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_course public.courses%rowtype;
  v_existing public.enrollments%rowtype;
  v_enrollment public.enrollments%rowtype;
  v_payment public.payments%rowtype;
  v_batch record;
  v_invoice text;
  v_due timestamptz;
  v_price numeric;
  v_program_name text;
begin
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  select c.* into v_course
  from public.courses c
  where c.id = p_course_id;

  if v_course.id is null or v_course.status <> 'active' then
    raise exception 'Kelas tidak ditemukan atau tidak aktif';
  end if;

  select coalesce(p.name ->> 'id', p.name ->> 'en', '')
  into v_program_name
  from public.programs p
  where p.id = v_course.program_id;

  perform pg_advisory_xact_lock(hashtext(v_user_id::text || ':' || p_course_id::text)::bigint);

  select e.* into v_existing
  from public.enrollments e
  where e.user_id = v_user_id and e.course_id = p_course_id
  order by e.enrolled_at asc nulls last
  limit 1
  for update;

  -- Trial classes
  if v_course.is_try_class then
    if v_existing.id is not null and v_existing.status = 'completed' then
      raise exception 'Kamu sudah menyelesaikan kelas ini';
    end if;

    if v_existing.id is not null and v_existing.status = 'active' then
      select b.* into v_batch from public.batches b where b.id = v_existing.batch_id;
      return jsonb_build_object(
        'course_title', coalesce(v_course.title ->> 'id', v_course.title ->> 'en', 'Kelas'),
        'program_name', v_program_name,
        'enrollment', to_jsonb(v_existing),
        'batch', case when v_batch is null or (v_batch).id is null then null else jsonb_build_object(
          'id', (v_batch).id, 'name', (v_batch).name, 'code', (v_batch).code,
          'start_date', (v_batch).start_date, 'end_date', (v_batch).end_date,
          'capacity', (v_batch).capacity, 'current_students', (v_batch).current_students,
          'status', (v_batch).status, 'created', false
        ) end,
        'payment', null,
        'waitlisted', false
      );
    end if;

    select f.* into v_batch
    from public.find_or_create_batch_serialized(p_course_id) f
    limit 1;
    if (v_batch).batch_id is null then
      raise exception 'Batch kelas tidak tersedia';
    end if;

    if v_existing.id is not null and v_existing.status in ('pending', 'pending_payment', 'waitlisted', 'dropped') then
      update public.enrollments
      set batch_id = (v_batch).batch_id,
          status = 'active',
          enrolled_at = coalesce(v_existing.enrolled_at, now()),
          completed_at = null
      where id = v_existing.id
      returning * into v_enrollment;
    else
      insert into public.enrollments (user_id, course_id, batch_id, status, enrolled_at)
      values (v_user_id, p_course_id, (v_batch).batch_id, 'active', now())
      returning * into v_enrollment;
    end if;

    update public.waiting_list
    set status = 'resolved'
    where course_id = p_course_id and user_id = v_user_id and status = 'waiting';

    return jsonb_build_object(
      'course_title', coalesce(v_course.title ->> 'id', v_course.title ->> 'en', 'Kelas'),
      'program_name', v_program_name,
      'enrollment', to_jsonb(v_enrollment),
      'batch', jsonb_build_object(
        'id', (v_batch).batch_id,
        'name', (v_batch).batch_name,
        'code', (v_batch).code,
        'start_date', (v_batch).start_date,
        'end_date', (v_batch).end_date,
        'capacity', (v_batch).capacity,
        'current_students', (v_batch).current_students,
        'status', (v_batch).status,
        'created', (v_batch).created
      ),
      'payment', null,
      'waitlisted', false
    );
  end if;

  -- Regular paid courses: idempotent re-enroll
  if v_existing.id is not null and v_existing.status in ('active', 'pending', 'pending_payment', 'waitlisted') then
    select py.* into v_payment
    from public.payments py
    where py.enrollment_id = v_existing.id
    order by py.created_at desc
    limit 1;

    return jsonb_build_object(
      'course_title', coalesce(v_course.title ->> 'id', v_course.title ->> 'en', 'Kelas'),
      'program_name', v_program_name,
      'enrollment', to_jsonb(v_existing),
      'batch', null,
      'payment', case when v_payment.id is null then null else to_jsonb(v_payment) end
    );
  elsif v_existing.id is not null and v_existing.status <> 'dropped' then
    raise exception 'Pendaftaran kelas tidak dapat diproses';
  end if;

  v_price := coalesce(v_course.price, 0);
  select f.* into v_batch
  from public.find_or_create_batch_serialized(p_course_id) f
  limit 1;

  if (v_batch).batch_id is null then
    raise exception 'Batch kelas tidak tersedia';
  end if;

  if v_existing.id is not null then
    update public.enrollments
    set batch_id = (v_batch).batch_id,
        status = case when v_price = 0 then 'active' else 'pending' end,
        enrolled_at = now(),
        completed_at = null
    where id = v_existing.id
    returning * into v_enrollment;
  else
    insert into public.enrollments (user_id, course_id, batch_id, status, enrolled_at)
    values (
      v_user_id,
      p_course_id,
      (v_batch).batch_id,
      case when v_price = 0 then 'active' else 'pending' end,
      now()
    )
    returning * into v_enrollment;
  end if;

  if v_price > 0 then
    v_invoice := 'INV-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 12));
    v_due := now() + interval '3 days';

    insert into public.payments (
      user_id, enrollment_id, invoice_number, amount, description,
      status, due_date, purpose
    )
    values (
      v_user_id, v_enrollment.id, v_invoice, v_price,
      'Pembayaran kelas', 'pending', v_due, 'course'
    )
    returning * into v_payment;
  end if;

  return jsonb_build_object(
    'course_title', coalesce(v_course.title ->> 'id', v_course.title ->> 'en', 'Kelas'),
    'program_name', v_program_name,
    'enrollment', to_jsonb(v_enrollment),
    'batch', jsonb_build_object(
      'id', (v_batch).batch_id,
      'name', (v_batch).batch_name,
      'code', (v_batch).code,
      'start_date', (v_batch).start_date,
      'end_date', (v_batch).end_date,
      'capacity', (v_batch).capacity,
      'current_students', (v_batch).current_students,
      'status', (v_batch).status,
      'created', (v_batch).created
    ),
    'payment', case when v_payment.id is null then null else to_jsonb(v_payment) end,
    'waitlisted', false
  );
end;
$$;

revoke execute on function public.create_course_enrollment(uuid) from public, anon;
grant execute on function public.create_course_enrollment(uuid) to authenticated;

-- 3. Also fix notify_missing_zoom_schedule which has same pattern but RETURNS void (no variable collision) 
-- but qualify anyway for consistency
create or replace function public.notify_missing_zoom_schedule()
returns void language plpgsql security definer set search_path=public as $$
declare r record;
begin
  for r in select b.id, b.name, b.course_id, c.title from public.batches b join public.courses c on c.id=b.course_id where b.zoom_link is null or b.zoom_link='' loop
    for r in select u.id from public.users u where u.role='admin' and u.status='active' loop
      if not exists (select 1 from public.notifications where user_id=r.id and template_key='missingZoom' and params->>'batchId'=b.id::text and created_at>now()-interval '1 day') then
        perform public.send_notification(r.id,'warning','Batch tanpa Zoom','Batch "'||b.name||'" belum ada link Zoom. Isi manual di admin/batch.','/admin/batch','missingZoom', jsonb_build_object('batchId',b.id));
      end if;
    end loop;
  end loop;
  for r in select c.id, c.title from public.courses c where not exists (select 1 from public.course_schedules cs where cs.course_id=c.id) and c.status='active' loop
    for r in select u.id from public.users u where u.role='admin' and u.status='active' loop
      if not exists (select 1 from public.notifications where user_id=r.id and template_key='missingSchedule' and params->>'courseId'=c.id::text and created_at>now()-interval '1 day') then
        perform public.send_notification(r.id,'warning','Course tanpa Jadwal','Course "'||coalesce(c.title->>'id',c.title->>'en')||'" belum ada jadwal tetap. Isi di admin/jadwal.','/admin/jadwal','missingSchedule', jsonb_build_object('courseId',c.id));
      end if;
    end loop;
  end loop;
end; $$;
