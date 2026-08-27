INSERT INTO placement_tests (id, language_code, title, description, time_limit_minutes, passing_score, is_active)
SELECT * FROM (VALUES
  ('a0000001-0000-0000-0000-000000000001'::uuid, 'en'::text, 'English Placement Test'::text, 'Test your English level with listening, reading, and grammar questions.'::text, 30, 60, true),
  ('a0000001-0000-0000-0000-000000000002', 'ja', 'Japanese Placement Test', 'Test your Japanese level with listening, reading, and grammar questions.', 30, 60, true),
  ('a0000001-0000-0000-0000-000000000003', 'ko', 'Korean Placement Test', 'Test your Korean level with listening, reading, and grammar questions.', 30, 60, true),
  ('a0000001-0000-0000-0000-000000000004', 'ar', 'Arabic Placement Test', 'Test your Arabic level with listening, reading, and grammar questions.', 30, 60, true),
  ('a0000001-0000-0000-0000-000000000005', 'fa', 'Persian Placement Test', 'Test your Persian level with listening, reading, and grammar questions.', 30, 60, true),
  ('a0000001-0000-0000-0000-000000000006', 'id', 'Indonesian Placement Test', 'Test your Indonesian level with listening, reading, and grammar questions.', 30, 60, true)
) AS t(id, language_code, title, description, time_limit_minutes, passing_score, is_active)
WHERE NOT EXISTS (SELECT 1 FROM placement_tests WHERE language_code = t.language_code);