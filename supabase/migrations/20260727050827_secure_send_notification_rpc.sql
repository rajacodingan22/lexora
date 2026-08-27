-- Revoke execute from anon and authenticated roles for send_notification
-- Only service_role should be able to call this
REVOKE EXECUTE ON FUNCTION public.send_notification(uuid, text, text, text, text) FROM anon, authenticated;

-- The API route uses supabase-js directly (service_role equivalent via server client),
-- so it doesn't need the RPC function at all. This prevents abuse via /rest/v1/rpc/send_notification