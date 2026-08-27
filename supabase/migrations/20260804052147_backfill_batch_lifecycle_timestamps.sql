update batches
set started_at = start_date
where status = 'active' and started_at is null and start_date is not null and start_date <= now();

update batches
set completed_at = end_date
where status = 'completed' and completed_at is null and end_date is not null and end_date <= now();