CREATE OR REPLACE FUNCTION public.log_insert_context() RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE LOG 'STORAGE_INSERT ctx: user=% role=% jwt_sub=% jwt_claims=% uid=% bucket=%',
    current_user,
    current_setting('role', true),
    current_setting('request.jwt.claim.sub', true),
    current_setting('request.jwt.claims', true),
    auth.uid(),
    NEW.bucket_id;
  RETURN NEW;
END;
$$;

GRANT EXECUTE ON FUNCTION public.log_insert_context() TO supabase_storage_admin;

DROP TRIGGER IF EXISTS trg_log_insert_ctx ON storage.objects;
CREATE TRIGGER trg_log_insert_ctx
BEFORE INSERT ON storage.objects
FOR EACH ROW EXECUTE FUNCTION public.log_insert_context();