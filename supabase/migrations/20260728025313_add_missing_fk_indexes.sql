-- Add missing indexes on foreign key columns

CREATE INDEX IF NOT EXISTS idx_courses_level ON public.courses(level_id);
CREATE INDEX IF NOT EXISTS idx_placement_results_level ON public.placement_results(suggested_level_id);
CREATE INDEX IF NOT EXISTS idx_placement_results_test ON public.placement_results(test_id);
CREATE INDEX IF NOT EXISTS idx_placement_tests_lang ON public.placement_tests(language_code);
CREATE INDEX IF NOT EXISTS idx_submissions_grader ON public.submissions(graded_by);
CREATE INDEX IF NOT EXISTS idx_teachers_application ON public.teachers(application_id);
CREATE INDEX IF NOT EXISTS idx_notifications_sender ON public.notifications(sender_id);
