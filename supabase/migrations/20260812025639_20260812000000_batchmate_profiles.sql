create or replace view public.batchmate_profiles
with (security_barrier = true) as
select
  u.id,
  u.display_name,
  u.photo_url,
  u.bio,
  u.country,
  u.preferred_language,
  u.role,
  u.status
from public.users u
where exists (
  select 1
  from public.enrollments e1
  join public.batches b on b.id = e1.batch_id
    and b.status in ('active', 'upcoming')
  join public.enrollments e2 on e2.batch_id = e1.batch_id
  where e1.user_id = auth.uid()
    and e1.status = 'active'
    and e2.user_id = u.id
    and e2.status = 'active'
);

create or replace view public.batchmate_certificates
with (security_barrier = true) as
select
  c.id,
  c.user_id,
  c.course_id,
  c.certificate_code,
  c.issue_date,
  c.pdf_url,
  c.language_code,
  c.status,
  ct.title as course_title
from public.certificates c
join public.courses ct on ct.id = c.course_id
where c.status in ('issued', 'generated')
  and exists (
    select 1
    from public.enrollments e1
    join public.batches b on b.id = e1.batch_id
      and b.status in ('active', 'upcoming')
    join public.enrollments e2 on e2.batch_id = e1.batch_id
    where e1.user_id = auth.uid()
      and e1.status = 'active'
      and e2.user_id = c.user_id
      and e2.status = 'active'
  );

revoke all on public.batchmate_profiles, public.batchmate_certificates from public, anon;
grant select on public.batchmate_profiles, public.batchmate_certificates to authenticated;