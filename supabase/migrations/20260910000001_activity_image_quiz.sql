-- Activity baru image_quiz: pilih caption sesuai gambar + ucapkan (karaoke kata).
alter table public.lesson_activities
  drop constraint if exists lesson_activities_activity_type_check;
alter table public.lesson_activities
  add constraint lesson_activities_activity_type_check
  check (activity_type in (
    'learn', 'flashcard', 'vocabulary', 'listening', 'speaking', 'reading',
    'grammar_fix', 'fill_blank', 'arrange_sentence', 'image_selection',
    'matching', 'writing', 'quick_review',
    'image_speak', 'speaking_review', 'image_quiz',
    'quiz', 'video', 'exercise'
  ));

alter table public.activity_library_items
  drop constraint if exists activity_library_items_activity_type_check;
alter table public.activity_library_items
  add constraint activity_library_items_activity_type_check
  check (activity_type in (
    'learn', 'flashcard', 'vocabulary', 'listening', 'speaking', 'reading',
    'grammar_fix', 'fill_blank', 'arrange_sentence', 'image_selection',
    'matching', 'writing', 'quick_review',
    'image_speak', 'speaking_review', 'image_quiz',
    'quiz', 'video', 'exercise'
  ));
