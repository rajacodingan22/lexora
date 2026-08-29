-- Merge all valid activity_type values into a unified CHECK constraint
-- Combines: original LMS types + image_speak + speaking_review + quiz/video/exercise

ALTER TABLE public.lesson_activities
  DROP CONSTRAINT IF EXISTS lesson_activities_activity_type_check;

ALTER TABLE public.lesson_activities
  ADD CONSTRAINT lesson_activities_activity_type_check
  CHECK (activity_type IN (
    -- Original LMS types
    'learn', 'flashcard', 'vocabulary', 'listening', 'speaking', 'reading',
    'grammar_fix', 'fill_blank', 'arrange_sentence', 'image_selection',
    'matching', 'writing', 'quick_review',
    -- Added later
    'image_speak', 'speaking_review',
    -- Activity library / admin types
    'quiz', 'video', 'exercise'
  ));

-- Same fix for activity_library_items
ALTER TABLE public.activity_library_items
  DROP CONSTRAINT IF EXISTS activity_library_items_activity_type_check;

ALTER TABLE public.activity_library_items
  ADD CONSTRAINT activity_library_items_activity_type_check
  CHECK (activity_type IN (
    'learn', 'flashcard', 'vocabulary', 'listening', 'speaking', 'reading',
    'grammar_fix', 'fill_blank', 'arrange_sentence', 'image_selection',
    'matching', 'writing', 'quick_review',
    'image_speak', 'speaking_review',
    'quiz', 'video', 'exercise'
  ));
