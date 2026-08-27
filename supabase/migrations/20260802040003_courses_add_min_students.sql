alter table public.courses add column if not exists min_students integer not null default 10;
alter table public.courses add constraint courses_min_students_check check (min_students >= 1);