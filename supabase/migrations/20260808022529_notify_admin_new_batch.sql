-- ============================================================
-- Notify admin when batch is auto-created without a teacher
-- ============================================================

create or replace function public.find_or_create_batch(p_course_id uuid)
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
declare
  v_course public.courses%rowtype;
  v_batch public.batches%rowtype;
  v_now timestamptz := now();
  v_capacity int;
  v_start timestamptz;
  v_end timestamptz;
  v_seq int;
  v_last_end timestamptz;
  v_course_title text;
  v_admin record;
begin
  select * into v_course from public.courses where id = p_course_id;
  if v_course.id is null then
    raise exception 'course not found' using errcode = 'P0001';
  end if;

  select * into v_batch
  from public.batches b
  where b.course_id = p_course_id
    and b.status not in ('completed', 'cancelled')
    and (b.start_date is null or b.start_date > v_now)
    and (b.current_students is null or b.current_students < coalesce(b.capacity, 20))
  order by b.start_date asc nulls last
  limit 1
  for update skip locked;

  if v_batch.id is not null then
    return query
      select v_batch.id, v_batch.name::text, v_batch.code::text, v_batch.start_date, v_batch.end_date,
             v_batch.capacity::int, v_batch.current_students::int, v_batch.status::text, false;
    return;
  end if;

  v_capacity := case when v_course.max_students is not null and v_course.max_students > 0
                     then v_course.max_students else 20 end;

  v_start := v_now + interval '7 days';
  if v_course.starts_at is not null and v_course.starts_at > v_now then
    v_start := v_course.starts_at;
  else
    select max(b.end_date) into v_last_end
    from public.batches b where b.course_id = p_course_id and b.end_date is not null;
    if v_last_end is not null and v_last_end > v_now then
      v_start := v_last_end + interval '1 day';
    end if;
  end if;

  v_end := v_start + interval '90 days';
  if v_course.starts_at is not null and v_course.ends_at is not null
     and v_course.ends_at > v_course.starts_at then
    v_end := v_start + (v_course.ends_at - v_course.starts_at);
  end if;

  select count(*) + 1 into v_seq
  from public.batches b
  where b.course_id = p_course_id
    and b.status not in ('completed', 'cancelled');

  insert into public.batches (course_id, name, capacity, start_date, end_date, status)
  values (p_course_id, 'Batch ' || v_seq, v_capacity, v_start, v_end, 'upcoming')
  returning * into v_batch;

  -- Notify all admins: new batch created and needs a teacher
  v_course_title := coalesce(v_course.title ->> 'id', v_course.title ->> 'en', 'Kelas');
  for v_admin in
    select id from public.users where role = 'admin' and status = 'active'
  loop
    insert into public.notifications (user_id, type, title, body, link, is_read)
    values (
      v_admin.id, 'warning',
      'Batch baru butuh guru',
      'Batch "' || v_batch.name || '" untuk kelas "' || v_course_title || '" telah dibuat otomatis. Silakan assign guru di halaman batch.',
      '/admin/batch', false
    );
  end loop;

  return query
    select v_batch.id, v_batch.name::text, v_batch.code::text, v_batch.start_date, v_batch.end_date,
           v_batch.capacity::int, v_batch.current_students::int, v_batch.status::text, true;
end;
$$;

revoke execute on function public.find_or_create_batch(uuid) from public, anon;
grant execute on function public.find_or_create_batch(uuid) to authenticated;