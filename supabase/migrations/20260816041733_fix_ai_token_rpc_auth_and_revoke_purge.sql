-- ============================================================
-- Fix: RPC token diskon hanya untuk diri sendiri + revoke purge
-- 1. purge_ai_chat_for_batch: trigger-only, revoke eksekusi dari anon/authenticated
-- 2. ai_issue_discount_token: wajib p_user_id = auth.uid()
-- ============================================================

-- 1. purge_ai_chat_for_batch: trigger-only, revoke eksekusi dari semua role
revoke execute on function public.purge_ai_chat_for_batch() from public, anon, authenticated;
grant execute on function public.purge_ai_chat_for_batch() to service_role;

-- 2. ai_issue_discount_token: wajib hanya untuk diri sendiri (auth.uid())
create or replace function public.ai_issue_discount_token(
  p_user_id uuid,
  p_batch_id uuid,
  p_course_id uuid default null,
  p_reason text default 'special_offer',
  p_discount numeric default 15
)
returns public.ai_discount_tokens
language plpgsql security definer set search_path = 'public'
as $$
declare
  v_batch public.batches;
  v_token public.ai_discount_tokens;
  v_existing int;
  v_code text;
  v_discount numeric;
begin
  if p_user_id is null then raise exception 'user required'; end if;
  if p_user_id <> auth.uid() then raise exception 'cannot issue token for another user'; end if;

  -- batch harus ada & aktif/upcoming
  if p_batch_id is not null then
    select * into v_batch from public.batches where id = p_batch_id;
    if v_batch is null then raise exception 'batch not found'; end if;
    if v_batch.status not in ('active', 'upcoming') then
      raise exception 'batch is not open for offering';
    end if;

    -- user harus punya enrollment aktif di batch ini
    if not exists (
      select 1 from public.enrollments
      where user_id = p_user_id and batch_id = p_batch_id
        and status = 'active'
    ) then
      raise exception 'user has no active enrollment in this batch';
    end if;
  end if;

  -- satu token available per user per batch
  select count(*) into v_existing
  from public.ai_discount_tokens
  where user_id = p_user_id
    and batch_id is not distinct from p_batch_id
    and status = 'available';

  if v_existing > 0 then
    raise exception 'an available token already exists for this user/batch';
  end if;

  -- batasi nilai diskon (10-40%)
  v_discount := greatest(10, least(40, coalesce(p_discount, 15)));

  -- kode unik
  loop
    v_code := 'LEX-' || upper(substr(md5(random()::text), 1, 4)) || '-' ||
              upper(substr(md5(random()::text), 1, 4));
    exit when not exists (select 1 from public.ai_discount_tokens where code = v_code);
  end loop;

  insert into public.ai_discount_tokens (
    user_id, batch_id, course_id, code, discount_type,
    discount_value, status, offered_reason, expires_at
  ) values (
    p_user_id, p_batch_id, p_course_id, v_code, 'percent',
    v_discount, 'available', p_reason, now() + interval '14 days'
  ) returning * into v_token;

  return v_token;
end;
$$;

revoke execute on function public.ai_issue_discount_token(uuid, uuid, uuid, text, numeric) from public, anon;
grant execute on function public.ai_issue_discount_token(uuid, uuid, uuid, text, numeric) to authenticated, service_role;