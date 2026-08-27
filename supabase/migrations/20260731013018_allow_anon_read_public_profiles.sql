DROP POLICY IF EXISTS "users_read_public_profiles" ON public.users;

CREATE POLICY "users_read_public_profiles"
  ON public.users FOR SELECT
  TO public
  USING (true);