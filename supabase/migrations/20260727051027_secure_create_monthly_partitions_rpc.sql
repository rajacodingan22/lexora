-- Revoke execute from anon and authenticated for create_monthly_partitions
REVOKE EXECUTE ON FUNCTION public.create_monthly_partitions() FROM anon, authenticated;

-- Switch to SECURITY INVOKER so it uses the caller's permissions, not the definer's
-- This prevents privilege escalation through this function
ALTER FUNCTION public.create_monthly_partitions() SECURITY INVOKER;