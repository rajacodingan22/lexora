-- Self-healing: recompute batches.current_students from active enrollments
CREATE OR REPLACE FUNCTION sync_batch_current_students()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  target_batch uuid;
BEGIN
  IF TG_OP = 'INSERT' THEN
    target_batch := NEW.batch_id;
  ELSIF TG_OP = 'DELETE' THEN
    target_batch := OLD.batch_id;
  ELSE
    target_batch := COALESCE(NEW.batch_id, OLD.batch_id);
  END IF;

  IF target_batch IS NOT NULL THEN
    UPDATE batches b
    SET current_students = (
      SELECT count(*) FROM enrollments e
      WHERE e.batch_id = b.id AND e.status = 'active'
    )
    WHERE b.id = target_batch;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_batch_current_students ON enrollments;
CREATE TRIGGER trg_sync_batch_current_students
AFTER INSERT OR UPDATE OR DELETE ON enrollments
FOR EACH ROW EXECUTE FUNCTION sync_batch_current_students();

-- Backfill current state
UPDATE batches b
SET current_students = (
  SELECT count(*) FROM enrollments e
  WHERE e.batch_id = b.id AND e.status = 'active'
);

-- Publish batches for realtime (slot updates)
ALTER PUBLICATION supabase_realtime ADD TABLE batches;