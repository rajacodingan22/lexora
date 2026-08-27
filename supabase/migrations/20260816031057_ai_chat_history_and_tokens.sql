-- ============================================================
-- AI Chat History + Discount Tokens (Lexora AI)
-- 1. ai_chat_sessions  : sesi percakapan per user (per batch kelas)
-- 2. ai_chat_messages  : pesan user/assistant dalam sesi
-- 3. ai_discount_tokens: token diskon yang diterbitkan AI (tidak acak)
-- 4. Trigger: hapus history saat batch selesai (completed)
-- 5. RPC ai_issue_discount_token: aturan ketat penerbitan token
-- ============================================================

-- 1. SESSIONS ---------------------------------------------------
create table if not exists public.ai_chat_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  batch_id uuid references public.batches(id) on delete cascade,
  title text,
  status text not null default 'active' check (status in ('active', 'archived')),
  last_message_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists ai_chat_sessions_user_idx on public.ai_chat_sessions (user_id, updated_at desc);
create index if not exists ai_chat_sessions_batch_idx on public.ai_chat_sessions (batch_id);

-- 2. MESSAGES ---------------------------------------------------
create table if not exists public.ai_chat_messages (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.ai_chat_sessions(id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text not null,
  created_at timestamptz not null default now()
);

create index if not exists ai_chat_messages_session_idx on public.ai_chat_messages (session_id, created_at);

-- 3. DISCOUNT TOKENS --------------------------------------------
create table if not exists public.ai_discount_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  batch_id uuid references public.batches(id) on delete set null,
  course_id uuid references public.courses(id) on delete set null,
  code text not null unique,
  discount_type text not null default 'percent' check (discount_type in ('percent', 'fixed')),
  discount_value numeric(5,2) not null,
  status text not null default 'available' check (status in ('available', 'used', 'expired', 'revoked')),
  offered_reason text,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists ai_discount_tokens_user_idx on public.ai_discount_tokens (user_id, status);
create index if not exists ai_discount_tokens_batch_idx on public.ai_discount_tokens (batch_id);

-- RLS ------------------------------------------------------------
alter table public.ai_chat_sessions enable row level security;
alter table public.ai_chat_messages enable row level security;
alter table public.ai_discount_tokens enable row level security;

-- sessions: pemilik + admin
create policy "ai_chat_sessions_owner_all"
  on public.ai_chat_sessions for all
  using (user_id = auth.uid() or public.is_admin())
  with check (user_id = auth.uid() or public.is_admin());

-- messages: lewat sesi milik sendiri + admin
create policy "ai_chat_messages_owner_all"
  on public.ai_chat_messages for all
  using (exists (
    select 1 from public.ai_chat_sessions s
    where s.id = session_id and (s.user_id = auth.uid() or public.is_admin())
  ))
  with check (exists (
    select 1 from public.ai_chat_sessions s
    where s.id = session_id and (s.user_id = auth.uid() or public.is_admin())
  ));

-- tokens: pemilik baca + update (pakai), admin semua
create policy "ai_discount_tokens_owner_select"
  on public.ai_discount_tokens for select
  using (user_id = auth.uid() or public.is_admin());

create policy "ai_discount_tokens_owner_update"
  on public.ai_discount_tokens for update
  using (user_id = auth.uid() or public.is_admin())
  with check (user_id = auth.uid() or public.is_admin());

-- 4. TRIGGER: hapus history saat batch selesai --------------------
create or replace function public.purge_ai_chat_for_batch()
returns trigger
language plpgsql security definer set search_path = 'public'
as $$
begin
  if new.status = 'completed' then
    -- archive dulu (soft), lalu hapus pesan agar history benar-benar hilang
    update public.ai_chat_sessions
      set status = 'archived', updated_at = now()
      where batch_id = old.id and status = 'active';

    delete from public.ai_chat_messages m
    using public.ai_chat_sessions s
    where m.session_id = s.id and s.batch_id = old.id;

    delete from public.ai_chat_sessions
      where batch_id = old.id and status = 'archived';

    -- token diskon untuk kelas itu langsung kedaluwarsa
    update public.ai_discount_tokens
      set status = 'expired', expires_at = now()
      where batch_id = old.id and status = 'available';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_purge_ai_chat_on_batch_complete on public.batches;
create trigger trg_purge_ai_chat_on_batch_complete
  after update of status on public.batches
  for each row execute function public.purge_ai_chat_for_batch();

-- 5. RPC: penerbitan token diskon dengan aturan ketat -------------
-- Dipanggil oleh edge function AI ketika kondisi offering terpenuhi.
-- Validasi di sini memastikan token TIDAK bisa diterbitkan asal-asalan:
--  - user harus punya enrollment aktif di batch kelas tsb
--  - hanya satu token available per user per batch
--  - batch harus berstatus active/upcoming
--  - nilai diskon dibatasi rentang aman
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
  if v_discount = 40 then v_discount := 40; end if;

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