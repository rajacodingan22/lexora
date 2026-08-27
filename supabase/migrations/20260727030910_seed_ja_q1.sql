INSERT INTO placement_questions (test_id, language_code, question_type, question_text, passage_text, audio_url, options, correct_answer, points, difficulty_level, sort_order)
SELECT * FROM (VALUES
  ('a0000001-0000-0000-0000-000000000002'::uuid, 'ja'::text, 'listening'::text, E'\u30C9\u30A2\u3092\u958B\u3051\u3066\u304F\u3060\u3055\u3044\u3068\u8A00\u308F\u308C\u307E\u3057\u305F\u3002\u4F55\u3092\u3057\u307E\u3059\u304B\uFF1F'::text, ''::text, '/audio/placement/ja/listening_a1_1.mp3'::text, '["Close the door", "Open the door", "Open the window", "Sit down"]'::jsonb, '1'::text, 5, 'A1'::text, 1)
) AS q(test_id, lang, qtype, qtext, passage, audio, opts, correct, points, diff, sort)
WHERE NOT EXISTS (SELECT 1 FROM placement_questions WHERE test_id = q.test_id AND sort_order = q.sort);