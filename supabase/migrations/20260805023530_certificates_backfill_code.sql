update public.certificates
set certificate_code = 'EL-' || to_char(now(), 'YYYYMMDD') || '-' || upper(substr(md5(random()::text), 1, 6))
where certificate_code is null;