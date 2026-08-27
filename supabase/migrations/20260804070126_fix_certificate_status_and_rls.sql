alter table public.certificates
  drop constraint certificates_status_check,
  add constraint certificates_status_check
    check (status = any (array['pending', 'issued', 'revoked', 'generated']));

create or replace function public.auto_generate_certificate()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_course_id uuid;
  v_user_id uuid;
  v_cert_code text;
  v_existing int;
  v_lang_code text;
begin
  if new.is_passing = true and (old.is_passing is null or old.is_passing = false) then
    select e.course_id, e.user_id into v_course_id, v_user_id
    from enrollments e where e.id = new.enrollment_id;

    select count(*) into v_existing
    from certificates
    where enrollment_id = new.enrollment_id;

    if v_existing = 0 then
      v_cert_code := 'EDU-' || upper(substring(md5(new.id::text || now()::text) from 1 for 8));

      select c.language_code into v_lang_code
      from courses c where c.id = v_course_id;

      insert into certificates (enrollment_id, user_id, course_id, language_code, certificate_code, status, final_grade, issue_date)
      values (new.enrollment_id, v_user_id, v_course_id, v_lang_code, v_cert_code, 'generated', new.weighted_total, current_date);
    end if;
  end if;

  return new;
end;
$function$;

create policy certs_insert_student on public.certificates
  for insert to authenticated
  with check (auth.uid() = user_id and source = 'generated');