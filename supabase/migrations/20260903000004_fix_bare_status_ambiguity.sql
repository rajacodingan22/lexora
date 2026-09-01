-- Fix ALL trigger functions with bare 'status' references that could be ambiguous
-- The core issue: PL/pgSQL variable 'new.status' can shadow column name 'status'
-- Solution: qualify ALL column references with explicit table aliases

-- 1. notify_teachers_class_ready: bare 'status' in SELECT FROM enrollments
CREATE OR REPLACE FUNCTION public.notify_teachers_class_ready()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
declare
  c record;
  active_count int;
  t record;
  course_title text;
  teacher_uid uuid;
  v_params jsonb;
begin
  if new.status = 'active' then
    select min_students, title into c from courses where id = new.course_id;
    if c is null or c.min_students is null or c.min_students <= 0 then
      return new;
    end if;

    select count(*) into active_count from enrollments e
      where e.course_id = new.course_id and e.status = 'active';

    if active_count >= c.min_students then
      course_title := coalesce(c.title->>'id', c.title->>'en', 'Kelas ini');
      v_params := jsonb_build_object('course', course_title, 'count', active_count, 'min', c.min_students);

      for t in
        select ct.teacher_id from course_teachers ct where ct.course_id = new.course_id
      loop
        select user_id into teacher_uid from teachers th where th.id = t.teacher_id;
        if teacher_uid is null then
          continue;
        end if;

        if not exists (
          select 1 from notifications n
          where n.user_id = teacher_uid
            and n.type = 'info'
            and n.template_key = 'teacherClassReady'
            and n.link = '/teacher/kelas?course_id=' || new.course_id
        ) then
          insert into notifications (user_id, type, template_key, params, link, is_read, created_at)
          values (
            teacher_uid,
            'info',
            'teacherClassReady',
            v_params,
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

-- 2. notify_batch_needs_teacher: bare 'status' in SELECT FROM users
CREATE OR REPLACE FUNCTION public.notify_batch_needs_teacher()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
declare
  v_course_title text;
begin
  if new.teacher_id is null then
    select coalesce(c.title->>'id', c.title->>'en', 'Kelas') into v_course_title
    from public.courses c
    where c.id = new.course_id;

    insert into public.notifications (user_id, type, title, body, link, is_read)
    select u.id, 'info',
      'Batch baru perlu guru',
      'Batch "' || coalesce(new.name, '') || '" untuk "' || coalesce(v_course_title, 'Kelas') || '" belum punya guru. Segera isi guru di halaman Batch.',
      '/admin/batch',
      false
    from public.users u
    where u.role = 'admin' and u.status = 'active';
  end if;
  return new;
end;
$$;

-- 3. sync_batch_current_students: already qualified but ensure alias consistency
CREATE OR REPLACE FUNCTION public.sync_batch_current_students()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  target_batch uuid;
BEGIN
  IF TG_OP = 'INSERT' THEN
    target_batch := NEW.batch_id;
  ELSIF TG_OP = 'DELETE' THEN
    target_batch := OLD.batch_id;
  ELSE
    target_batch := COALESCE(NEW.batch_id, OLD.batch_id);
  END IF;

  IF target_batch IS NOT NULL THEN
    UPDATE batches b
    SET current_students = (
      SELECT count(*) FROM enrollments e
      WHERE e.batch_id = b.id AND e.status = 'active'
    )
    WHERE b.id = target_batch;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

-- 4. sync_batch_student_counts: already qualified
CREATE OR REPLACE FUNCTION public.sync_batch_student_counts()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
declare
  v_batch_id uuid;
begin
  v_batch_id := coalesce(new.batch_id, old.batch_id);

  update public.batches b
  set current_students = (
    select count(*)::int
    from public.enrollments e
    where e.batch_id = b.id
      and e.status in ('active', 'pending', 'pending_payment')
  )
  where b.id = v_batch_id;

  return coalesce(new, old);
end;
$$;
