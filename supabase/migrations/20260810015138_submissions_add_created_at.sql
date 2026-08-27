-- Tambahkan created_at ke submissions (mengikuti konvensi tabel lain)
-- Backfill dari submitted_at agar riwayat lama tetap berurutan
alter table public.submissions
  add column if not exists created_at timestamptz not null default now();

update public.submissions
  set created_at = submitted_at
  where created_at = now() and submitted_at is not null;