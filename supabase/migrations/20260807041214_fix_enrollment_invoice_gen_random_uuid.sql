create or replace function public.create_course_enrollment(
  p_course_id uuid
)
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
begin
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  select * into v_course
  from public.courses
  where id = p_course_id;

  if v_course.id is null or v_course.status <> 'active' then
    raise exception 'Kelas tidak ditemukan atau tidak aktif';
  end if;

  select * into v_existing
  from public.enrollments
  where user_id = v_user_id and course_id = p_course_id
  for update;

  if v_existing.id is not null then
    if v_existing.status = 'completed' then
      raise exception 'Kamu sudah menyelesaikan kelas ini';
    elsif v_existing.status in ('active', 'pending', 'pending_payment', 'waitlisted') then
      select * into v_payment
      from public.payments
      where enrollment_id = v_existing.id
      order by created_at desc
      limit 1;

      return jsonb_build_object(
        'course_title', coalesce(v_course.title ->> 'id', v_course.title ->> 'en', 'Kelas'),
        'enrollment', to_jsonb(v_existing),
        'batch', null,
        'payment', case when v_payment.id is null then null else to_jsonb(v_payment) end
      );
    elsif v_existing.status <> 'dropped' then
      raise exception 'Pendaftaran kelas tidak dapat diproses';
    end if;
  end if;

  select * into v_batch
  from public.find_or_create_batch(p_course_id)
  limit 1;

  if v_batch.batch_id is null then
    raise exception 'Batch kelas tidak tersedia';
  end if;

  v_price := coalesce(v_course.price, 0);
  if v_existing.id is not null then
    update public.enrollments
    set batch_id = v_batch.batch_id,
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
      v_batch.batch_id,
      case when v_price = 0 then 'active' else 'pending' end,
      now()
    )
    returning * into v_enrollment;
  end if;

  if v_price > 0 then
    -- Never trust invoice/due-date values supplied by the client.
    -- gen_random_bytes lives in the extensions schema and is invisible under
    -- search_path = public; gen_random_uuid() is built into pg_catalog.
    v_invoice := 'INV-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 12));
    v_due := now() + interval '3 days';

    insert into public.payments (
      user_id, enrollment_id, invoice_number, amount, description,
      status, due_date, purpose
    )
    values (
      v_user_id,
      v_enrollment.id,
      v_invoice,
      v_price,
      'Pembayaran kelas',
      'pending',
      v_due,
      'course'
    )
    returning * into v_payment;
  end if;

  return jsonb_build_object(
    'course_title', coalesce(v_course.title ->> 'id', v_course.title ->> 'en', 'Kelas'),
    'enrollment', to_jsonb(v_enrollment),
    'batch', jsonb_build_object(
      'id', v_batch.batch_id,
      'name', v_batch.batch_name,
      'code', v_batch.code,
      'start_date', v_batch.start_date,
      'end_date', v_batch.end_date,
      'capacity', v_batch.capacity,
      'current_students', v_batch.current_students,
      'status', v_batch.status,
      'created', v_batch.created
    ),
    'payment', case when v_payment.id is null then null else to_jsonb(v_payment) end
  );
end;
$$;

revoke execute on function public.create_course_enrollment(uuid) from public, anon;
grant execute on function public.create_course_enrollment(uuid) to authenticated;