-- Revoke EXECUTE from PUBLIC for all internal/trigger functions
-- (Supabase grants EXECUTE to PUBLIC by default, which overrides role-level revocations)

REVOKE EXECUTE ON FUNCTION public.auto_generate_certificate() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.calculate_grade(p_enrollment_id UUID) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.is_admin() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.rls_auto_enable() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.trigger_calculate_grade() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.update_timestamp() FROM PUBLIC;

-- is_admin() is used by RLS policies throughout the database.
-- RLS policies execute in the context of the current user, so authenticated users
-- need EXECUTE privilege. The function itself is SECURITY DEFINER so it safely
-- checks the users table with the owner's privileges.
GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated;

-- calculate_grade() is SECURITY DEFINER and called by triggers.
-- It should not be directly callable via REST API by any user.
-- (No GRANT needed)

-- handle_new_user() is a trigger function called by auth.on_user_created.
-- It should not be directly callable via REST API.
-- (No GRANT needed)

-- rls_auto_enable() is an event trigger for DDL.
-- It should not be directly callable via REST API.
-- (No GRANT needed)

-- auto_generate_certificate() is a trigger function.
-- Switched to SECURITY INVOKER; only accessible through triggers.
-- (No GRANT needed)

-- trigger_calculate_grade() is a trigger function.
-- Switched to SECURITY INVOKER; only accessible through triggers.
-- (No GRANT needed)

-- update_timestamp() is a trigger function.
-- Switched to SECURITY INVOKER; only accessible through triggers.
-- (No GRANT needed)
