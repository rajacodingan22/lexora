-- Link notifikasi "assessment menunggu review" mengarah ke /teacher/penilaian
-- yang tidak ada (404). Arahkan ke /teacher/penugasan yang live.
-- Isi fungsi identik dengan versi remote, hanya link yang berubah.

create or replace function public.notify_submission_waiting()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_course_id uuid;
  v_course_title text;
  v_assignment_title text;
  v_student_name text;
  v_batch_id uuid;
begin
  select a.course_id, a.title into v_course_id, v_assignment_title from public.assignments a where a.id = new.assignment_id;
  if v_course_id is null then return new; end if;
  select coalesce(c.title->>'en', c.title->>'id', 'Course') into v_course_title from public.courses c where c.id = v_course_id;
  select display_name into v_student_name from public.users where id = new.user_id;
  -- get student's batch for link
  select batch_id into v_batch_id from public.enrollments where user_id = new.user_id and course_id = v_course_id and status in ('active','pending') limit 1;
  -- notify teachers of this course
  insert into public.notifications (user_id, type, title, body, link, template_key, params)
  select t.user_id, 'info',
    'Assessment Waiting for Review: "' || coalesce(v_assignment_title,'Assignment') || '"',
    'Student ' || coalesce(v_student_name,'Student') || ' submitted "' || coalesce(v_assignment_title,'Assignment') || '" for course "' || coalesce(v_course_title,'Course') || '". Please review.',
    '/teacher/penugasan',
    'assessmentWaiting',
    jsonb_build_object('assessment', coalesce(v_assignment_title,'Assignment'), 'assignmentId', new.assignment_id::text, 'submissionId', new.id::text, 'course', coalesce(v_course_title,'Course'), 'courseId', v_course_id::text, 'batchId', coalesce(v_batch_id::text,''), 'student', coalesce(v_student_name,'Student'), 'studentId', new.user_id::text)
  from public.course_teachers ct join public.teachers t on t.id = ct.teacher_id
  where ct.course_id = v_course_id;
  return new;
end;
$function$;
