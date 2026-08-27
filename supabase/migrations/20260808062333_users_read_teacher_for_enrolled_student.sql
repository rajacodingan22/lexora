-- Student boleh melihat profil guru yang mengajar course yang dia enroll
-- (kebalikan dari users_read_course_teacher yang mengizinkan guru lihat siswa-nya)
create policy "users_read_enrolled_course_teacher"
on public.users
for select
to public
using (
  exists (
    select 1
    from public.enrollments e
    join public.course_teachers ct on ct.course_id = e.course_id
    join public.teachers t on t.id = ct.teacher_id
    where t.user_id = users.id
      and e.user_id = auth.uid()
  )
);