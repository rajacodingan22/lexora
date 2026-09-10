-- Scripted roleplay (pengganti dialog bot free-form per-task).
-- Admin menulis naskah + casting tokoh; murid membaca barisnya; audio disetor; guru review manual.

-- 1. Script per task (1:1 dengan course_tasks yang dialog_enabled=true)
create table if not exists public.dialog_scripts (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null unique references public.course_tasks(id) on delete cascade,
  title text not null default '',
  scene_image_url text,
  setting_desc text,
  characters jsonb not null default '[]'::jsonb,
  student_character_id text,
  status text not null default 'draft' check (status in ('draft', 'published')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists dialog_scripts_task_idx on public.dialog_scripts (task_id);

-- 2. Baris naskah berurutan. reader = id tokoh di characters.
--    Baris tokoh murid (reader = student_character_id) = teks harapan yang wajib dibaca.
create table if not exists public.dialog_script_turns (
  id uuid primary key default gen_random_uuid(),
  script_id uuid not null references public.dialog_scripts(id) on delete cascade,
  turn_number int not null,
  reader text not null default '',
  text text not null default '',
  image_url text,
  keywords text[] not null default '{}',
  created_at timestamptz not null default now(),
  unique (script_id, turn_number)
);
create index if not exists dialog_script_turns_script_idx on public.dialog_script_turns (script_id, turn_number);

-- 3. Attempt murid: turns jsonb [{turn_id, transcript, similarity, drive_file_id, drive_link}]
create table if not exists public.dialog_script_submissions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  batch_id uuid not null references public.batches(id) on delete cascade,
  task_id uuid not null references public.course_tasks(id) on delete cascade,
  script_id uuid not null references public.dialog_scripts(id) on delete cascade,
  turns jsonb not null default '[]'::jsonb,
  auto_score numeric(5,2),
  status text not null default 'pending' check (status in ('pending', 'reviewed')),
  reviewed_by uuid references public.users(id),
  reviewed_at timestamptz,
  score_pronunciation int check (score_pronunciation is null or (score_pronunciation >= 0 and score_pronunciation <= 100)),
  score_fluency int check (score_fluency is null or (score_fluency >= 0 and score_fluency <= 100)),
  score_confidence int check (score_confidence is null or (score_confidence >= 0 and score_confidence <= 100)),
  score_comprehension int check (score_comprehension is null or (score_comprehension >= 0 and score_comprehension <= 100)),
  overall_score numeric(5,2),
  teacher_feedback text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists dss_user_task_idx on public.dialog_script_submissions (user_id, task_id);
create index if not exists dss_batch_idx on public.dialog_script_submissions (batch_id);
create index if not exists dss_status_idx on public.dialog_script_submissions (status);

-- updated_at trigger (reuse function if exists, else create local)
do $$ begin
  if not exists (select 1 from pg_proc where proname = 'set_dialog_updated_at') then
    create function public.set_dialog_updated_at() returns trigger language plpgsql as
    $f$ begin new.updated_at = now(); return new; end $f$;
  end if;
end $$;
drop trigger if exists trg_dialog_scripts_updated_at on public.dialog_scripts;
create trigger trg_dialog_scripts_updated_at before update on public.dialog_scripts
  for each row execute function public.set_dialog_updated_at();
drop trigger if exists trg_dss_updated_at on public.dialog_script_submissions;
create trigger trg_dss_updated_at before update on public.dialog_script_submissions
  for each row execute function public.set_dialog_updated_at();

-- 4. RLS (mirror speaking_review_submissions yang sudah diperbaiki)
alter table public.dialog_scripts enable row level security;
alter table public.dialog_script_turns enable row level security;
alter table public.dialog_script_submissions enable row level security;

-- scripts + turns: admin tulis; student enrolled baca yang published; teacher yang mengajar baca
drop policy if exists ds_admin_all on public.dialog_scripts;
create policy ds_admin_all on public.dialog_scripts
  for all to authenticated using (public.is_admin()) with check (public.is_admin());
drop policy if exists ds_read_enrolled on public.dialog_scripts;
create policy ds_read_enrolled on public.dialog_scripts
  for select to authenticated using (
    status = 'published' and exists (
      select 1 from public.batch_tasks bt
      join public.enrollments e on e.batch_id = bt.batch_id
      where bt.task_id = dialog_scripts.task_id
        and bt.status = 'published'
        and e.user_id = auth.uid()
    )
  );
drop policy if exists ds_read_teacher on public.dialog_scripts;
create policy ds_read_teacher on public.dialog_scripts
  for select to authenticated using (
    exists (
      select 1 from public.course_tasks ct
      join public.course_teachers cte on cte.course_id = ct.course_id
      join public.teachers t on t.id = cte.teacher_id
      where ct.id = dialog_scripts.task_id and t.user_id = auth.uid()
    )
  );

drop policy if exists dst_admin_all on public.dialog_script_turns;
create policy dst_admin_all on public.dialog_script_turns
  for all to authenticated using (public.is_admin()) with check (public.is_admin());
drop policy if exists dst_read_enrolled on public.dialog_script_turns;
create policy dst_read_enrolled on public.dialog_script_turns
  for select to authenticated using (
    exists (
      select 1 from public.dialog_scripts ds
      join public.batch_tasks bt on bt.task_id = ds.task_id
      join public.enrollments e on e.batch_id = bt.batch_id
      where ds.id = dialog_script_turns.script_id
        and ds.status = 'published'
        and bt.status = 'published'
        and e.user_id = auth.uid()
    )
  );
drop policy if exists dst_read_teacher on public.dialog_script_turns;
create policy dst_read_teacher on public.dialog_script_turns
  for select to authenticated using (
    exists (
      select 1 from public.dialog_scripts ds
      join public.course_tasks ct on ct.id = ds.task_id
      join public.course_teachers cte on cte.course_id = ct.course_id
      join public.teachers t on t.id = cte.teacher_id
      where ds.id = dialog_script_turns.script_id and t.user_id = auth.uid()
    )
  );

-- submissions: student own (insert + select + update pending); teacher (select + update) via course; admin all
drop policy if exists dss_select_own on public.dialog_script_submissions;
create policy dss_select_own on public.dialog_script_submissions
  for select to authenticated using (user_id = auth.uid());
drop policy if exists dss_insert_own on public.dialog_script_submissions;
create policy dss_insert_own on public.dialog_script_submissions
  for insert to authenticated with check (user_id = auth.uid());
drop policy if exists dss_update_own on public.dialog_script_submissions;
create policy dss_update_own on public.dialog_script_submissions
  for update to authenticated
  using (user_id = auth.uid() and status = 'pending')
  with check (user_id = auth.uid());
drop policy if exists dss_teacher_rw on public.dialog_script_submissions;
create policy dss_teacher_rw on public.dialog_script_submissions
  for all to authenticated using (
    exists (
      select 1 from public.enrollments e
      join public.course_teachers cte on cte.course_id = e.course_id
      join public.teachers t on t.id = cte.teacher_id
      where e.user_id = dialog_script_submissions.user_id
        and e.batch_id = dialog_script_submissions.batch_id
        and t.user_id = auth.uid()
        and e.status in ('active', 'completed')
    )
  )
  with check (
    exists (
      select 1 from public.enrollments e
      join public.course_teachers cte on cte.course_id = e.course_id
      join public.teachers t on t.id = cte.teacher_id
      where e.user_id = dialog_script_submissions.user_id
        and e.batch_id = dialog_script_submissions.batch_id
        and t.user_id = auth.uid()
        and e.status in ('active', 'completed')
    )
  );
drop policy if exists dss_admin_all on public.dialog_script_submissions;
create policy dss_admin_all on public.dialog_script_submissions
  for all to authenticated using (public.is_admin()) with check (public.is_admin());
