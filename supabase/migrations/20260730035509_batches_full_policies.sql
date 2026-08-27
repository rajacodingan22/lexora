DROP POLICY IF EXISTS "batches_read" ON batches;
CREATE POLICY "batches_read_all" ON batches FOR SELECT USING (true);
CREATE POLICY "batches_insert_admin" ON batches FOR INSERT WITH CHECK (is_admin());
CREATE POLICY "batches_update_admin" ON batches FOR UPDATE USING (is_admin()) WITH CHECK (is_admin());
CREATE POLICY "batches_delete_admin" ON batches FOR DELETE USING (is_admin());