create or replace function public.class_lifecycle_check()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
  title text;
  body text;
begin
  -- 1. Reminder H-1: kelas upcoming akan segera dimulai (notif student + teacher)
  for r in
    select b.id, b.course_id, b.name, b.start_date, c.title as course_title
    from batches b
    join courses c on c.id = b.course_id
    where b.status = 'upcoming'
      and b.reminder_sent = false
      and b.start_date is not null
      and b.start_date > now()
      and b.start_date <= now() + interval '24 hours'
  loop
    title := 'Kelas akan segera dimulai';
    body := format('Kelas "%s" (%s) akan dimulai pada %s. Siap-siap belajar!',
      r.course_title, r.name, to_char(r.start_date at time zone 'Asia/Jakarta', 'DD-MM-YYYY HH24:MI'));
    insert into notifications (user_id, type, title, body, link)
    select e.user_id, 'info', title, body, '/student/kursus'
    from enrollments e
    where e.batch_id = r.id and e.status in ('active', 'pending');
    insert into notifications (user_id, type, title, body, link)
    select t.user_id, 'info', title, body, '/teacher/kelas'
    from course_teachers ct
    join teachers t on t.id = ct.teacher_id
    where ct.course_id = r.course_id;
    update batches set reminder_sent = true where id = r.id;
  end loop;

  -- 2. Transisi upcoming -> active (kelas dimulai)
  for r in
    select b.id, b.course_id, b.name, c.title as course_title
    from batches b
    join courses c on c.id = b.course_id
    where b.status = 'upcoming'
      and b.start_date is not null
      and b.start_date <= now()
  loop
    title := 'Kelas sudah dimulai';
    body := format('Kelas "%s" (%s) sudah dimulai. Selamat belajar!',
      r.course_title, r.name);
    insert into notifications (user_id, type, title, body, link)
    select e.user_id, 'info', title, body, '/student/kursus'
    from enrollments e
    where e.batch_id = r.id and e.status in ('active', 'pending');
    insert into notifications (user_id, type, title, body, link)
    select t.user_id, 'info', title, body, '/teacher/kelas'
    from course_teachers ct
    join teachers t on t.id = ct.teacher_id
    where ct.course_id = r.course_id;
    update batches set status = 'active', started_at = now() where id = r.id;
  end loop;

  -- 3. Transisi active -> completed (kelas selesai)
  for r in
    select b.id, b.course_id, b.name, c.title as course_title
    from batches b
    join courses c on c.id = b.course_id
    where b.status = 'active'
      and b.end_date is not null
      and b.end_date < now()
  loop
    title := 'Kelas selesai';
    body := format('Kelas "%s" (%s) telah selesai. Terima kasih sudah belajar bersama!',
      r.course_title, r.name);
    insert into notifications (user_id, type, title, body, link)
    select e.user_id, 'info', title, body, '/student/kursus'
    from enrollments e
    where e.batch_id = r.id and e.status in ('active', 'pending');
    insert into notifications (user_id, type, title, body, link)
    select t.user_id, 'info', title, body, '/teacher/kelas'
    from course_teachers ct
    join teachers t on t.id = ct.teacher_id
    where ct.course_id = r.course_id;
    update batches set status = 'completed', completed_at = now() where id = r.id;
  end loop;

  -- 4. Reminder link Zoom belum dibagikan (teacher)
  for r in
    select ls.id, ls.course_id, ls.title as session_title, ls.starts_at, c.title as course_title
    from live_sessions ls
    join courses c on c.id = ls.course_id
    where ls.zoom_reminder_sent = false
      and (ls.meeting_link is null or ls.meeting_link = '')
      and ls.starts_at is not null
      and ls.starts_at >= now() - interval '1 hour'
      and ls.starts_at <= now() + interval '24 hours'
  loop
    title := 'Link pertemuan belum dibagikan';
    body := format('Pertemuan "%s" (kelas "%s") pada %s belum memiliki link Zoom. Segera bagikan link agar siswa bisa bergabung.',
      r.session_title, r.course_title, to_char(r.starts_at at time zone 'Asia/Jakarta', 'DD-MM-YYYY HH24:MI'));
    insert into notifications (user_id, type, title, body, link)
    select t.user_id, 'meeting', title, body, '/teacher/pertemuan'
    from course_teachers ct
    join teachers t on t.id = ct.teacher_id
    where ct.course_id = r.course_id;
    update live_sessions set zoom_reminder_sent = true where id = r.id;
  end loop;
end;
$$;

select cron.schedule('class-lifecycle', '*/30 * * * *', 'select public.class_lifecycle_check()');