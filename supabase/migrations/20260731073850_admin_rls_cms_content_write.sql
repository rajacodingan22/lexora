create policy "news_admin_insert" on news for insert to public with check (is_admin());
create policy "news_admin_update" on news for update to public using (is_admin()) with check (is_admin());
create policy "news_admin_delete" on news for delete to public using (is_admin());

create policy "cms_admin_insert" on cms_content for insert to public with check (is_admin());
create policy "cms_admin_update" on cms_content for update to public using (is_admin()) with check (is_admin());
create policy "cms_admin_delete" on cms_content for delete to public using (is_admin());

create policy "placement_q_admin_insert" on placement_questions for insert to public with check (is_admin());
create policy "placement_q_admin_update" on placement_questions for update to public using (is_admin()) with check (is_admin());
create policy "placement_q_admin_delete" on placement_questions for delete to public using (is_admin());

create policy "placement_t_admin_insert" on placement_tests for insert to public with check (is_admin());
create policy "placement_t_admin_update" on placement_tests for update to public using (is_admin()) with check (is_admin());
create policy "placement_t_admin_delete" on placement_tests for delete to public using (is_admin());

create unique index if not exists cms_content_section_key on cms_content(section);

alter table placement_questions add column if not exists created_at timestamptz not null default now();