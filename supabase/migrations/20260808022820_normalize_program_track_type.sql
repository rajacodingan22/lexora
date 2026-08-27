-- Normalize program track_type & drop program_type duality

-- 1. Backfill: track_type dari program_type untuk row yang masih null
update public.programs
set track_type = program_type
where track_type is null and program_type is not null;

-- 2. Normalize nilai yang tidak valid
update public.programs
set track_type = 'regular'
where track_type not in ('fast_track', 'regular', 'intensive');

-- 4. Pastikan courses.track_type konsisten dengan program-nya
update public.courses c
set track_type = p.track_type
from public.programs p
where c.program_id = p.id
  and c.track_type is null
  and p.track_type is not null;