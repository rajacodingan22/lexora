-- P3: tie Zoom sessions to a specific batch (robust replacement for date-range filter)
-- live_sessions was course-level only, so student detail had to guess the batch
-- by start_date..end_date range (breaks when batches overlap).
-- This adds nullable batch_id; existing rows are backfilled to the batch whose
-- range contains starts_at (earliest batch wins). New rows should set batch_id.

alter table public.live_sessions
  add column if not exists batch_id uuid references public.batches(id) on delete set null;

create index if not exists live_sessions_batch_idx on public.live_sessions (batch_id);
create index if not exists live_sessions_course_start_idx on public.live_sessions (course_id, starts_at);

-- Backfill: assign each session to the earliest batch of the same course whose range contains it
update public.live_sessions ls
set batch_id = sub.id
from (
  select distinct on (ls2.id) ls2.id as sid, b.id
  from public.live_sessions ls2
  join public.batches b on b.course_id = ls2.course_id
  where ls2.batch_id is null
    and b.start_date is not null
    and ls2.starts_at >= b.start_date
    and (b.end_date is null or ls2.starts_at <= b.end_date)
  order by ls2.id, b.start_date asc nulls last
) sub
where ls.id = sub.sid;
