-- Switch dialog/AI grading model to muse-spark 1.3 (free contributor tier).
-- Mirrors remote system_settings change so local archive represents prod.
insert into public.system_settings (key, value)
values ('ai_model', '"muse-spark-1.3-contributor-free"'::jsonb)
on conflict (key) do update set value = excluded.value;
