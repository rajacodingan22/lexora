-- ============================================================
-- LEARNING MANAGEMENT SYSTEM (LMS)
-- Master Task + Batch Task Assignment + Lesson/Activity + Progress
-- Legacy (task_materials, student_material_progress) DI-PERTAHANKAN.
-- ============================================================

-- ------------------------------------------------------------
-- 1. ALTER course_tasks -> Master Task
-- ------------------------------------------------------------
alter table public.course_tasks add column if not exists estimated_duration text;
alter table public.course_tasks add column if not exists min_completion_score integer not null default 70;
alter table public.course_tasks add column if not exists completion_requirement text not null default 'all_lessons'
  check (completion_requirement in ('all_lessons','all_lessons_mission'));
alter table public.course_tasks add column if not exists lesson_unlock_rule text not null default 'all_available'
  check (lesson_unlock_rule in ('all_available','sequential','minimum_score'));
alter table public.course_tasks add column if not exists required_lesson_score integer not null default 70;
alter table public.course_tasks add column if not exists activity_unlock_rule text not null default 'sequential'
  check (activity_unlock_rule in ('all_available','sequential'));
alter table public.course_tasks add column if not exists content_version integer not null default 1;

alter table public.course_tasks drop constraint if exists course_tasks_status_check;
alter table public.course_tasks add constraint course_tasks_status_check
  check (status in ('draft','published','archived'));

-- ------------------------------------------------------------
-- 2. task_lessons
-- ------------------------------------------------------------
create table if not exists public.task_lessons (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.course_tasks(id) on delete cascade,
  lesson_number integer not null default 1,
  title text not null default '',
  description text,
  icon text,
  estimated_duration text,
  sort_order integer not null default 0,
  status text not null default 'draft' check (status in ('draft','published','archived')),
  content_version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists task_lessons_task_idx on public.task_lessons (task_id, sort_order);
create index if not exists task_lessons_status_idx on public.task_lessons (status);

-- ------------------------------------------------------------
-- 3. lesson_activities
-- ------------------------------------------------------------
create table if not exists public.lesson_activities (
  id uuid primary key default gen_random_uuid(),
  lesson_id uuid not null references public.task_lessons(id) on delete cascade,
  activity_type text not null check (activity_type in (
    'learn','flashcard','vocabulary','listening','speaking','reading','grammar_fix',
    'fill_blank','arrange_sentence','image_selection','matching','writing','quick_review'
  )),
  title text not null default '',
  instruction text,
  sort_order integer not null default 0,
  status text not null default 'draft' check (status in ('draft','published','archived')),
  content_version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists lesson_activities_lesson_idx on public.lesson_activities (lesson_id, sort_order);
create index if not exists lesson_activities_status_idx on public.lesson_activities (status);

-- ------------------------------------------------------------
-- 4. activity_content (visual builder only — admin never edits JSON)
-- ------------------------------------------------------------
create table if not exists public.activity_content (
  id uuid primary key default gen_random_uuid(),
  activity_id uuid not null references public.lesson_activities(id) on delete cascade,
  content_type text not null default 'learn',
  schema_version integer not null default 1,
  content_version integer not null default 1,
  content jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint activity_content_activity_unique unique (activity_id)
);

create index if not exists activity_content_activity_idx on public.activity_content (activity_id);

-- ------------------------------------------------------------
-- 5. task_missions
-- ------------------------------------------------------------
create table if not exists public.task_missions (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.course_tasks(id) on delete cascade,
  title text not null default '',
  mission_type text not null default 'quiz_challenge' check (mission_type in (
    'quiz_challenge','speaking_challenge','writing_challenge','interactive_dialogue','ai_conversation'
  )),
  scenario text,
  objectives jsonb not null default '[]'::jsonb,
  passing_score integer not null default 70,
  max_attempts integer,
  unlock_next boolean not null default false,
  status text not null default 'draft' check (status in ('draft','published','archived')),
  content jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint task_missions_task_unique unique (task_id)
);

create index if not exists task_missions_task_idx on public.task_missions (task_id);

-- ------------------------------------------------------------
-- 6. batch_tasks (pivot: Master Task <-> Batch)
-- ------------------------------------------------------------
create table if not exists public.batch_tasks (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references public.batches(id) on delete cascade,
  task_id uuid not null references public.course_tasks(id) on delete cascade,
  sort_order integer not null default 0,
  status text not null default 'published' check (status in ('published','unpublished')),
  availability_start timestamptz,
  availability_end timestamptz,
  override_enabled boolean not null default false,
  override_title text,
  override_duration text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint batch_tasks_batch_task_unique unique (batch_id, task_id)
);

create index if not exists batch_tasks_batch_idx on public.batch_tasks (batch_id, sort_order);
create index if not exists batch_tasks_task_idx on public.batch_tasks (task_id);

-- ------------------------------------------------------------
-- 7. student_task_progress (context: Student -> Batch -> Task)
-- ------------------------------------------------------------
create table if not exists public.student_task_progress (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  batch_id uuid not null references public.batches(id) on delete cascade,
  task_id uuid not null references public.course_tasks(id) on delete cascade,
  status text not null default 'not_started' check (status in ('not_started','in_progress','completed')),
  total_lessons integer not null default 0,
  completed_lessons integer not null default 0,
  total_activities integer not null default 0,
  completed_activities integer not null default 0,
  last_lesson_id uuid references public.task_lessons(id) on delete set null,
  last_activity_id uuid references public.lesson_activities(id) on delete set null,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint student_task_progress_unique unique (user_id, batch_id, task_id)
);

create index if not exists student_task_progress_user_idx on public.student_task_progress (user_id, batch_id);
create index if not exists student_task_progress_task_idx on public.student_task_progress (task_id);

-- ------------------------------------------------------------
-- 8. student_lesson_progress (context: Student -> Batch -> Task -> Lesson)
-- ------------------------------------------------------------
create table if not exists public.student_lesson_progress (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  batch_id uuid not null references public.batches(id) on delete cascade,
  task_id uuid not null references public.course_tasks(id) on delete cascade,
  lesson_id uuid not null references public.task_lessons(id) on delete cascade,
  status text not null default 'not_started' check (status in ('not_started','in_progress','completed')),
  score integer,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint student_lesson_progress_unique unique (user_id, batch_id, lesson_id)
);

create index if not exists student_lesson_progress_user_idx on public.student_lesson_progress (user_id, batch_id);
create index if not exists student_lesson_progress_lesson_idx on public.student_lesson_progress (lesson_id);
create index if not exists student_lesson_progress_task_idx on public.student_lesson_progress (task_id);

-- ------------------------------------------------------------
-- 9. student_activity_progress (context: Student -> Batch -> Task -> Lesson -> Activity)
-- ------------------------------------------------------------
create table if not exists public.student_activity_progress (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  batch_id uuid not null references public.batches(id) on delete cascade,
  task_id uuid not null references public.course_tasks(id) on delete cascade,
  lesson_id uuid not null references public.task_lessons(id) on delete cascade,
  activity_id uuid not null references public.lesson_activities(id) on delete cascade,
  status text not null default 'not_started' check (status in ('not_started','in_progress','completed')),
  score integer,
  attempts integer not null default 0,
  answers jsonb,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint student_activity_progress_unique unique (user_id, batch_id, activity_id)
);

create index if not exists student_activity_progress_user_idx on public.student_activity_progress (user_id, batch_id);
create index if not exists student_activity_progress_activity_idx on public.student_activity_progress (activity_id);
create index if not exists student_activity_progress_lesson_idx on public.student_activity_progress (lesson_id);
create index if not exists student_activity_progress_task_idx on public.student_activity_progress (task_id);

-- ------------------------------------------------------------
-- 10. student_mission_results
-- ------------------------------------------------------------
create table if not exists public.student_mission_results (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  batch_id uuid not null references public.batches(id) on delete cascade,
  task_id uuid not null references public.course_tasks(id) on delete cascade,
  mission_id uuid not null references public.task_missions(id) on delete cascade,
  score integer not null default 0,
  passed boolean not null default false,
  attempts integer not null default 1,
  payload jsonb,
  created_at timestamptz not null default now(),
  constraint student_mission_results_unique unique (user_id, batch_id, mission_id)
);

create index if not exists student_mission_results_user_idx on public.student_mission_results (user_id, batch_id);
create index if not exists student_mission_results_mission_idx on public.student_mission_results (mission_id);

-- ------------------------------------------------------------
-- 11. activity_library_items
-- ------------------------------------------------------------
create table if not exists public.activity_library_items (
  id uuid primary key default gen_random_uuid(),
  activity_type text not null check (activity_type in (
    'learn','flashcard','vocabulary','listening','speaking','reading','grammar_fix',
    'fill_blank','arrange_sentence','image_selection','matching','writing','quick_review'
  )),
  title text not null default '',
  description text,
  content jsonb not null default '{}'::jsonb,
  usage_count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists activity_library_items_type_idx on public.activity_library_items (activity_type);
create index if not exists activity_library_items_title_idx on public.activity_library_items (title);

-- ------------------------------------------------------------
-- RLS
-- ------------------------------------------------------------
alter table public.task_lessons enable row level security;
alter table public.lesson_activities enable row level security;
alter table public.activity_content enable row level security;
alter table public.task_missions enable row level security;
alter table public.batch_tasks enable row level security;
alter table public.student_task_progress enable row level security;
alter table public.student_lesson_progress enable row level security;
alter table public.student_activity_progress enable row level security;
alter table public.student_mission_results enable row level security;
alter table public.activity_library_items enable row level security;

-- task_lessons: admin tulis; student enrolled di batch yang memakai task boleh baca
create policy task_lessons_admin_all on public.task_lessons
  for all to authenticated using (is_admin()) with check (is_admin());

create policy task_lessons_read_enrolled on public.task_lessons
  for select to public
  using (
    exists (
      select 1 from batch_tasks bt
      join enrollments e on e.batch_id = bt.batch_id
      where bt.task_id = task_lessons.task_id and e.user_id = auth.uid()
    )
  );

-- lesson_activities
create policy lesson_activities_admin_all on public.lesson_activities
  for all to authenticated using (is_admin()) with check (is_admin());

create policy lesson_activities_read_enrolled on public.lesson_activities
  for select to public
  using (
    exists (
      select 1 from task_lessons tl
      join batch_tasks bt on bt.task_id = tl.task_id
      join enrollments e on e.batch_id = bt.batch_id
      where tl.id = lesson_activities.lesson_id and e.user_id = auth.uid()
    )
  );

-- activity_content
create policy activity_content_admin_all on public.activity_content
  for all to authenticated using (is_admin()) with check (is_admin());

create policy activity_content_read_enrolled on public.activity_content
  for select to public
  using (
    exists (
      select 1 from lesson_activities la
      join task_lessons tl on tl.id = la.lesson_id
      join batch_tasks bt on bt.task_id = tl.task_id
      join enrollments e on e.batch_id = bt.batch_id
      where la.id = activity_content.activity_id and e.user_id = auth.uid()
    )
  );

-- task_missions
create policy task_missions_admin_all on public.task_missions
  for all to authenticated using (is_admin()) with check (is_admin());

create policy task_missions_read_enrolled on public.task_missions
  for select to public
  using (
    exists (
      select 1 from batch_tasks bt
      join enrollments e on e.batch_id = bt.batch_id
      where bt.task_id = task_missions.task_id and e.user_id = auth.uid()
    )
  );

-- batch_tasks: student hanya melihat batch miliknya
create policy batch_tasks_admin_all on public.batch_tasks
  for all to authenticated using (is_admin()) with check (is_admin());

create policy batch_tasks_read_own_batch on public.batch_tasks
  for select to public
  using (
    exists (
      select 1 from enrollments e
      where e.batch_id = batch_tasks.batch_id and e.user_id = auth.uid()
    )
  );

-- progress tables: hanya milik user sendiri (admin read all)
create policy stp_select_own on public.student_task_progress
  for select to public using (user_id = auth.uid() or is_admin());
create policy stp_insert_own on public.student_task_progress
  for insert to authenticated with check (user_id = auth.uid());
create policy stp_update_own on public.student_task_progress
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy stp_delete_own on public.student_task_progress
  for delete to authenticated using (user_id = auth.uid());

create policy slp_select_own on public.student_lesson_progress
  for select to public using (user_id = auth.uid() or is_admin());
create policy slp_insert_own on public.student_lesson_progress
  for insert to authenticated with check (user_id = auth.uid());
create policy slp_update_own on public.student_lesson_progress
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy slp_delete_own on public.student_lesson_progress
  for delete to authenticated using (user_id = auth.uid());

create policy sap_select_own on public.student_activity_progress
  for select to public using (user_id = auth.uid() or is_admin());
create policy sap_insert_own on public.student_activity_progress
  for insert to authenticated with check (user_id = auth.uid());
create policy sap_update_own on public.student_activity_progress
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy sap_delete_own on public.student_activity_progress
  for delete to authenticated using (user_id = auth.uid());

create policy smr_select_own on public.student_mission_results
  for select to public using (user_id = auth.uid() or is_admin());
create policy smr_insert_own on public.student_mission_results
  for insert to authenticated with check (user_id = auth.uid());
create policy smr_update_own on public.student_mission_results
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy smr_delete_own on public.student_mission_results
  for delete to authenticated using (user_id = auth.uid());

-- activity_library_items: admin only
create policy ali_admin_all on public.activity_library_items
  for all to authenticated using (is_admin()) with check (is_admin());

-- ------------------------------------------------------------
-- CALCULATE GRADE: task 50% dari student_task_progress (sistem baru)
-- Legacy (task_materials / student_material_progress) tetap utuh.
-- ------------------------------------------------------------
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
    -- tidak ada task terassign: komponen task dianggap netral (100)
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

-- trigger: recalc grade saat student_task_progress berubah
create or replace function public.recalc_grade_on_student_task()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_user_id uuid;
  v_batch_id uuid;
begin
  if tg_op = 'DELETE' then
    v_user_id := old.user_id;
    v_batch_id := old.batch_id;
  else
    v_user_id := new.user_id;
    v_batch_id := new.batch_id;
  end if;

  if v_user_id is not null and v_batch_id is not null then
    perform public.calculate_grade(e.id)
    from enrollments e
    where e.user_id = v_user_id and e.batch_id = v_batch_id
      and e.status in ('active','completed');
  end if;

  return coalesce(new, old);
end;
$function$;

drop trigger if exists trg_recalc_grade_student_task on public.student_task_progress;
create trigger trg_recalc_grade_student_task
  after insert or update or delete on public.student_task_progress
  for each row execute function public.recalc_grade_on_student_task();

grant execute on function public.calculate_grade(uuid) to authenticated;