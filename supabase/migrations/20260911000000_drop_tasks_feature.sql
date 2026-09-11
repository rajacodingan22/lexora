-- Hapus total fitur Tasks (course_tasks LMS) di semua role.
-- Urutan drop memperhatikan FK. Grade dihitung ulang tanpa komponen task.

-- 0. Matikan cron yang menyentuh tabel tasks
select cron.unschedule('overdue-tasks-check') where exists (select 1 from cron.job where jobname = 'overdue-tasks-check');
select cron.unschedule('project-2weeks') where exists (select 1 from cron.job where jobname = 'project-2weeks');

-- 1. Drop fungsi yang hanya hidup untuk tasks
drop function if exists public.notify_overdue_tasks();
drop function if exists public.notify_project_two_weeks();
drop function if exists public.calculate_grade_for_task(uuid);
drop function if exists public.recalc_grade_on_student_task();
drop function if exists public.recalc_grade_on_task_progress();
drop function if exists public.update_speaking_review_updated_at();
drop function if exists public.set_dialog_updated_at();
drop function if exists public.set_dialog_sessions_updated_at();

-- 2. Drop tabel tasks (CASCADE membersihkan policy + trigger yang menempel)
drop table if exists public.dialog_script_submissions cascade;
drop table if exists public.dialog_script_turns cascade;
drop table if exists public.dialog_scripts cascade;
drop table if exists public.speaking_review_submissions cascade;
drop table if exists public.dialog_sessions cascade;
drop table if exists public.student_activity_progress cascade;
drop table if exists public.student_lesson_progress cascade;
drop table if exists public.student_task_progress cascade;
drop table if exists public.student_material_progress cascade;
drop table if exists public.activity_content cascade;
drop table if exists public.lesson_activities cascade;
drop table if exists public.task_lessons cascade;
drop table if exists public.batch_tasks cascade;
drop table if exists public.task_materials cascade;
drop table if exists public.course_tasks cascade;
drop table if exists public.activity_library_items cascade;

-- 3. calculate_grade tanpa tasks:
--    assignment (tugas) 30% + quiz 20% + final exam 50% = 1.00
--    task_score & attendance_score ditulis 0 (kolom tetap ada agar select lama tidak pecah).
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

  -- 1. Tugas / assignment average (30%)
  select coalesce(round(avg(s.grade), 2), 0)
  into v_assignment_avg
  from assignments a
  join submissions s on s.assignment_id = a.id and s.user_id = v_user_id
  where a.course_id = v_course_id and s.grade is not null;

  -- 2. Quiz average (20%)
  select coalesce(round(avg(qa.score), 2), 0)
  into v_quiz_avg
  from quizzes q
  join quiz_attempts qa on qa.quiz_id = q.id and qa.user_id = v_user_id
  where q.course_id = v_course_id;

  -- 3. Final exam (50%)
  select coalesce(round(avg(er.score), 2), 0)
  into v_final_exam_score
  from final_exams fe
  join exam_results er on er.exam_id = fe.id and er.user_id = v_user_id
  where fe.course_id = v_course_id;

  -- Weighted total: 0.30 + 0.20 + 0.50 = 1.00
  v_weighted_total := round(
    (v_assignment_avg * 0.30) +
    (v_quiz_avg * 0.20) +
    (v_final_exam_score * 0.50),
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
    0, v_weighted_total, v_grade_letter, v_grade_points, v_is_passing, now()
  )
  on conflict (enrollment_id) do update set
    attendance_score = 0,
    assignment_average = excluded.assignment_average,
    quiz_average = excluded.quiz_average,
    final_exam_score = excluded.final_exam_score,
    task_score = 0,
    weighted_total = excluded.weighted_total,
    grade_letter = excluded.grade_letter,
    grade_points = excluded.grade_points,
    is_passing = excluded.is_passing,
    last_updated = now();
end;
$function$;

-- 4. Hitung ulang semua nilai dengan formula baru
select public.calculate_grade(e.id) from public.enrollments e;
