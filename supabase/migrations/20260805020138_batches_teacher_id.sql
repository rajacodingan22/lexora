alter table public.batches
  add column if not exists teacher_id uuid references public.teachers(id) on delete set null;

create index if not exists batches_teacher_id_idx on public.batches(teacher_id);