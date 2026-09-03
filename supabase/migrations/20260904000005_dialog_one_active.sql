-- R6: max 1 active dialog session per (user, batch, task).
-- Cleanup legacy duplicates first (keep latest, mark rest abandoned),
-- then enforce with a partial unique index so concurrent starts can't race.

update public.dialog_sessions s
set status = 'abandoned'
where s.status = 'active'
  and exists (
    select 1 from public.dialog_sessions s2
    where s2.status = 'active'
      and s2.user_id = s.user_id
      and s2.batch_id = s.batch_id
      and s2.task_id = s.task_id
      and s2.created_at > s.created_at
  );

create unique index if not exists dialog_sessions_one_active
  on public.dialog_sessions (user_id, batch_id, task_id)
  where status = 'active';
