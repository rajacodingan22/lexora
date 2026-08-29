-- Dialog bot 7-menit di akhir unit (course_tasks = Unit)
-- Config per-unit + sessions + feedback diagnostic (tanpa skor grade)

-- 1. Extend course_tasks with dialog config
alter table public.course_tasks
  add column if not exists dialog_enabled boolean not null default false,
  add column if not exists dialog_topic text,
  add column if not exists dialog_character_name text,
  add column if not exists dialog_character_role text,
  add column if not exists dialog_instructions text,
  add column if not exists dialog_duration_sec integer not null default 420;

-- guard 0 = tanpa batas, else 60-900
do $$ begin
  if not exists (select 1 from pg_constraint where conname='course_tasks_dialog_duration_check') then
    alter table public.course_tasks add constraint course_tasks_dialog_duration_check
      check (dialog_duration_sec = 0 or (dialog_duration_sec between 60 and 900));
  end if;
end $$;

-- 2. Dialog sessions (server-authoritative timer via ends_at)
create table if not exists public.dialog_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  batch_id uuid not null references public.batches(id) on delete cascade,
  task_id uuid not null references public.course_tasks(id) on delete cascade,
  topic text not null,
  character_name text,
  character_role text,
  language_code text not null default 'en',
  status text not null default 'active' check (status in ('active','completed','expired','abandoned')),
  started_at timestamptz not null default now(),
  ends_at timestamptz, -- null = tanpa batas (manual end)
  completed_at timestamptz,
  turns jsonb not null default '[]'::jsonb, -- [{role:'user'|'bot', text, ts, cueShown, drive_file_id, drive_link, mimeType, botAudioUrl, word_scores}]
  feedback jsonb, -- {grammar:{clarity,issues[]}, pronunciation:{weakWords[],tips}, fluency, confidence, summary, practiceSuggestions[]}
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists dialog_sessions_user_batch_task_idx on public.dialog_sessions(user_id, batch_id, task_id);
create index if not exists dialog_sessions_user_status_idx on public.dialog_sessions(user_id, status);
create index if not exists dialog_sessions_task_idx on public.dialog_sessions(task_id);

-- updated_at trigger
create or replace function public.set_dialog_sessions_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;
drop trigger if exists trg_dialog_sessions_updated_at on public.dialog_sessions;
create trigger trg_dialog_sessions_updated_at before update on public.dialog_sessions
  for each row execute function public.set_dialog_sessions_updated_at();

-- 3. RLS
alter table public.dialog_sessions enable row level security;

-- student own
drop policy if exists dialog_sessions_select_own on public.dialog_sessions;
create policy dialog_sessions_select_own on public.dialog_sessions for select
  using (auth.uid() = user_id or exists (select 1 where public.is_admin()));

-- teacher via enrollments+course_teachers: allow select if teaching the course
drop policy if exists dialog_sessions_select_teacher on public.dialog_sessions;
create policy dialog_sessions_select_teacher on public.dialog_sessions for select
  using (
    exists (
      select 1 from public.enrollments e
      join public.course_teachers ct on ct.course_id = e.course_id
      join public.teachers t on t.id = ct.teacher_id
      where e.user_id = dialog_sessions.user_id
        and e.batch_id = dialog_sessions.batch_id
        and t.user_id = auth.uid()
    )
  );

drop policy if exists dialog_sessions_insert_own on public.dialog_sessions;
create policy dialog_sessions_insert_own on public.dialog_sessions for insert
  with check (auth.uid() = user_id);

drop policy if exists dialog_sessions_update_own on public.dialog_sessions;
create policy dialog_sessions_update_own on public.dialog_sessions for update
  using (auth.uid() = user_id or public.is_admin())
  with check (auth.uid() = user_id or public.is_admin());

drop policy if exists dialog_sessions_update_teacher on public.dialog_sessions;
create policy dialog_sessions_update_teacher on public.dialog_sessions for update
  using (
    exists (
      select 1 from public.enrollments e
      join public.course_teachers ct on ct.course_id = e.course_id
      join public.teachers t on t.id = ct.teacher_id
      where e.user_id = dialog_sessions.user_id
        and e.batch_id = dialog_sessions.batch_id
        and t.user_id = auth.uid()
    )
  );

-- 4. Realtime
do $$ begin
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and tablename='dialog_sessions') then
    alter publication supabase_realtime add table public.dialog_sessions;
  end if;
end $$;
