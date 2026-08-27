CREATE POLICY "programs_insert_admin" ON programs FOR INSERT WITH CHECK (is_admin());
CREATE POLICY "programs_update_admin" ON programs FOR UPDATE USING (is_admin()) WITH CHECK (is_admin());
CREATE POLICY "programs_delete_admin" ON programs FOR DELETE USING (is_admin());