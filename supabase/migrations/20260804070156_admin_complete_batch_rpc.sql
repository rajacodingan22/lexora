create or replace function public.complete_batch(p_batch_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_course_id uuid;
  v_is_authorized boolean;
begin
  select course_id into v_course_id from batches where id = p_batch_id;
  if v_course_id is null then
    raise exception 'Batch tidak ditemukan';
  end if;

  v_is_authorized := public.is_admin()
    or exists (
      select 1
      from course_teachers ct
      join teachers t on t.id = ct.teacher_id
      where ct.course_id = v_course_id
        and t.user_id = auth.uid()
    );

  if not v_is_authorized then
    raise exception 'Tidak diizinkan';
  end if;

  update batches
  set status = 'completed',
      completed_at = coalesce(completed_at, now()),
      end_date = coalesce(end_date, current_date)
  where id = p_batch_id and status <> 'completed';

  update enrollments
  set status = 'completed',
      completed_at = coalesce(completed_at, now())
  where batch_id = p_batch_id and status = 'active';

  update grade_aggregates ga
  set is_passing = ga.is_passing
  where ga.enrollment_id in (
    select e.id from enrollments e
    where e.batch_id = p_batch_id and e.status = 'completed'
  );
end;
$function$;