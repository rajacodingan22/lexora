-- update the trigger function to set status based on role
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
    CASE
      WHEN COALESCE(NEW.raw_user_meta_data ->> 'role', 'student') = 'admin' THEN 'active'
      WHEN COALESCE(NEW.raw_user_meta_data ->> 'role', 'student') = 'teacher' THEN 'pending_profile'
      ELSE 'pending_placement'
    END,
    NEW.created_at,
    NEW.created_at
  );
  RETURN NEW;
END;
$$;

-- backfill existing users: set pending status for those without teachers record
UPDATE public.users
SET status = 'active'
WHERE status IS NULL OR status = '';
