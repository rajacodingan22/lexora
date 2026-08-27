create or replace function guard_batch_teacher_update()
returns trigger
language plpgsql
security invoker
as $$
begin
  -- service_role (backend) dan admin bebas; hanya teacher yang dibatasi
  if current_user = 'service_role' or public.is_admin() then
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