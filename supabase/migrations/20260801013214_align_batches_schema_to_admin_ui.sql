ALTER TABLE batches ALTER COLUMN code DROP NOT NULL;
ALTER TABLE batches RENAME COLUMN starts_at TO start_date;
ALTER TABLE batches RENAME COLUMN ends_at TO end_date;
ALTER TABLE batches RENAME COLUMN max_students TO capacity;
ALTER TABLE batches DROP CONSTRAINT batches_status_check;
ALTER TABLE batches ADD CONSTRAINT batches_status_check
  CHECK (status IN ('active', 'upcoming', 'completed', 'cancelled'));