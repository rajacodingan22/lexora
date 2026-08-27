-- Catalog model upgrade: keep CEFR history, expose product tiers and delivery tracks.
-- Existing completed enrollments and placement results retain their original level IDs.

alter table public.language_levels
  add column if not exists tier text;

alter table public.programs
  add column if not exists tier text,
  add column if not exists track_type text,
  add column if not exists details jsonb not null default '{"topics": [], "projects": [], "certificates": []}'::jsonb;

alter table public.courses
  add column if not exists tier text,
  add column if not exists track_type text,
  add column if not exists details jsonb not null default '{"topics": [], "projects": [], "certificates": []}'::jsonb;

-- Create the three product tiers for every active language. Legacy CEFR rows
-- are retained for historical references, then hidden from new selectors.
insert into public.language_levels (language_code, code, name, description, sort_order, is_active, tier)
select l.code, v.code, v.name, v.description, v.sort_order, true, v.code
from public.languages l
cross join (values
  ('basic', '{"id":"Basic","en":"Basic"}'::jsonb, '{"id":"Kemampuan dasar untuk percakapan dan pemahaman sehari-hari.","en":"Foundations for everyday conversation and understanding."}'::jsonb, 1),
  ('advance', '{"id":"Advance","en":"Advance"}'::jsonb, '{"id":"Pengembangan komunikasi yang lebih lancar dan terstruktur.","en":"Stronger communication with structured fluency practice."}'::jsonb, 2),
  ('expert', '{"id":"Expert","en":"Expert"}'::jsonb, '{"id":"Penggunaan bahasa tingkat tinggi untuk konteks akademik dan profesional.","en":"High-level language use for academic and professional contexts."}'::jsonb, 3)
) as v(code, name, description, sort_order)
where l.is_active = true
on conflict (language_code, code) do update set
  name = excluded.name,
  description = excluded.description,
  sort_order = excluded.sort_order,
  is_active = true,
  tier = excluded.tier;

-- Normalize current records and migrate courses to canonical product tiers.
update public.language_levels
set tier = case
  when lower(code) in ('a1', 'a2', 'basic') then 'basic'
  when lower(code) in ('b1', 'b2', 'advance', 'advanced') then 'advance'
  when lower(code) in ('c1', 'c2', 'expert') then 'expert'
  else tier
end
where tier is null;

update public.programs
set tier = coalesce(tier, 'basic'),
  track_type = case
  when lower(coalesce(program_type, '')) in ('intensive', 'fast_track', 'fast-track', 'fast') then replace(lower(program_type), '-', '_')
  else 'regular'
end
where track_type is null;

update public.courses c
set tier = coalesce(ll.tier, case
    when lower(ll.code) in ('a1', 'a2') then 'basic'
    when lower(ll.code) in ('b1', 'b2') then 'advance'
    when lower(ll.code) in ('c1', 'c2') then 'expert'
  end),
  track_type = coalesce((
    select p.track_type from public.programs p where p.id = c.program_id
  ), 'regular')
from public.language_levels ll
where ll.id = c.level_id;

-- Keep historical level_id foreign keys intact. The canonical tier is stored
-- separately so completed courses and reports do not change their historical
-- CEFR relationship.

update public.language_levels
set is_active = false
where code in ('A1', 'A2', 'B1', 'B2', 'C1', 'C2');

update public.teacher_languages tl
set levels = coalesce((
  select array_agg(distinct normalized order by normalized)
  from (
    select case lower(trim(level_value))
      when 'a1' then 'basic'
      when 'a2' then 'basic'
      when 'b1' then 'advance'
      when 'b2' then 'advance'
      when 'c1' then 'expert'
      when 'c2' then 'expert'
      when 'advanced' then 'advance'
      when 'basic' then 'basic'
      when 'advance' then 'advance'
      when 'expert' then 'expert'
      else lower(trim(level_value))
    end as normalized
    from unnest(coalesce(tl.levels, '{}'::text[])) as values(level_value)
  ) mapped
), '{}'::text[]);

-- Teacher applications store the selected levels as JSON. Normalize only the
-- known legacy values; unrelated application metadata is left untouched.
update public.teacher_applications
set levels = replace(replace(replace(replace(replace(replace(levels::text,
  '"A1"', '"basic"'), '"A2"', '"basic"'), '"B1"', '"advance"'),
  '"B2"', '"advance"'), '"C1"', '"expert"'), '"C2"', '"expert"')::jsonb
where levels is not null;

update public.placement_questions
set difficulty_level = case lower(difficulty_level)
  when 'a1' then 'basic'
  when 'a2' then 'basic'
  when 'b1' then 'advance'
  when 'b2' then 'advance'
  when 'c1' then 'expert'
  when 'c2' then 'expert'
  when 'advanced' then 'advance'
  when 'basic' then 'basic'
  when 'advance' then 'advance'
  when 'expert' then 'expert'
  else difficulty_level
end
where difficulty_level is not null;

alter table public.language_levels
  drop constraint if exists language_levels_tier_check;
alter table public.language_levels
  add constraint language_levels_tier_check
  check (tier is null or tier in ('basic', 'advance', 'expert'));

alter table public.programs
  drop constraint if exists programs_tier_check;
alter table public.programs
  add constraint programs_tier_check
  check (tier is null or tier in ('basic', 'advance', 'expert'));

alter table public.programs
  drop constraint if exists programs_track_type_check;
alter table public.programs
  add constraint programs_track_type_check
  check (track_type is null or track_type in ('fast_track', 'regular', 'intensive'));

alter table public.courses
  drop constraint if exists courses_tier_check;
alter table public.courses
  add constraint courses_tier_check
  check (tier is null or tier in ('basic', 'advance', 'expert'));

alter table public.courses
  drop constraint if exists courses_track_type_check;
alter table public.courses
  add constraint courses_track_type_check
  check (track_type is null or track_type in ('fast_track', 'regular', 'intensive'));

alter table public.placement_questions
  drop constraint if exists placement_questions_difficulty_tier_check;
alter table public.placement_questions
  add constraint placement_questions_difficulty_tier_check
  check (difficulty_level is null or difficulty_level in ('basic', 'advance', 'expert'));

create index if not exists idx_language_levels_tier on public.language_levels (tier);
create index if not exists idx_programs_tier_track on public.programs (tier, track_type);
create index if not exists idx_courses_tier_track on public.courses (tier, track_type);

-- Placement still uses the same internal questions, but returns the product tier.
create or replace function public.submit_placement_test(p_language_code text, p_answers jsonb)
returns jsonb
language plpgsql security definer set search_path = 'public'
as $$
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
        case when jsonb_typeof(v_ans) = 'array' then v_ans else jsonb_build_array(v_ans::text) end) elem);
      v_norm_corr := (select string_agg(elem, '|' order by elem) from jsonb_array_elements_text(
        case when jsonb_typeof(v_corrj) = 'array' then v_corrj else jsonb_build_array(v_corrj::text) end) elem);
      if v_norm_ans = v_norm_corr then v_score := v_score + 1; end if;
    end if;
  end loop;
  if v_total = 0 then raise exception 'No questions found for this language'; end if;

  v_pct := (v_score::numeric / v_total) * 100;
  v_level := case when v_pct <= 50 then 'basic' when v_pct <= 85 then 'advance' else 'expert' end;

  insert into public.placement_results (user_id, test_id, answers, score, provisional_level, completed_at)
  values (v_user_id, v_test_id, p_answers, v_score, v_level, now()) returning * into v_row;
  return jsonb_build_object('score', v_score, 'level', v_level, 'total', v_total);
end;
$$;
revoke execute on function public.submit_placement_test(text, jsonb) from public, anon;
grant execute on function public.submit_placement_test(text, jsonb) to authenticated, service_role;