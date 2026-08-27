-- update batches dari trigger sistem (mis. sync_batch_student_counts
-- yang dijalankan saat INSERT enrollment) adalah operasi internal —
-- tidak terblokir oleh guard yang ditujukan untuk teacher.
-- Pola ini sama dengan guard_certificates (pg_trigger_depth() > 1).
create or replace function public.guard_batch_teacher_update()
returns trigger
language plpgsql
as $function$
begin
  -- Update yang berasal dari trigger sistem (nested) diizinkan
  if pg_trigger_depth() > 0 then
    return new;
  end if;

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
$function$;