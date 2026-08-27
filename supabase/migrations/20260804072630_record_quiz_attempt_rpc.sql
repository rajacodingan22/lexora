create or replace function public.record_quiz_attempt(
  p_quiz_id uuid,
  p_score numeric,
  p_answers jsonb,
  p_started_at timestamptz,
  p_submitted_at timestamptz
) returns public.quiz_attempts
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_user_id uuid := auth.uid();
  v_limit int;
  v_used int;
  v_attempt public.quiz_attempts;
begin
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  select attempt_limit into v_limit
  from public.quizzes
  where id = p_quiz_id;

  if v_limit is null then
    v_limit := 1;
  end if;

  perform 1 from public.quizzes where id = p_quiz_id for update;
  if not found then
    raise exception 'Quiz tidak ditemukan';
  end if;

  select count(*) into v_used
  from public.quiz_attempts
  where quiz_id = p_quiz_id and user_id = v_user_id;

  if v_used >= v_limit then
    raise exception 'Attempt limit reached';
  end if;

  insert into public.quiz_attempts (quiz_id, user_id, attempt_number, score, status, submitted_at, started_at, answers)
  values (p_quiz_id, v_user_id, v_used + 1, p_score, 'completed', p_submitted_at, p_started_at, p_answers)
  returning * into v_attempt;

  return v_attempt;
end;
$function$;

revoke execute on function public.record_quiz_attempt(uuid, numeric, jsonb, timestamptz, timestamptz) from anon;