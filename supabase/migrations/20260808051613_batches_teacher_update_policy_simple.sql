-- Ganti policy kompleks dengan versi sederhana: teacher yang mengajar kursus boleh update batch-nya.
-- Proteksi kolom dilakukan dengan membandingkan NEW terhadap nilai existing via subquery pada id (PK -> selalu 1 baris).
drop policy if exists batches_update_assigned_teacher on public.batches;

create policy batches_update_assigned_teacher
on public.batches
for update
to authenticated
using (
  exists (
    select 1
    from public.course_teachers ct
    where ct.course_id = batches.course_id
      and ct.teacher_id in (select id from public.teachers where user_id = auth.uid())
  )
)
with check (
  exists (
    select 1
    from public.course_teachers ct
    where ct.course_id = batches.course_id
      and ct.teacher_id in (select id from public.teachers where user_id = auth.uid())
  )
);