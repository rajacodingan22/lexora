-- Harden system_settings SELECT: previously public USING true leaked secrets (smtp_password, ai_api_key)
drop policy if exists "settings_read" on public.system_settings;

-- Public (anon) can read only non-sensitive keys
create policy "settings_read_public" on public.system_settings
for select to public
using (
  key not in ('ai_api_key','smtp_password','smtp_user','smtp_host','smtp_port','smtp_from_email','smtp_from_name')
  and key not like '%secret%'
  and key not like '%private%'
  and key not like 'service_%'
);

-- Authenticated can read non-sensitive plus ai config needed for grading (but not smtp secrets)
create policy "settings_read_authenticated" on public.system_settings
for select to authenticated
using (
  key not in ('smtp_password','smtp_user','smtp_host','smtp_port','smtp_from_email','smtp_from_name')
);

-- Admin and service_role can read all (service_role bypasses RLS anyway, but explicit for clarity)
create policy "settings_read_admin" on public.system_settings
for select to authenticated
using (is_admin());

-- Ensure RLS still enabled and ensure no duplicate
-- Note: service_role bypasses RLS by default, so api routes using createAdminSupabaseClient will always read secrets
