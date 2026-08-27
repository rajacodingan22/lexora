-- auto-create public.users profile when a new auth.users row is created
CREATE OR REPLACE FUNCTION public.sync_auth_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.users (id, email, display_name, role, status, created_at, updated_at)
  VALUES (
    NEW.id,
    NEW.email,
    NEW.raw_user_meta_data ->> 'display_name',
    COALESCE(NEW.raw_user_meta_data ->> 'role', 'student'),
    'active',
    NEW.created_at,
    NEW.created_at
  );
  RETURN NEW;
END;
$$;

-- drop if already exists to avoid duplicate trigger
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_auth_user();

-- backfill: create profiles for existing auth users that don't have one
INSERT INTO public.users (id, email, display_name, role, status, created_at, updated_at)
SELECT
  au.id,
  au.email,
  au.raw_user_meta_data ->> 'display_name',
  COALESCE(au.raw_user_meta_data ->> 'role', 'student'),
  'active',
  au.created_at,
  au.created_at
FROM auth.users au
LEFT JOIN public.users pu ON pu.id = au.id
WHERE pu.id IS NULL;
