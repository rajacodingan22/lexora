-- Per batch pasti link baru — wajib & unique, backfill existing nulls/placeholder dup
update public.batches set zoom_link = 'https://zoom.us/j/' || replace(id::text,'-','') where zoom_link is null or zoom_link = '' or zoom_link = 'https://zoom.us/j/e000000000';

-- Make NOT NULL after backfill
alter table public.batches alter column zoom_link set not null;

-- Unique per link (prevent reuse)
create unique index if not exists batches_zoom_link_unique on public.batches(zoom_link);

-- Ensure check for https
do $$ begin
  if not exists (select 1 from pg_constraint where conname='batches_zoom_link_check') then
    alter table public.batches add constraint batches_zoom_link_check check (zoom_link ~ '^https://');
  end if;
end $$;
