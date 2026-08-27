-- Siswa sah mengisi status='submitted' saat upload/submit ulang.
-- Trigger sebelumnya menull-kan status pada INSERT milik siswa,
-- menyebabkan UI selalu tampil "Not Submitted".
create or replace function public.guard_submissions_grade()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_user_id uuid := auth.uid();
  v_teacher boolean;
begin
  if public.is_admin() then
    return new;
  end if;
  if tg_op = 'INSERT' then
    v_teacher := v_user_id is not null and exists (select 1 from public.assignments a
                                                  where a.id = new.assignment_id and public.is_teacher_of_course(a.course_id));
    if not v_teacher then
      -- Hormati status yang dikirim siswa (mis. 'submitted'); hanya lindungi kolom grading
      if new.status is null then
        new.status := 'submitted';
      end if;
      new.grade := null;
      new.feedback := null;
      new.graded_by := null;
      new.graded_at := null;
    end if;
    return new;
  end if;
  if new.grade is distinct from old.grade
     or new.feedback is distinct from old.feedback
     or new.graded_by is distinct from old.graded_by
     or new.graded_at is distinct from old.graded_at
     or new.status is distinct from old.status then
    if v_user_id is null or not exists (select 1 from public.assignments a
                                        where a.id = new.assignment_id and public.is_teacher_of_course(a.course_id)) then
      raise exception 'Hanya guru kelas yang dapat menilai';
    end if;
  end if;
  return new;
end;
$function$;

-- Backfill: baris siswa yang kehilangan status -> submitted (kecuali sudah graded)
alter table public.submissions disable trigger submissions_guard_grade;
update public.submissions s
  set status = 'submitted'
  where s.status is null
    and s.grade is null
    and s.graded_at is null;
alter table public.submissions enable trigger submissions_guard_grade;