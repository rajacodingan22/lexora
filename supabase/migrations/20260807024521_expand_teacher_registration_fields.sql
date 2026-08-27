create or replace function public.sync_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_teacher_data jsonb := new.raw_user_meta_data -> 'teacher_registration';
  v_is_teacher_applicant boolean := (v_teacher_data ->> 'enabled') = 'true';
  v_language_codes jsonb := '[]'::jsonb;
begin
  insert into public.users (id, email, display_name, role, status, created_at, updated_at)
  values (
    new.id,
    new.email,
    new.raw_user_meta_data ->> 'display_name',
    'student',
    'active',
    new.created_at,
    new.created_at
  );

  if v_is_teacher_applicant and jsonb_typeof(v_teacher_data) = 'object' then
    if nullif(trim(v_teacher_data ->> 'full_name'), '') is null
       or nullif(trim(v_teacher_data ->> 'birth_date'), '') is null
       or nullif(trim(v_teacher_data ->> 'phone_number'), '') is null
       or nullif(trim(coalesce(v_teacher_data ->> 'nationality', v_teacher_data ->> 'country')), '') is null
       or nullif(trim(v_teacher_data ->> 'gender'), '') is null
       or coalesce(v_teacher_data ->> 'email', '') !~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'
       or jsonb_typeof(v_teacher_data -> 'languages') <> 'array' then
      raise exception 'Invalid teacher registration details';
    end if;

    select coalesce(jsonb_agg(l.code order by l.sort_order), '[]'::jsonb)
    into v_language_codes
    from public.languages l
    where l.is_active = true
      and l.code in (select value from jsonb_array_elements_text(v_teacher_data -> 'languages'));

    if jsonb_array_length(v_language_codes) = 0 then
      raise exception 'At least one active teaching language is required';
    end if;

    insert into public.teacher_applications (
      user_id,
      full_name,
      birth_date,
      gender,
      nationality,
      phone_number,
      email,
      address,
      timezone,
      languages,
      levels,
      programs,
      highest_education,
      institution,
      major,
      graduation_year,
      has_teaching_exp,
      experience_years,
      experience_institution,
      experience_description,
      teaching_mode,
      session_duration,
      max_students_per_class,
      teaching_days,
      teaching_hours,
      agreed_terms,
      status,
      submitted_at,
      created_at,
      updated_at
    )
    values (
      new.id,
      left(coalesce(v_teacher_data ->> 'full_name', new.raw_user_meta_data ->> 'display_name', ''), 200),
      nullif(left(v_teacher_data ->> 'birth_date', 30), ''),
      left(coalesce(v_teacher_data ->> 'gender', ''), 30),
      left(coalesce(v_teacher_data ->> 'nationality', v_teacher_data ->> 'country', ''), 120),
      left(coalesce(v_teacher_data ->> 'phone_number', ''), 40),
      left(coalesce(v_teacher_data ->> 'email', new.email, ''), 320),
      left(coalesce(v_teacher_data ->> 'address', ''), 300),
      left(coalesce(v_teacher_data ->> 'timezone', ''), 80),
      v_language_codes,
      coalesce(v_teacher_data -> 'levels', '{}'::jsonb),
      coalesce(v_teacher_data -> 'programs', '[]'::jsonb),
      left(coalesce(v_teacher_data ->> 'highest_education', ''), 100),
      left(coalesce(v_teacher_data ->> 'institution', ''), 200),
      left(coalesce(v_teacher_data ->> 'major', ''), 200),
      left(coalesce(v_teacher_data ->> 'graduation_year', ''), 10),
      coalesce((v_teacher_data ->> 'has_teaching_exp')::boolean, false),
      left(coalesce(v_teacher_data ->> 'experience_years', ''), 20),
      left(coalesce(v_teacher_data ->> 'experience_institution', ''), 200),
      left(coalesce(v_teacher_data ->> 'experience_description', ''), 2000),
      left(coalesce(v_teacher_data ->> 'teaching_mode', 'both'), 20),
      coalesce((v_teacher_data ->> 'session_duration')::integer, 60),
      coalesce((v_teacher_data ->> 'max_students_per_class')::integer, 10),
      coalesce(v_teacher_data -> 'teaching_days', '[]'::jsonb),
      coalesce(v_teacher_data -> 'teaching_hours', '{}'::jsonb),
      coalesce((v_teacher_data ->> 'agreed_terms')::boolean, true),
      'pending_review',
      now(),
      now(),
      now()
    );
  end if;

  return new;
end;
$function$;

create or replace function public.approve_teacher_application(
  p_application_id uuid,
  p_admin_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_admin_id uuid := auth.uid();
  v_app public.teacher_applications%rowtype;
  v_teacher_id uuid;
begin
  if v_admin_id is null or not public.is_admin() then
    raise exception 'Not authorized';
  end if;

  select * into v_app
  from public.teacher_applications
  where id = p_application_id
  for update;

  if v_app.id is null then
    raise exception 'Teacher application not found';
  end if;

  if v_app.status not in ('pending_review', 'needs_revision') then
    raise exception 'Application is not awaiting approval';
  end if;

  perform 1 from public.users where id = v_app.user_id for update;

  if exists (
    select 1 from public.teacher_applications other
    where other.user_id = v_app.user_id
      and other.id <> v_app.id
      and other.status = 'approved'
  ) then
    raise exception 'Another teacher application is already approved';
  end if;

  if not exists (
    select 1
    from public.languages l
    where l.is_active = true
      and l.code in (
        select value from jsonb_array_elements_text(
          case when jsonb_typeof(v_app.languages) = 'array' then v_app.languages else '[]'::jsonb end
        )
      )
  ) then
    raise exception 'Application has no active teaching language';
  end if;

  update public.users
  set role = 'teacher',
      status = 'active',
      display_name = coalesce(nullif(v_app.full_name, ''), display_name),
      nationality = coalesce(nullif(v_app.nationality, ''), nationality),
      phone_number = coalesce(nullif(v_app.phone_number, ''), phone_number),
      birth_date = coalesce(nullif(v_app.birth_date, ''), birth_date),
      gender = coalesce(nullif(v_app.gender, ''), gender),
      timezone = coalesce(nullif(v_app.timezone, ''), timezone),
      updated_at = now()
  where id = v_app.user_id;

  if not found then
    raise exception 'Applicant profile not found';
  end if;

  insert into public.teachers (
    user_id,
    application_id,
    headline,
    bio,
    experience_years,
    highest_education,
    institution,
    major,
    teaching_mode,
    max_students,
    status,
    marketplace_visible
  )
  values (
    v_app.user_id,
    v_app.id,
    v_app.full_name,
    v_app.bio,
    case
      when coalesce(v_app.experience_years, '') ~ '^\s*\d+\s*$'
        then coalesce(nullif(trim(v_app.experience_years), '')::integer, 0)
      else 0
    end,
    v_app.highest_education,
    v_app.institution,
    v_app.major,
    v_app.teaching_mode,
    coalesce(v_app.max_students_per_class, 10),
    'active',
    true
  )
  on conflict (user_id) do update set
    application_id = excluded.application_id,
    headline = excluded.headline,
    bio = excluded.bio,
    experience_years = excluded.experience_years,
    highest_education = excluded.highest_education,
    institution = excluded.institution,
    major = excluded.major,
    teaching_mode = excluded.teaching_mode,
    max_students = excluded.max_students,
    status = 'active',
    marketplace_visible = true,
    updated_at = now()
  returning id into v_teacher_id;

  insert into public.teacher_languages (teacher_id, language_code, levels, is_native)
  select v_teacher_id, l.code, '{}'::text[], l.code = 'id'
  from public.languages l
  where l.is_active = true
    and l.code in (
      select value from jsonb_array_elements_text(
        case when jsonb_typeof(v_app.languages) = 'array' then v_app.languages else '[]'::jsonb end
      )
    )
  on conflict (teacher_id, language_code) do nothing;

  update public.teacher_applications
  set status = 'approved',
      admin_notes = p_admin_notes,
      reviewed_by = v_admin_id,
      reviewed_at = now(),
      updated_at = now()
  where id = v_app.id;

  insert into public.notifications (user_id, type, title, body, link, is_read)
  values (
    v_app.user_id,
    'success',
    'Teacher application approved',
    'Your teacher application has been approved. You can now access the teacher dashboard.',
    '/teacher/dashboard',
    false
  );

  return jsonb_build_object(
    'application_id', v_app.id,
    'user_id', v_app.user_id,
    'teacher_id', v_teacher_id,
    'status', 'approved'
  );
end;
$function$;

revoke execute on function public.approve_teacher_application(uuid, text) from public, anon;
grant execute on function public.approve_teacher_application(uuid, text) to authenticated;