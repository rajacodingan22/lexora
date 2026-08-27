create or replace function public.sync_batch_student_counts()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_batch_id uuid;
begin
  v_batch_id := coalesce(new.batch_id, old.batch_id);

  update public.batches b
  set current_students = (
    select count(*)::int
    from public.enrollments e
    where e.batch_id = b.id
      and e.status in ('active', 'pending', 'pending_payment')
  )
  where b.id = v_batch_id;

  return coalesce(new, old);
end;
$$;

drop trigger if exists trg_sync_batch_counts on public.enrollments;

create trigger trg_sync_batch_counts
after insert or update of batch_id, status or delete on public.enrollments
for each row execute function public.sync_batch_student_counts();

update public.batches b
set current_students = (
  select count(*)::int
  from public.enrollments e
  where e.batch_id = b.id
    and e.status in ('active', 'pending', 'pending_payment')
);