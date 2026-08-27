alter table public.enrollments disable trigger enrollments_guard_status;

update public.enrollments
set status = 'active', completed_at = null
where id = 'cfa515c4-0d09-4a19-a741-3686ced2cb2a';

delete from public.certificates
where id = '3d272506-129e-4c0b-a2d0-948c1b23e352';

delete from public.student_badges
where id = 'de487bb1-0b28-48b4-98ea-fceb2a80b378';

delete from public.grade_aggregates
where enrollment_id = 'cfa515c4-0d09-4a19-a741-3686ced2cb2a';

alter table public.enrollments enable trigger enrollments_guard_status;