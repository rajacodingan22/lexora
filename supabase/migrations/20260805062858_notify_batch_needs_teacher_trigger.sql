create or replace function public.notify_batch_needs_teacher()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_course_title text;
begin
  if new.teacher_id is null then
    select coalesce(c.title->>'id', c.title->>'en', 'Kelas') into v_course_title
    from public.courses c
    where c.id = new.course_id;

    insert into public.notifications (user_id, type, title, body, link, is_read)
    select id, 'info',
      'Batch baru perlu guru',
      'Batch "' || coalesce(new.name, '') || '" untuk "' || coalesce(v_course_title, 'Kelas') || '" belum punya guru. Segera isi guru di halaman Batch.',
      '/admin/batch',
      false
    from public.users
    where role = 'admin' and status = 'active';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_notify_batch_needs_teacher on public.batches;

create trigger trg_notify_batch_needs_teacher
after insert on public.batches
for each row execute function public.notify_batch_needs_teacher();