create table if not exists course_schedules (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references courses(id) on delete cascade,
  day_of_week integer not null check (day_of_week between 0 and 6),
  start_time time not null,
  duration_minutes integer not null default 60 check (duration_minutes > 0),
  created_at timestamptz not null default now()
);

create index if not exists course_schedules_course_idx on course_schedules(course_id);

alter table course_schedules enable row level security;

drop policy if exists course_schedules_read_public on course_schedules;
create policy course_schedules_read_public on course_schedules
for select to public using (true);

drop policy if exists course_schedules_write_authenticated on course_schedules;
create policy course_schedules_write_authenticated on course_schedules
for all to authenticated
using (is_admin() or exists (
  select 1 from course_teachers ct
  join teachers t on t.id = ct.teacher_id
  where ct.course_id = course_schedules.course_id and t.user_id = auth.uid()
))
with check (is_admin() or exists (
  select 1 from course_teachers ct
  join teachers t on t.id = ct.teacher_id
  where ct.course_id = course_schedules.course_id and t.user_id = auth.uid()
));