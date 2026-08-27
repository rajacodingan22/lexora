-- fungsi trigger recalc hanya boleh dipanggil oleh sistem (trigger), bukan via API
revoke all on function public.recalc_grade_on_task_progress() from public;
revoke all on function public.recalc_grade_on_task_progress() from anon;
revoke all on function public.recalc_grade_on_task_progress() from authenticated;
