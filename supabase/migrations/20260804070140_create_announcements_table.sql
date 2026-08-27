create table public.announcements (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  content text not null,
  priority text not null default 'medium' check (priority in ('high', 'medium', 'low')),
  author_id uuid references public.users(id) on delete set null,
  published_at timestamptz not null default now(),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.announcements enable row level security;

create policy ann_select on public.announcements
  for select to authenticated
  using (is_active = true);

create policy ann_insert on public.announcements
  for insert to authenticated
  with check (public.is_admin());

create policy ann_update on public.announcements
  for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

create policy ann_delete on public.announcements
  for delete to authenticated
  using (public.is_admin());

create trigger trg_announcements_updated_at
  before update on public.announcements
  for each row execute function public.update_timestamp();

insert into public.announcements (title, content, priority, author_id)
select
  'Selamat datang di EduLingo!',
  'Jelajahi kursus bahasa dan mulai perjalanan belajarmu hari ini.',
  'high',
  u.id
from public.users u
where u.role = 'admin'
order by u.created_at
limit 1;