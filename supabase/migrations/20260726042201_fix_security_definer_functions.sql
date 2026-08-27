-- Revoke EXECUTE on SECURITY DEFINER functions from anon and authenticated
-- These should only be callable internally (by triggers or RLS policies)

REVOKE EXECUTE ON FUNCTION public.auto_generate_certificate() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.calculate_grade(p_enrollment_id UUID) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.is_admin() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.rls_auto_enable() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.trigger_calculate_grade() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.update_timestamp() FROM anon, authenticated;

-- Switch SECURITY DEFINER to SECURITY INVOKER where safe
ALTER FUNCTION public.auto_generate_certificate() SECURITY INVOKER;
ALTER FUNCTION public.trigger_calculate_grade() SECURITY INVOKER;
ALTER FUNCTION public.update_timestamp() SECURITY INVOKER;
-- Keep is_admin() as SECURITY DEFINER (needed for RLS policies to avoid recursion)
-- Keep calculate_grade() as SECURITY DEFINER (needs to read all data)
-- Keep handle_new_user() as SECURITY DEFINER (trigger function)
