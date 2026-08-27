-- ============================================================
-- Guard: sesi Zoom & tugas hanya boleh berada dalam rentang
-- kelas. Jendela = rentang batch non-completed (mulai..selesai);
-- jika tidak ada batch, fallback ke rentang course.
-- Admin bebas. Update yang tidak mengubah tanggal dibiarkan.
-- ============================================================

create or replace function public.course_active_window(p_course_id uuid)
returns record
language sql
stable
as $$
  select
    coalesce(
      (select min(b.start_date) from public.batches b
        where b.course_id = p_course_id and b.status <> 'completed'),
      c.starts_at
    ) as window_start,
    coalesce(
      (select max(b.end_date) from public.batches b
        where b.course_id = p_course_id and b.status <> 'completed'),
      c.ends_at
    ) as window_end
  from public.courses c
  where c.id = p_course_id
$$;

create or replace function public.guard_live_sessions_window()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_window record;
begin
  if public.is_admin() then
    return new;
  end if;

  if new.starts_at is not null then
    select * into v_window
    from public.course_active_window(new.course_id) as (window_start timestamptz, window_end timestamptz);

    if v_window.window_start is not null and new.starts_at < v_window.window_start - interval '3 days' then
      raise exception 'Sesi tidak boleh dibuat sebelum kelas dimulai (%s)', to_char(v_window.window_start, 'YYYY-MM-DD HH24:MI');
    end if;
    if v_window.window_end is not null and new.starts_at > v_window.window_end + interval '3 days' then
      raise exception 'Sesi tidak boleh dibuat setelah kelas berakhir (%s)', to_char(v_window.window_end, 'YYYY-MM-DD HH24:MI');
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_live_sessions_window on public.live_sessions;
create trigger trg_live_sessions_window
before insert or update on public.live_sessions
for each row execute function public.guard_live_sessions_window();

create or replace function public.guard_assignments_window()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_window record;
begin
  if public.is_admin() then
    return new;
  end if;

  if new.due_date is not null then
    select * into v_window
    from public.course_active_window(new.course_id) as (window_start timestamptz, window_end timestamptz);

    if v_window.window_end is not null and new.due_date > v_window.window_end + interval '3 days' then
      raise exception 'Tugas tidak boleh berakhir setelah kelas selesai (%s)', to_char(v_window.window_end, 'YYYY-MM-DD HH24:MI');
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_assignments_window on public.assignments;
create trigger trg_assignments_window
before insert or update on public.assignments
for each row execute function public.guard_assignments_window();

-- ============================================================
-- Bersihkan sesi anomali (dibuat di luar jadwal kelas):
--   - Week 1 meeting (TOEFL, 8 Agu, kelas batch mulai 9 Agu)
--   - Review class (Business English, 4 Agu, batch mulai 5 Sep)
-- ============================================================
delete from public.attendance where session_id = 'bbd049f9-e63e-4d69-b074-6a1180c495ab';
delete from public.live_sessions where id in (
  'bbd049f9-e63e-4d69-b074-6a1180c495ab',
  'c1653d07-665d-4ca3-9e79-127d88444a7f'
);