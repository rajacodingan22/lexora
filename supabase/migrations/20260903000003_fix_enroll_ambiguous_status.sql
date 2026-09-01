-- Fix: "column reference 'status' is ambiguous" in create_course_enrollment
-- Root cause: PL/pgSQL variable v_existing/v_batch share 'status' field name with tables
-- Fix: use explicit table aliases in all UPDATE/SELECT, qualify every column reference

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
      update public.enrollments en
      set en.batch_id = (v_batch).batch_id,
          en.status = 'active',
          en.enrolled_at = coalesce(v_existing.enrolled_at, now()),
          en.completed_at = null
      where en.id = v_existing.id
      returning en.* into v_enrollment;
    else
      insert into public.enrollments (user_id, course_id, batch_id, status, enrolled_at)
      values (v_user_id, p_course_id, (v_batch).batch_id, 'active', now())
      returning * into v_enrollment;
    end if;

    update public.waiting_list wl
    set wl.status = 'resolved'
    where wl.course_id = p_course_id and wl.user_id = v_user_id and wl.status = 'waiting';

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
    update public.enrollments en
    set en.batch_id = (v_batch).batch_id,
        en.status = case when v_price = 0 then 'active' else 'pending' end,
        en.enrolled_at = now(),
        en.completed_at = null
    where en.id = v_existing.id
    returning en.* into v_enrollment;
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
