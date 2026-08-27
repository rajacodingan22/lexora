-- Fix grade weights to sum to 1.0 (was 0.95) - per audit P1-7
-- Previously: 0.50 task + 0.15 assignment + 0.05 quiz + 0.25 final = 0.95
-- Now: 0.50 task + 0.20 assignment + 0.05 quiz + 0.25 final = 1.00

create or replace function public.calculate_grade(p_enrollment_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_assignment_avg numeric := 0;
  v_quiz_avg numeric := 0;
  v_final_exam_score numeric := 0;
  v_task_score numeric := 100;
  v_task_total int := 0;
  v_task_done int := 0;
  v_teacher_id uuid;
  v_batch_id uuid;
  v_weighted_total numeric := 0;
  v_grade_letter text;
  v_grade_points numeric;
  v_is_passing boolean;
  v_course_id uuid;
  v_user_id uuid;
begin
  select e.course_id, e.user_id, e.teacher_id, e.batch_id
  into v_course_id, v_user_id, v_teacher_id, v_batch_id
  from enrollments e where e.id = p_enrollment_id;

  if v_course_id is null then return; end if;

  -- 1. Assignment / project average (20% - updated from 15%)
  select coalesce(round(avg(s.grade), 2), 0)
  into v_assignment_avg
  from assignments a
  join submissions s on s.assignment_id = a.id and s.user_id = v_user_id
  where a.course_id = v_course_id and s.grade is not null;

  -- 2. Quiz average (5%)
  select coalesce(round(avg(qa.score), 2), 0)
  into v_quiz_avg
  from quizzes q
  join quiz_attempts qa on qa.quiz_id = q.id and qa.user_id = v_user_id
  where q.course_id = v_course_id;

  -- 3. Final exam (25%)
  select coalesce(round(avg(er.score), 2), 0)
  into v_final_exam_score
  from final_exams fe
  join exam_results er on er.exam_id = fe.id and er.user_id = v_user_id
  where fe.course_id = v_course_id;

  -- 4. Task progress (50%) — LMS baru: published assigned tasks dalam availability
  select count(*), count(*) filter (where p.status = 'completed')
  into v_task_total, v_task_done
  from batch_tasks bt
  left join student_task_progress p
    on p.task_id = bt.task_id and p.batch_id = bt.batch_id and p.user_id = v_user_id
  where bt.batch_id = v_batch_id
    and bt.status = 'published'
    and (bt.availability_start is null or bt.availability_start <= now())
    and (bt.availability_end is null or bt.availability_end >= now());

  if v_task_total > 0 then
    v_task_score := round((v_task_done::numeric / v_task_total) * 100, 2);
  else
    -- tidak ada task terassign: komponen task dianggap netral (100) - student tidak penalized
    v_task_score := 100;
  end if;

  -- Weighted total (updated: 0.50+0.20+0.05+0.25 = 1.00)
  v_weighted_total := round(
    (v_task_score * 0.50) +
    (v_assignment_avg * 0.20) +
    (v_quiz_avg * 0.05) +
    (v_final_exam_score * 0.25),
    2
  );

  if v_weighted_total >= 85 then
    v_grade_letter := 'A'; v_grade_points := 4.0;
  elsif v_weighted_total >= 75 then
    v_grade_letter := 'B'; v_grade_points := 3.0;
  elsif v_weighted_total >= 65 then
    v_grade_letter := 'C'; v_grade_points := 2.0;
  elsif v_weighted_total >= 55 then
    v_grade_letter := 'D'; v_grade_points := 1.0;
  else
    v_grade_letter := 'E'; v_grade_points := 0;
  end if;

  v_is_passing := v_weighted_total >= 65;

  insert into grade_aggregates (
    enrollment_id, attendance_score, assignment_average, quiz_average, final_exam_score,
    task_score, weighted_total, grade_letter, grade_points, is_passing, last_updated
  )
  values (
    p_enrollment_id, 0, v_assignment_avg, v_quiz_avg, v_final_exam_score,
    v_task_score, v_weighted_total, v_grade_letter, v_grade_points, v_is_passing, now()
  )
  on conflict (enrollment_id) do update set
    attendance_score = 0,
    assignment_average = excluded.assignment_average,
    quiz_average = excluded.quiz_average,
    final_exam_score = excluded.final_exam_score,
    task_score = excluded.task_score,
    weighted_total = excluded.weighted_total,
    grade_letter = excluded.grade_letter,
    grade_points = excluded.grade_points,
    is_passing = excluded.is_passing,
    last_updated = now();
end;
$function$;

-- Also fix the task-specific grading variant if exists
create or replace function public.calculate_grade_for_task(p_task_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  -- trigger recalc for all enrollments linked to this task's batch
  perform public.calculate_grade(e.id)
  from enrollments e
  join batch_tasks bt on bt.batch_id = e.batch_id and bt.task_id = p_task_id
  where e.status in ('active','completed');
end;
$function$;
