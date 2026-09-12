-- Multi-guru per batch: junction batch_teachers menggantikan batches.teacher_id tunggal.
-- Student tetap tanpa wali; notifikasi guru tetap ke semua guru course (keputusan produk).

create table if not exists public.batch_teachers (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references public.batches(id) on delete cascade,
  teacher_id uuid not null references public.teachers(id) on delete cascade,
  created_at timestamptz default now(),
  unique(batch_id, teacher_id)
);
create index if not exists idx_batch_teachers_batch on public.batch_teachers(batch_id);
create index if not exists idx_batch_teachers_teacher on public.batch_teachers(teacher_id);

-- backfill dari kolom tunggal yang lama
insert into public.batch_teachers (batch_id, teacher_id)
  select id, teacher_id from public.batches where teacher_id is not null
  on conflict (batch_id, teacher_id) do nothing;

alter table public.batch_teachers enable row level security;

drop policy if exists batch_teachers_admin_all on public.batch_teachers;
create policy batch_teachers_admin_all on public.batch_teachers
  for all
  to authenticated
  using (is_admin())
  with check (is_admin());

drop policy if exists batch_teachers_read_own on public.batch_teachers;
create policy batch_teachers_read_own on public.batch_teachers
  for select
  to authenticated
  using (teacher_id in (select id from public.teachers where user_id = (select auth.uid())));

-- notify_batch_behind_schedule: kirim ke tim batch (fallback ke guru course bila tim kosong)
create or replace function public.notify_batch_behind_schedule()
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  r record;
  v_progress record;
  v_course_title text;
  v_teacher_uid record;
begin
  for r in
    select b.id, b.course_id, b.name, b.meetings_per_week,
           c.title as course_title, c.meeting_count
    from batches b
    join courses c on c.id = b.course_id
    where b.status = 'active'
      and b.end_date is not null
      and b.end_date > now()
      and b.end_date <= now() + interval '7 days'
  loop
    select * from get_batch_meeting_progress(r.id) into v_progress;
    if v_progress.sessions_remaining > 0 and not v_progress.is_on_track then
      v_course_title := coalesce(r.course_title ->> 'en', r.course_title ->> 'id', 'Course');
      for v_teacher_uid in
        select distinct t.user_id
        from teachers t
        where t.id in (select bt.teacher_id from batch_teachers bt where bt.batch_id = r.id)
           or (
             not exists (select 1 from batch_teachers bt where bt.batch_id = r.id)
             and t.id in (select ct.teacher_id from course_teachers ct where ct.course_id = r.course_id)
           )
      loop
        insert into notifications (user_id, type, title, body, link, is_read, template_key, params)
        values (
          v_teacher_uid.user_id, 'warning',
          'Batch Behind Schedule!',
          'Batch "' || r.name || '" for "' || v_course_title || '" has ' ||
          v_progress.sessions_remaining || ' sessions remaining of ' || r.meeting_count ||
          ' meetings, but only ' || round(v_progress.weeks_remaining, 0) ||
          ' days left. Schedule ' || ceil(v_progress.sessions_remaining::numeric / nullif(v_progress.weeks_remaining,0)) ||
          ' sessions per day to catch up!',
          '/teacher/kelas?course_id=' || r.course_id || '&batchId=' || r.id,
          false,
          'batchBehind',
          jsonb_build_object('batch', r.name, 'course', v_course_title, 'batchId', r.id::text, 'courseId', r.course_id::text)
        );
      end loop;
    end if;
  end loop;
end;
$function$;

revoke execute on function public.notify_batch_behind_schedule() from public, anon, authenticated;
grant execute on function public.notify_batch_behind_schedule() to service_role;

-- kolom tunggal tidak dipakai lagi (pembaca sudah pindah ke junction)
alter table public.batches drop column if exists teacher_id;
