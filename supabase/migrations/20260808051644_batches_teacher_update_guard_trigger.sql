-- Trigger guard: teacher hanya boleh mengubah start_date, end_date, meetings_per_week.
-- Kolom lain (status, capacity, current_students, teacher_id, name, code, reminder_sent) -> ditolak kecuali admin.
create or replace function guard_batch_teacher_update()
returns trigger
language plpgsql
security invoker
as $$
begin
  if public.is_admin() then
    return new;
  end if;

  if old.status is distinct from new.status
     or old.capacity is distinct from new.capacity
     or old.current_students is distinct from new.current_students
     or old.teacher_id is distinct from new.teacher_id
     or old.name is distinct from new.name
     or old.code is distinct from new.code
     or old.reminder_sent is distinct from new.reminder_sent
     or old.course_id is distinct from new.course_id then
    raise exception 'Not allowed: teachers may only update scheduling fields (start_date, end_date, meetings_per_week)';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_guard_batch_teacher_update on public.batches;
create trigger trg_guard_batch_teacher_update
before update on public.batches
for each row
execute function guard_batch_teacher_update();