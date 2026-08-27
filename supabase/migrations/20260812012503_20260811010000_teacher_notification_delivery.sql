-- Prevent repeated public signup notifications from sending duplicate SMTP mail.
alter table public.teacher_applications
  add column if not exists teacher_notification_sent_at timestamptz;

create index if not exists idx_teacher_apps_notification_sent
  on public.teacher_applications (teacher_notification_sent_at)
  where teacher_notification_sent_at is null;