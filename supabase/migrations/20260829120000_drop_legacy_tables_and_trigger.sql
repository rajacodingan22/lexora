-- Drop dead legacy tables that are no longer referenced by any code
drop table if exists public.task_missions cascade;
drop table if exists public.student_mission_results cascade;

-- Drop legacy trigger on student_material_progress (replaced by LMS grade system)
drop trigger if exists trg_recalc_grade_task_progress on public.student_material_progress;
