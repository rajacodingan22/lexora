-- ============================================================
-- 1) Placement test hanya bisa dikerjakan SEKALI (1x total),
--    pada bahasa yang dipilih. Setelah ada hasil, bahasa lain
--    juga ditolak di server.
-- ============================================================
create or replace function public.submit_placement_test(p_language_code text, p_answers jsonb)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_user_id uuid := auth.uid();
  v_has_access boolean;
  v_test_id uuid;
  v_q record;
  v_ans jsonb;
  v_corrj jsonb;
  v_norm_ans text;
  v_norm_corr text;
  v_score int := 0;
  v_total int := 0;
  v_pct numeric;
  v_level text;
  v_row public.placement_results;
begin
  if v_user_id is null then raise exception 'Not authenticated'; end if;
  select exists (select 1 from public.payments p
    where p.user_id = v_user_id and p.purpose = 'placement'
      and p.status = 'approved' and p.created_at > now() - interval '7 days')
  into v_has_access;
  if not public.is_admin() and not v_has_access then
    raise exception 'Placement test access expired or not purchased';
  end if;

  -- 1x total: sekali ada hasil (bahasa apa pun), tidak bisa test lagi
  if exists (select 1 from public.placement_results where user_id = v_user_id) then
    raise exception 'Placement test sudah dikerjakan';
  end if;

  select id into v_test_id from public.placement_tests
  where language_code = p_language_code and is_active = true
  order by created_at desc limit 1;

  for v_q in select id, test_id, correct_answer from public.placement_questions
    where (v_test_id is null and language_code = p_language_code) or test_id = v_test_id
    order by difficulty_level asc nulls last, sort_order asc nulls last
  loop
    v_total := v_total + 1;
    if v_test_id is null then v_test_id := v_q.test_id; end if;
    v_ans := p_answers -> v_q.id::text;
    if v_ans is not null and v_q.correct_answer is not null then
      begin
        v_corrj := case
          when left(trim(v_q.correct_answer), 1) = '['
            and right(trim(v_q.correct_answer), 1) = ']'
          then trim(v_q.correct_answer)::jsonb
          else to_jsonb(v_q.correct_answer)
        end;
      exception when others then
        v_corrj := to_jsonb(v_q.correct_answer);
      end;
      v_norm_ans := (select string_agg(elem, '|' order by elem) from jsonb_array_elements_text(
        case when jsonb_typeof(v_ans) = 'array' then v_ans else jsonb_build_array(v_ans #>> '{}') end) elem);
      v_norm_corr := (select string_agg(elem, '|' order by elem) from jsonb_array_elements_text(
        case when jsonb_typeof(v_corrj) = 'array' then v_corrj else jsonb_build_array(v_corrj #>> '{}') end) elem);
      if v_norm_ans = v_norm_corr then v_score := v_score + 1; end if;
    end if;
  end loop;
  if v_total = 0 then raise exception 'No questions found for this language'; end if;

  v_pct := (v_score::numeric / v_total) * 100;
  v_level := case
    when v_pct <= 59 then 'basic'
    when v_pct <= 85 then 'advance'
    else 'expert'
  end;

  insert into public.placement_results (user_id, test_id, answers, score, provisional_level, completed_at)
  values (v_user_id, v_test_id, p_answers, v_score, v_level, now()) returning * into v_row;
  return jsonb_build_object('score', v_score, 'level', v_level, 'total', v_total);
end;
$function$;

revoke execute on function public.submit_placement_test(text, jsonb) from public, anon;
grant execute on function public.submit_placement_test(text, jsonb) to authenticated, service_role;

-- ============================================================
-- 2) Gate level saat enroll/membeli kursus:
--    - User TANPA hasil placement test  -> bebas beli level apa pun
--    - User DENGAN hasil placement test -> hanya boleh enroll kursus
--      yang tier-nya sesuai level hasil, pada bahasa yang sama
-- ============================================================
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
  v_program_name text;
  v_placement_level text;
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

  -- Ambil nama program
  select coalesce(p.name ->> 'id', p.name ->> 'en', '') into v_program_name
  from public.programs p
  where p.id = v_course.program_id;

  -- Trial class → masuk waiting list, bukan enrollment langsung
  if v_course.is_try_class then
    if not exists (
      select 1 from public.waiting_list
      where course_id = p_course_id and user_id = v_user_id and status = 'waiting'
    ) then
      insert into public.waiting_list (course_id, user_id, status, notes)
      values (p_course_id, v_user_id, 'waiting', 'Trial class request');
    end if;

    return jsonb_build_object(
      'course_title', coalesce(v_course.title ->> 'id', v_course.title ->> 'en', 'Kelas'),
      'program_name', v_program_name,
      'enrollment', null,
      'batch', null,
      'payment', null,
      'waitlisted', true
    );
  end if;

  -- Gate level: hanya berlaku jika user punya hasil placement test
  -- untuk bahasa kursus ini
  select pr.provisional_level into v_placement_level
  from public.placement_results pr
  join public.placement_tests pt on pt.id = pr.test_id
  where pr.user_id = v_user_id
    and pt.language_code = v_course.language_code
  order by pr.completed_at desc
  limit 1;

  if v_placement_level is not null
     and coalesce(v_course.tier, '') <> ''
     and v_course.tier is distinct from v_placement_level then
    raise exception 'Kelas ini untuk level % sedangkan hasil placement test kamu adalah %. Kamu hanya bisa mengikuti kelas level %.',
      v_course.tier, v_placement_level, v_placement_level;
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
        'program_name', v_program_name,
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
    'payment', case when v_payment.id is null then null else to_jsonb(v_payment) end
  );
end;
$$;

revoke execute on function public.create_course_enrollment(uuid) from public, anon;
grant execute on function public.create_course_enrollment(uuid) to authenticated, service_role;