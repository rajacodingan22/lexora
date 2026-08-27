-- Tighten system_settings: ai_api_key should be admin/service_role only (api now uses admin client)
-- Previously settings_read_authenticated allowed ai_api_key to any authenticated user (leak via direct supabase query)
drop policy if exists "settings_read_authenticated" on public.system_settings;

create policy "settings_read_authenticated" on public.system_settings
for select to authenticated
using (
  key not in ('ai_api_key','smtp_password','smtp_user','smtp_host','smtp_port','smtp_from_email','smtp_from_name')
  and key not like '%secret%'
  and key not like '%private%'
);

-- settings_read_admin already allows is_admin() to read all, service_role bypasses RLS
-- Verified: src/app/api/ai/grade/route.ts now uses createAdminSupabaseClient for ai_api_key
