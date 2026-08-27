-- Add image_speak to activity_type enums
-- lesson_activities
ALTER TABLE public.lesson_activities DROP CONSTRAINT IF EXISTS lesson_activities_activity_type_check;
ALTER TABLE public.lesson_activities ADD CONSTRAINT lesson_activities_activity_type_check CHECK (activity_type IN ('learn','flashcard','vocabulary','listening','speaking','reading','grammar_fix','fill_blank','arrange_sentence','image_selection','matching','writing','quick_review','image_speak'));

-- activity_library_items
ALTER TABLE public.activity_library_items DROP CONSTRAINT IF EXISTS activity_library_items_activity_type_check;
ALTER TABLE public.activity_library_items ADD CONSTRAINT activity_library_items_activity_type_check CHECK (activity_type IN ('learn','flashcard','vocabulary','listening','speaking','reading','grammar_fix','fill_blank','arrange_sentence','image_selection','matching','writing','quick_review','image_speak'));

-- activity_content (if constrained)
ALTER TABLE public.activity_content DROP CONSTRAINT IF EXISTS activity_content_content_type_check;
-- some installs use text without check, safe to ignore error if not exists

-- RLS: admin-only insert/update/delete for lesson_activities & activity_content
DROP POLICY IF EXISTS lesson_activities_insert_teacher ON public.lesson_activities;
CREATE POLICY lesson_activities_insert_teacher ON public.lesson_activities FOR INSERT TO authenticated WITH CHECK (is_admin());
DROP POLICY IF EXISTS lesson_activities_update_teacher ON public.lesson_activities;
CREATE POLICY lesson_activities_update_teacher ON public.lesson_activities FOR UPDATE TO authenticated USING (is_admin()) WITH CHECK (is_admin());
DROP POLICY IF EXISTS lesson_activities_delete_teacher ON public.lesson_activities;
CREATE POLICY lesson_activities_delete_teacher ON public.lesson_activities FOR DELETE TO authenticated USING (is_admin());

DROP POLICY IF EXISTS activity_content_insert_teacher ON public.activity_content;
CREATE POLICY activity_content_insert_teacher ON public.activity_content FOR INSERT TO authenticated WITH CHECK (is_admin());
DROP POLICY IF EXISTS activity_content_update_teacher ON public.activity_content;
CREATE POLICY activity_content_update_teacher ON public.activity_content FOR UPDATE TO authenticated USING (is_admin()) WITH CHECK (is_admin());
DROP POLICY IF EXISTS activity_content_delete_teacher ON public.activity_content;
CREATE POLICY activity_content_delete_teacher ON public.activity_content FOR DELETE TO authenticated USING (is_admin());
