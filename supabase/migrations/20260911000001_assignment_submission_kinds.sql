-- Bentuk pengumpulan tugas: file / video (Drive siswa) / teks langsung,
-- file titipan 48 jam untuk siswa tanpa Drive, galeri se-batch, eskalasi ke guru+admin.

-- 1. Kolom baru assignments
alter table public.assignments
  add column if not exists submission_kind text not null default 'file'
    check (submission_kind in ('file', 'video', 'text_inline')),
  add column if not exists allowed_file_types text[] not null default '{pdf}';

-- 2. Kolom baru submissions
alter table public.submissions
  add column if not exists answer_text text,
  add column if not exists drive_file_id text,
  add column if not exists drive_link text,
  add column if not exists file_name text,
  add column if not exists storage_kind text not null default 'temp'
    check (storage_kind in ('drive', 'temp')),
  add column if not exists expires_at timestamptz,
  add column if not exists purged_at timestamptz,
  add column if not exists reminded_at timestamptz;

-- Data lama: file yang sudah ada di bucket dianggap titipan yang dikecualikan purge
-- (expires_at NULL = tidak pernah di-purge otomatis).
-- Upload baru tanpa Drive wajib mengisi expires_at via trigger di bawah.

-- 3. Trigger: set expires_at = submitted_at + 48 jam untuk file titipan baru
create or replace function public.set_submission_expiry()
returns trigger
language plpgsql
as $function$
begin
  if NEW.storage_kind = 'temp'
     and NEW.file_url is not null
     and NEW.expires_at is null then
    NEW.expires_at := coalesce(NEW.submitted_at, now()) + interval '48 hours';
  end if;
  return NEW;
end;
$function$;

drop trigger if exists trg_set_submission_expiry on public.submissions;
create trigger trg_set_submission_expiry
  before insert or update of file_url, storage_kind on public.submissions
  for each row execute function public.set_submission_expiry();

-- 4. RLS: baca milik sendiri + galeri teman se-batch (nilai disembunyikan di aplikasi)
drop policy if exists submissions_read_own_and_batchmates on public.submissions;
create policy submissions_read_own_and_batchmates on public.submissions
  for select
  to authenticated
  using (
    user_id = (select auth.uid())
    or exists (
      select 1
      from public.assignments a
      join public.enrollments e_me
        on e_me.course_id = a.course_id
       and e_me.user_id = (select auth.uid())
       and e_me.status = 'active'
      join public.enrollments e_them
        on e_them.course_id = a.course_id
       and e_them.user_id = submissions.user_id
       and e_them.status = 'active'
      where a.id = submissions.assignment_id
        and e_me.batch_id is not null
        and e_me.batch_id = e_them.batch_id
    )
  );

-- 5. Eskalasi: file titipan kedaluwarsa tapi belum dinilai -> notif harian ke guru + admin
create or replace function public.notify_temp_file_expiry()
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  r record;
  teacher_rec record;
  admin_rec record;
begin
  for r in
    select s.id as submission_id, s.assignment_id, s.user_id,
           a.course_id, a.title as assignment_title,
           c.title as course_title, u.display_name as student_name
    from public.submissions s
    join public.assignments a on a.id = s.assignment_id
    join public.courses c on c.id = a.course_id
    join public.users u on u.id = s.user_id
    where s.storage_kind = 'temp'
      and s.purged_at is null
      and s.file_url is not null
      and s.expires_at is not null
      and s.expires_at < now()
      and s.grade is null
      and (s.reminded_at is null or s.reminded_at < now() - interval '24 hours')
  loop
    -- guru pengampu course
    for teacher_rec in
      select tu.id as user_id
      from public.course_teachers ct
      join public.teachers t on t.id = ct.teacher_id
      join public.users tu on tu.id = t.user_id
      where ct.course_id = r.course_id
    loop
      insert into public.notifications (user_id, type, title, body, link, template_key, params)
      values (
        teacher_rec.user_id,
        'warning',
        'File titipan kedaluwarsa belum dinilai',
        format('Submission "%s" milik %s untuk "%s" sudah lewat 48 jam dan belum dinilai. File ditahan sampai ada nilai.',
               r.assignment_title, coalesce(r.student_name, 'siswa'), coalesce(r.course_title->>'id', r.course_title->>'en', 'kelas')),
        '/teacher/penugasan',
        'tempFileExpiryTeacher',
        jsonb_build_object('assignmentId', r.assignment_id::text, 'submissionId', r.submission_id::text, 'courseId', r.course_id::text)
      );
    end loop;

    -- admin
    for admin_rec in
      select id as user_id from public.users where role = 'admin'
    loop
      insert into public.notifications (user_id, type, title, body, link, template_key, params)
      values (
        admin_rec.user_id,
        'warning',
        'File titipan kedaluwarsa belum dinilai',
        format('Submission "%s" milik %s sudah lewat 48 jam dan belum dinilai.',
               r.assignment_title, coalesce(r.student_name, 'siswa')),
        '/admin/penugasan',
        'tempFileExpiryAdmin',
        jsonb_build_object('assignmentId', r.assignment_id::text, 'submissionId', r.submission_id::text, 'courseId', r.course_id::text)
      );
    end loop;

    update public.submissions set reminded_at = now() where id = r.submission_id;
  end loop;
end;
$function$;

revoke execute on function public.notify_temp_file_expiry() from public, anon, authenticated;
grant execute on function public.notify_temp_file_expiry() to service_role;

select cron.schedule(
  'temp-file-expiry-reminder',
  '0 * * * *',
  'select public.notify_temp_file_expiry()'
) where not exists (select 1 from cron.job where jobname = 'temp-file-expiry-reminder');

-- 6. Index pendukung galeri + purge
create index if not exists idx_submissions_assignment_user on public.submissions(assignment_id, user_id);
create index if not exists idx_submissions_expiry on public.submissions(expires_at)
  where storage_kind = 'temp' and purged_at is null;
