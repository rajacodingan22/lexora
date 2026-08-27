-- ============================================================
-- Corrective contracts (2026-08-11)
-- Additive fixes for live application/database contract drift.
-- ============================================================

-- 1. Serialize batch allocation for all authenticated callers. The original
--    allocator uses SKIP LOCKED, which is correct for finding a free batch but
--    can still let two concurrent requests create two new batches.
create or replace function public.find_or_create_batch_serialized(p_course_id uuid)
returns table (
  batch_id uuid, batch_name text, code text,
  start_date timestamptz, end_date timestamptz,
  capacity int, current_students int, status text,
  created boolean
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;
  perform pg_advisory_xact_lock(hashtext(p_course_id::text)::bigint);
  return query select * from public.find_or_create_batch(p_course_id);
end;
$$;

revoke execute on function public.find_or_create_batch_serialized(uuid) from public, anon;
grant execute on function public.find_or_create_batch_serialized(uuid) to authenticated, service_role;

-- Trial claims must create an active enrollment, not a waiting-list row.
-- Regular paid enrollment behavior remains unchanged.
drop function if exists public.create_course_enrollment(uuid);

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

  select * into v_course
  from public.courses
  where id = p_course_id;

  if v_course.id is null or v_course.status <> 'active' then
    raise exception 'Kelas tidak ditemukan atau tidak aktif';
  end if;

  select coalesce(p.name ->> 'id', p.name ->> 'en', '')
  into v_program_name
  from public.programs p
  where p.id = v_course.program_id;

  -- Serialize claims for the same user/course. This closes the race where
  -- two requests both observe no enrollment before inserting one.
  perform pg_advisory_xact_lock(hashtext(v_user_id::text || ':' || p_course_id::text)::bigint);

  -- Lock an existing enrollment so repeated clicks are idempotent.
  select * into v_existing
  from public.enrollments
  where user_id = v_user_id and course_id = p_course_id
  order by enrolled_at asc nulls last
  limit 1
  for update;

  -- Trial classes are free and activate immediately, including legacy rows
  -- left in pending/waitlisted state by the previous broken flow.
  if v_course.is_try_class then
    if v_existing.id is not null and v_existing.status = 'completed' then
      raise exception 'Kamu sudah menyelesaikan kelas ini';
    end if;

    if v_existing.id is not null and v_existing.status = 'active' then
      select * into v_batch from public.batches where id = v_existing.batch_id;
      return jsonb_build_object(
        'course_title', coalesce(v_course.title ->> 'id', v_course.title ->> 'en', 'Kelas'),
        'program_name', v_program_name,
        'enrollment', to_jsonb(v_existing),
        'batch', case when v_batch.id is null then null else jsonb_build_object(
          'id', v_batch.id, 'name', v_batch.name, 'code', v_batch.code,
          'start_date', v_batch.start_date, 'end_date', v_batch.end_date,
          'capacity', v_batch.capacity, 'current_students', v_batch.current_students,
          'status', v_batch.status, 'created', false
        ) end,
        'payment', null,
        'waitlisted', false
      );
    end if;

    select * into v_batch
    from public.find_or_create_batch_serialized(p_course_id)
    limit 1;
    if v_batch.batch_id is null then
      raise exception 'Batch kelas tidak tersedia';
    end if;

    if v_existing.id is not null and v_existing.status in ('pending', 'pending_payment', 'waitlisted', 'dropped') then
      update public.enrollments
      set batch_id = v_batch.batch_id, status = 'active',
          enrolled_at = coalesce(v_existing.enrolled_at, now()), completed_at = null
      where id = v_existing.id
      returning * into v_enrollment;
    else
      insert into public.enrollments (user_id, course_id, batch_id, status, enrolled_at)
      values (v_user_id, p_course_id, v_batch.batch_id, 'active', now())
      returning * into v_enrollment;
    end if;

    update public.waiting_list set status = 'resolved'
    where course_id = p_course_id and user_id = v_user_id and status = 'waiting';

    return jsonb_build_object(
      'course_title', coalesce(v_course.title ->> 'id', v_course.title ->> 'en', 'Kelas'),
      'program_name', v_program_name,
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
      'payment', null,
      'waitlisted', false
    );
  end if;

  -- Preserve idempotent behavior for regular courses: a repeated request
  -- returns the existing enrollment/payment instead of creating a new invoice.
  if v_existing.id is not null and v_existing.status in ('active', 'pending', 'pending_payment', 'waitlisted') then
    select * into v_payment
    from public.payments
    where enrollment_id = v_existing.id
    order by created_at desc
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
  select * into v_batch
  from public.find_or_create_batch_serialized(p_course_id)
  limit 1;

  if v_batch.batch_id is null then
    raise exception 'Batch kelas tidak tersedia';
  end if;

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
    'payment', case when v_payment.id is null then null else to_jsonb(v_payment) end,
    'waitlisted', false
  );
end;
$$;

revoke execute on function public.create_course_enrollment(uuid) from public, anon;
grant execute on function public.create_course_enrollment(uuid) to authenticated;

-- 2. Repair both notify_admins overloads to use the actual notification schema.
create or replace function public.notify_admins(p_title text, p_body text, p_link text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.notifications (user_id, type, title, body, link, is_read)
  select id, 'info', coalesce(p_title, ''), coalesce(p_body, ''), coalesce(p_link, ''), false
  from public.users
  where role = 'admin' and status = 'active';
end;
$$;

create or replace function public.notify_admins(
  p_message text,
  p_route text default null,
  p_type text default 'info',
  p_link text default null,
  p_meta jsonb default '{}'::jsonb,
  p_silent boolean default false
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is not null and not public.is_admin() then
    raise exception 'Not authorized';
  end if;

  if p_silent then
    return;
  end if;

  insert into public.notifications (user_id, type, title, body, link, is_read, params)
  select u.id,
         coalesce(p_type, 'info'),
         case when coalesce(p_type, 'info') = 'warning' then 'Peringatan'
              when coalesce(p_type, 'info') = 'info' then 'Informasi Baru'
              else 'Notifikasi' end,
         coalesce(p_message, ''),
         coalesce(p_link, p_route, ''),
         false,
         coalesce(p_meta, '{}'::jsonb)
  from public.users u
  where u.role = 'admin'
    and u.status = 'active'
    and (u.notification_settings is null
         or coalesce((u.notification_settings -> 'admin')::boolean, true));
end;
$$;

revoke execute on function public.notify_admins(text, text, text) from public, anon, authenticated;
revoke execute on function public.notify_admins(text, text, text, text, jsonb, boolean) from public, anon, authenticated;
grant execute on function public.notify_admins(text, text, text) to service_role;
grant execute on function public.notify_admins(text, text, text, text, jsonb, boolean) to authenticated, service_role;

-- This RPC is called by the authenticated student after enrollment/waitlist
-- creation. It validates ownership before notifying administrators.
create or replace function public.notify_admins_for_course(
  p_course_id uuid,
  p_title text,
  p_body text,
  p_link text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  if not public.is_admin() and not exists (
    select 1 from public.enrollments e
    where e.course_id = p_course_id and e.user_id = v_uid
  ) and not exists (
    select 1 from public.waiting_list w
    where w.course_id = p_course_id and w.user_id = v_uid
  ) then
    raise exception 'Not authorized';
  end if;

  insert into public.notifications (user_id, type, title, body, link, is_read)
  select id, 'info', coalesce(p_title, ''), coalesce(p_body, ''), coalesce(p_link, ''), false
  from public.users
  where role = 'admin' and status = 'active';
end;
$$;

revoke execute on function public.notify_admins_for_course(uuid, text, text, text) from public, anon;
grant execute on function public.notify_admins_for_course(uuid, text, text, text) to authenticated, service_role;

-- 3. Prevent duplicate certificates under concurrent requests. Preserve any
-- historical duplicates in a locked archive before enforcing uniqueness.
create table if not exists public.certificate_duplicates_archive
  (like public.certificates including defaults);
alter table public.certificate_duplicates_archive
  add column if not exists archived_at timestamptz not null default now();
alter table public.certificate_duplicates_archive enable row level security;
revoke all on public.certificate_duplicates_archive from anon, authenticated;

insert into public.certificate_duplicates_archive
select duplicate.*, now()
from public.certificates duplicate
where duplicate.enrollment_id is not null
  and exists (
    select 1 from public.certificates keeper
    where keeper.enrollment_id = duplicate.enrollment_id
      and (keeper.created_at, keeper.id) < (duplicate.created_at, duplicate.id)
  );

delete from public.certificates duplicate
where duplicate.enrollment_id is not null
  and exists (
    select 1 from public.certificates keeper
    where keeper.enrollment_id = duplicate.enrollment_id
      and (keeper.created_at, keeper.id) < (duplicate.created_at, duplicate.id)
  );

drop index if exists public.certificates_enrollment_unique;
create unique index certificates_enrollment_unique
  on public.certificates (enrollment_id)
  where enrollment_id is not null;

-- 4. Make payment approval/rejection atomic with enrollment activation and
-- the corresponding student notification. The function is idempotent for
-- repeated review clicks.
create or replace function public.review_payment(
  p_payment_id uuid,
  p_status text,
  p_admin_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_payment public.payments%rowtype;
  v_enrollment public.enrollments%rowtype;
  v_course public.courses%rowtype;
  v_uid uuid := auth.uid();
  v_title text;
  v_notification_title text;
  v_notification_body text;
  v_template text;
begin
  if v_uid is null or not public.is_admin() then
    raise exception 'Not authorized';
  end if;

  if p_status not in ('approved', 'rejected') then
    raise exception 'Invalid payment status';
  end if;

  select * into v_payment
  from public.payments
  where id = p_payment_id
  for update;

  if v_payment.id is null then
    raise exception 'Payment not found';
  end if;

  if v_payment.status = p_status then
    return jsonb_build_object('payment', to_jsonb(v_payment), 'status', v_payment.status);
  end if;

  if v_payment.status not in ('pending', 'awaiting_proof', 'under_review') then
    raise exception 'Payment has already been reviewed';
  end if;

  update public.payments
  set status = p_status,
      admin_notes = coalesce(p_admin_notes, admin_notes),
      paid_at = case when p_status = 'approved' then now() else paid_at end,
      updated_at = now()
  where id = p_payment_id
  returning * into v_payment;

  if p_status = 'approved' and v_payment.enrollment_id is not null then
    update public.enrollments
    set status = 'active'
    where id = v_payment.enrollment_id
    returning * into v_enrollment;

    if v_enrollment.id is null then
      raise exception 'Enrollment not found for payment';
    end if;

    select * into v_course from public.courses where id = v_enrollment.course_id;
    v_title := coalesce(v_course.title ->> 'id', v_course.title ->> 'en', 'Kelas');
    v_notification_title := 'Pembayaran disetujui';
    v_notification_body := 'Selamat! Pembayaran kamu sudah dikonfirmasi. Kamu bisa mulai belajar sekarang.';
    v_template := 'paymentApproved';

    insert into public.notifications (
      user_id, type, template_key, params, title, body, link, is_read
    ) values (
      v_payment.user_id, 'info', v_template,
      jsonb_build_object('course', v_title, 'batch', ''),
      v_notification_title, v_notification_body, '/student/kursus', false
    );
  elsif p_status = 'approved' then
    v_notification_title := 'Pembayaran placement test disetujui';
    v_notification_body := 'Pembayaran placement test kamu sudah dikonfirmasi. Kamu bisa mulai tes sekarang.';

    insert into public.notifications (
      user_id, type, template_key, title, body, link, is_read
    ) values (
      v_payment.user_id, 'info', 'placementApproved',
      v_notification_title, v_notification_body, '/student/placement-test', false
    );
  elsif p_status = 'rejected' then
    insert into public.notifications (
      user_id, type, title, body, link, is_read
    ) values (
      v_payment.user_id, 'warning', 'Pembayaran ditolak',
      'Bukti pembayaran kamu ditolak. Silakan periksa catatan admin dan kirim ulang bila diperlukan.',
      '/student/pembayaran', false
    );
  end if;

  return jsonb_build_object(
    'payment', to_jsonb(v_payment),
    'enrollment', case when v_enrollment.id is null then null else to_jsonb(v_enrollment) end,
    'status', p_status
  );
end;
$$;

revoke execute on function public.review_payment(uuid, text, text) from public, anon;
grant execute on function public.review_payment(uuid, text, text) to authenticated, service_role;