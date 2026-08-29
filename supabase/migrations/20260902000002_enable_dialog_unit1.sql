-- Pasang contoh dialog bot di Unit 1 (Self Introduction) — wajib 7 menit
-- Topic lock: hanya bahas Self Introduction, di luar topik diarahkan kembali
-- Karakter: Ms. Sarah (Friendly English tutor in London)

-- Target spesifik: seeded course Self Introduction (d0000000-0000-0000-0000-000000000005)
update public.course_tasks
set
  dialog_enabled = true,
  dialog_topic = 'Self Introduction - Greetings and Personal Information',
  dialog_character_name = 'Ms. Sarah',
  dialog_character_role = 'Friendly English tutor in London',
  dialog_instructions = 'Ramah, banyak tanya balik, koreksi halus, jaga topik Self Introduction, redirect jika off-topic',
  dialog_duration_sec = 420
where course_id = 'd0000000-0000-0000-0000-000000000005'
  and task_number = 1;

-- Fallback generik: jika ada Unit 1 lain belum ada dialog, aktifkan juga sebagai contoh
update public.course_tasks
set
  dialog_enabled = true,
  dialog_topic = coalesce(dialog_topic, 'Self Introduction - Greetings and Personal Information'),
  dialog_character_name = coalesce(dialog_character_name, 'Ms. Sarah'),
  dialog_character_role = coalesce(dialog_character_role, 'Friendly English tutor in London'),
  dialog_instructions = coalesce(dialog_instructions, 'Ramah, banyak tanya balik, koreksi halus, jaga topik Self Introduction'),
  dialog_duration_sec = coalesce(dialog_duration_sec, 420)
where task_number = 1
  and (dialog_enabled = false or dialog_enabled is null)
  and dialog_topic is null;
