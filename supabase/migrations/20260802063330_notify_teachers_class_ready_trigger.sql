create or replace function notify_teachers_class_ready()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  c record;
  active_count int;
  t record;
  course_title text;
  teacher_uid uuid;
begin
  if new.status = 'active' then
    select min_students, title into c from courses where id = new.course_id;
    if c is null or c.min_students is null or c.min_students <= 0 then
      return new;
    end if;

    select count(*) into active_count from enrollments
      where course_id = new.course_id and status = 'active';

    if active_count >= c.min_students then
      course_title := coalesce(c.title->>'id', c.title->>'en', 'Kelas ini');

      for t in
        select ct.teacher_id from course_teachers ct where ct.course_id = new.course_id
      loop
        select user_id into teacher_uid from teachers where id = t.teacher_id;
        if teacher_uid is null then
          continue;
        end if;

        if not exists (
          select 1 from notifications
          where user_id = teacher_uid
            and type = 'info'
            and title = 'Kelas siap dimulai!'
            and link = '/teacher/kelas?course_id=' || new.course_id
        ) then
          insert into notifications (user_id, type, title, body, link, is_read, created_at)
          values (
            teacher_uid,
            'info',
            'Kelas siap dimulai!',
            '"' || course_title || '" sudah diikuti ' || active_count ||
              ' siswa dari minimal ' || c.min_students ||
              '. Kamu sudah boleh menjadwalkan pertemuan pertama kelas ini.',
            '/teacher/kelas?course_id=' || new.course_id,
            false,
            now()
          );
        end if;
      end loop;
    end if;
  end if;
  return new;
end;
$$;

create trigger trg_notify_teachers_class_ready
after insert or update of status on enrollments
for each row
execute function notify_teachers_class_ready();