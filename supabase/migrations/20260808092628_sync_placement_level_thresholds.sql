-- Sinkronkan ambang level dengan ambang pass/fail (60%):
--   <= 59%  -> basic  (Fail)
--   60-85%  -> advance (Pass)
--   > 85%   -> expert  (Pass)
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

  select id into v_test_id from public.placement_tests
  where language_code = p_language_code and is_active = true
  order by created_at desc limit 1;
  if v_test_id is not null and exists (select 1 from public.placement_results
    where user_id = v_user_id and test_id = v_test_id) then
    raise exception 'Placement test sudah dikerjakan';
  end if;

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

-- Re-score hasil yang sudah tersimpan dengan ambang baru
do $$
declare
  v_r record;
  v_score int;
  v_total int;
  v_pct numeric;
  v_level text;
begin
  for v_r in select * from public.placement_results
  loop
    select count(*) into v_total
    from public.placement_questions q
    where q.test_id = v_r.test_id;
    v_pct := (v_r.score::numeric / greatest(v_total, 1)) * 100;
    v_level := case
      when v_pct <= 59 then 'basic'
      when v_pct <= 85 then 'advance'
      else 'expert'
    end;
    update public.placement_results
    set provisional_level = v_level
    where id = v_r.id;
  end loop;
end;
$$;