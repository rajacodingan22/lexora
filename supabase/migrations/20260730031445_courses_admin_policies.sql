DROP POLICY IF EXISTS "courses_insert_admin" ON courses;
CREATE POLICY "courses_insert_admin" ON courses FOR INSERT WITH CHECK (is_admin());
DROP POLICY IF EXISTS "courses_update_admin" ON courses;
CREATE POLICY "courses_update_admin" ON courses FOR UPDATE USING (is_admin()) WITH CHECK (is_admin());
DROP POLICY IF EXISTS "courses_delete_admin" ON courses;
CREATE POLICY "courses_delete_admin" ON courses FOR DELETE USING (is_admin());