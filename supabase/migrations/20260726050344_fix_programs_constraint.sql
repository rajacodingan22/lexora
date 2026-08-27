-- Fix unique constraint to be per-language
ALTER TABLE programs DROP CONSTRAINT IF EXISTS programs_slug_key;
ALTER TABLE programs ADD CONSTRAINT programs_lang_slug_key UNIQUE (language_code, slug);

-- Now insert programs for all languages
INSERT INTO programs (language_code, slug, name, program_type, display_order, is_active)
SELECT * FROM (VALUES
  ('en'::text, 'conversation'::text, '{"en": "Conversation", "id": "Conversation"}'::jsonb, 'regular'::text, 1::int, true::bool),
  ('en', 'toefl', '{"en": "TOEFL", "id": "TOEFL"}', 'test-prep', 2, true),
  ('en', 'ielts', '{"en": "IELTS", "id": "IELTS"}', 'test-prep', 3, true),
  ('en', 'bipa', '{"en": "BIPA", "id": "BIPA"}', 'regular', 4, true),
  ('en', 'toeic', '{"en": "TOEIC", "id": "TOEIC"}', 'test-prep', 5, true),
  ('en', 'business-english', '{"en": "Business English", "id": "Business English"}', 'regular', 6, true),
  ('en', 'public-speaking', '{"en": "Public Speaking", "id": "Public Speaking"}', 'regular', 7, true),
  ('en', 'debate', '{"en": "Debate", "id": "Debate"}', 'regular', 8, true),
  ('en', 'grammar', '{"en": "Grammar", "id": "Grammar"}', 'regular', 9, true),
  ('en', 'mun', '{"en": "MUN", "id": "MUN"}', 'regular', 10, true),
  ('en', 'utbk', '{"en": "UTBK", "id": "UTBK"}', 'test-prep', 11, true),
  ('ja', 'jlpt', '{"en": "JLPT", "id": "JLPT"}', 'test-prep', 1, true),
  ('ja', 'conversation', '{"en": "Conversation", "id": "Conversation"}', 'regular', 2, true),
  ('ko', 'topik', '{"en": "TOPIK", "id": "TOPIK"}', 'test-prep', 1, true),
  ('ko', 'conversation', '{"en": "Conversation", "id": "Conversation"}', 'regular', 2, true),
  ('ar', 'conversation', '{"en": "Conversation", "id": "Conversation"}', 'regular', 1, true),
  ('fa', 'conversation', '{"en": "Conversation", "id": "Conversation"}', 'regular', 1, true),
  ('id', 'bipa', '{"en": "BIPA", "id": "BIPA"}', 'regular', 1, true),
  ('id', 'conversation', '{"en": "Conversation", "id": "Conversation"}', 'regular', 2, true)
) AS p(lang, slug, name, ptype, ord, active)
ON CONFLICT (language_code, slug) DO NOTHING;
