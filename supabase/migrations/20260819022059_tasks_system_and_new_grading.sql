-- ============================================================
-- TASKS SYSTEM (course_tasks -> task_materials -> student progress)
-- ============================================================

create table if not exists public.course_tasks (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.courses(id) on delete cascade,
  teacher_id uuid references public.teachers(id) on delete set null,
  task_number integer not null default 1,
  title text not null default '',
  description text,
  cover_image_url text,
  sort_order integer not null default 0,
  status text not null default 'draft' check (status in ('draft','published')),
  sequential_learning boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists course_tasks_course_idx on public.course_tasks (course_id, sort_order);

create table if not exists public.task_materials (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.course_tasks(id) on delete cascade,
  title text not null default '',
  description text,
  sort_order integer not null default 0,
  content_type text not null default 'text'
    check (content_type in ('text','video','audio','pdf','image','file','link','quiz','exercise')),
  content text,
  content_url text,
  is_required boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists task_materials_task_idx on public.task_materials (task_id, sort_order);

create table if not exists public.student_material_progress (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  material_id uuid not null references public.task_materials(id) on delete cascade,
  status text not null default 'not_started'
    check (status in ('not_started','in_progress','completed')),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint student_material_progress_unique unique (user_id, material_id)
);

create index if not exists student_material_progress_user_idx on public.student_material_progress (user_id);

-- jadwal final exam (di-set admin)
alter table public.final_exams add column if not exists starts_at timestamptz;

-- kolom task score di grade_aggregates
alter table public.grade_aggregates add column if not exists task_score numeric not null default 0;

-- ============================================================
-- RLS
-- ============================================================

alter table public.course_tasks enable row level security;
alter table public.task_materials enable row level security;
alter table public.student_material_progress enable row level security;

-- course_tasks: baca oleh siswa yang enrolled (dengan filter teacher), teacher, admin
create policy course_tasks_read_enrolled on public.course_tasks
  for select to public
  using (
    (exists (
      select 1 from enrollments e
      where e.course_id = course_tasks.course_id
        and e.user_id = auth.uid()
        and (e.teacher_id is null or course_tasks.teacher_id is null or e.teacher_id = course_tasks.teacher_id)
    ))
    or is_admin()
  );

create policy course_tasks_read_teacher on public.course_tasks
  for select to authenticated
  using (is_teacher_of_course(course_id));

create policy course_tasks_insert_teacher on public.course_tasks
  for insert to authenticated
  with check (is_teacher_of_course(course_id) or is_admin());

create policy course_tasks_update_teacher on public.course_tasks
  for update to authenticated
  using (is_teacher_of_course(course_id) or is_admin())
  with check (is_teacher_of_course(course_id) or is_admin());

create policy course_tasks_delete_teacher on public.course_tasks
  for delete to authenticated
  using (is_teacher_of_course(course_id) or is_admin());

-- task_materials
create policy task_materials_read_enrolled on public.task_materials
  for select to public
  using (
    exists (
      select 1 from course_tasks ct
      join enrollments e on e.course_id = ct.course_id
      where ct.id = task_materials.task_id
        and e.user_id = auth.uid()
        and (e.teacher_id is null or ct.teacher_id is null or e.teacher_id = ct.teacher_id)
    )
    or exists (select 1 from course_tasks ct where ct.id = task_materials.task_id and is_teacher_of_course(ct.course_id))
    or is_admin()
  );

create policy task_materials_write_teacher on public.task_materials
  for all to authenticated
  using (exists (select 1 from course_tasks ct where ct.id = task_materials.task_id and (is_teacher_of_course(ct.course_id) or is_admin())))
  with check (exists (select 1 from course_tasks ct where ct.id = task_materials.task_id and (is_teacher_of_course(ct.course_id) or is_admin())));

-- student_material_progress: hanya milik user sendiri
create policy progress_select_own on public.student_material_progress
  for select to public
  using (user_id = auth.uid() or is_admin());

create policy progress_insert_own on public.student_material_progress
  for insert to authenticated
  with check (user_id = auth.uid());

create policy progress_update_own on public.student_material_progress
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy progress_delete_own on public.student_material_progress
  for delete to authenticated
  using (user_id = auth.uid());

-- ============================================================
-- CALCULATE GRADE BARU: task 50% + exam 25% + quiz 5% + project 15% (absensi dihapus)
-- ============================================================

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
  v_weighted_total numeric := 0;
  v_grade_letter text;
  v_grade_points numeric;
  v_is_passing boolean;
  v_course_id uuid;
  v_user_id uuid;
begin
  select e.course_id, e.user_id, e.teacher_id into v_course_id, v_user_id, v_teacher_id
  from enrollments e where e.id = p_enrollment_id;

  if v_course_id is null then return; end if;

  -- 1. Assignment / project average (15%)
  select coalesce(round(avg(s.grade), 2), 0)
  into v_assignment_avg
  from assignments a
  join submissions s on s.assignment_id = a.id and s.user_id = v_user_id
  where a.course_id = v_course_id and s.grade is not null;

  -- 2. Quiz average (5%) — nilai tambahan
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

  -- 4. Task progress (50%) — semua materi dari task published (filter teacher)
  select count(*), count(*) filter (where p.status = 'completed')
  into v_task_total, v_task_done
  from course_tasks ct
  join task_materials tm on tm.task_id = ct.id
  left join student_material_progress p on p.material_id = tm.id and p.user_id = v_user_id
  where ct.course_id = v_course_id
    and ct.status = 'published'
    and (ct.teacher_id is null or v_teacher_id is null or ct.teacher_id = v_teacher_id);

  if v_task_total > 0 then
    v_task_score := round((v_task_done::numeric / v_task_total) * 100, 2);
  else
    -- tidak ada task yang dipublish: komponen task dianggap netral (100)
    v_task_score := 100;
  end if;

  -- Weighted total
  v_weighted_total := round(
    (v_task_score * 0.50) +
    (v_assignment_avg * 0.15) +
    (v_quiz_avg * 0.05) +
    (v_final_exam_score * 0.25),
    2
  );

  -- Grade letter
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

-- ============================================================
-- TRIGGER: recalc grade saat progress materi task berubah
-- ============================================================

create or replace function public.recalc_grade_on_task_progress()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_course_id uuid;
  v_user_id uuid;
begin
  if tg_op = 'DELETE' then
    select ct.course_id into v_course_id
    from task_materials tm
    join course_tasks ct on ct.id = tm.task_id
    where tm.id = old.material_id;
    v_user_id := old.user_id;
  else
    select ct.course_id into v_course_id
    from task_materials tm
    join course_tasks ct on ct.id = tm.task_id
    where tm.id = new.material_id;
    v_user_id := new.user_id;
  end if;

  if v_course_id is not null and v_user_id is not null then
    perform public.calculate_grade(e.id)
    from enrollments e
    where e.user_id = v_user_id and e.course_id = v_course_id;
  end if;

  return coalesce(new, old);
end;
$function$;

drop trigger if exists trg_recalc_grade_task_progress on public.student_material_progress;
create trigger trg_recalc_grade_task_progress
  after insert or update or delete on public.student_material_progress
  for each row execute function public.recalc_grade_on_task_progress();

grant execute on function public.calculate_grade(uuid) to authenticated;
