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

    -- Sesi tidak boleh dibuat sebelum kelas dimulai (tanpa buffer),
    -- dan tidak lebih dari 3 hari setelah kelas berakhir.
    if v_window.window_start is not null and new.starts_at < v_window.window_start then
      raise exception 'Sesi tidak boleh dibuat sebelum kelas dimulai (%s)', to_char(v_window.window_start, 'YYYY-MM-DD HH24:MI');
    end if;
    if v_window.window_end is not null and new.starts_at > v_window.window_end + interval '3 days' then
      raise exception 'Sesi tidak boleh dibuat setelah kelas berakhir (%s)', to_char(v_window.window_end, 'YYYY-MM-DD HH24:MI');
    end if;
  end if;

  return new;
end;
$$;