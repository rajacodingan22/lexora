alter table batches
  add column if not exists reminder_sent boolean not null default false,
  add column if not exists started_at timestamptz,
  add column if not exists completed_at timestamptz;

alter table live_sessions
  add column if not exists zoom_reminder_sent boolean not null default false;

-- Normalisasi status existing: batch 'active' yang belum mulai -> 'upcoming'.
-- Status 'completed'/'cancelled' manual TIDAK diturunkan ulang.
update batches set status = 'upcoming'
where status = 'active'
  and start_date is not null
  and start_date > now();