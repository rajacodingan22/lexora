-- Koreksi: kembalikan AI ke Gemini (model+endpoint non-rahasia).
-- ai_api_key TIDAK disimpan di sini (rahasia, hanya di DB remote via dashboard/API).
insert into public.system_settings (key, value) values
  ('ai_model', '"gemini-2.5-flash"'::jsonb),
  ('ai_api_endpoint', '"https://generativelanguage.googleapis.com/v1beta/openai/chat/completions"'::jsonb)
on conflict (key) do update set value = excluded.value;
