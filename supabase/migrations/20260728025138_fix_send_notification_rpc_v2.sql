-- Drop and recreate send_notification with ownership check
DROP FUNCTION IF EXISTS public.send_notification(uuid, text, text, text, text);

CREATE FUNCTION public.send_notification(
  p_user_id uuid,
  p_type text,
  p_title text,
  p_body text,
  p_link text DEFAULT NULL::text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = 'public'
AS $$
BEGIN
  IF auth.uid() != p_user_id AND NOT is_admin() THEN
    RAISE EXCEPTION 'Not authorized to send notification for this user';
  END IF;
  INSERT INTO notifications (user_id, type, title, body, link)
  VALUES (p_user_id, p_type, p_title, p_body, p_link);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.send_notification FROM anon, public;
GRANT EXECUTE ON FUNCTION public.send_notification TO authenticated;
