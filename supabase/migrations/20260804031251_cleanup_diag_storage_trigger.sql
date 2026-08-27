DROP TRIGGER IF EXISTS trg_log_insert_ctx ON storage.objects;
DROP FUNCTION IF EXISTS public.log_insert_context();