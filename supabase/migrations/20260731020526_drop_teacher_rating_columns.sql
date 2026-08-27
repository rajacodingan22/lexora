alter table public.teachers
  drop column if exists total_rating,
  drop column if exists reviews_count;