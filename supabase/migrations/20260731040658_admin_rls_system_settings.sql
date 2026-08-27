create policy "settings_admin_insert" on public.system_settings
  for insert to public with check (is_admin());

create policy "settings_admin_update" on public.system_settings
  for update to public using (is_admin()) with check (is_admin());

create policy "settings_admin_delete" on public.system_settings
  for delete to public using (is_admin());

delete from public.system_settings
where key in ('warung_name', 'theme', 'currency', 'language', 'low_stock_threshold',
              'notification_enabled', 'sounds_enabled', 'voice_enabled', 'backup_auto');