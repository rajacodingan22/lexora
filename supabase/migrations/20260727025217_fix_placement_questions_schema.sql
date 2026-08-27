-- Add missing columns for placement questions
ALTER TABLE placement_questions ADD COLUMN IF NOT EXISTS language_code TEXT DEFAULT 'en';
ALTER TABLE placement_questions ADD COLUMN IF NOT EXISTS difficulty_level TEXT DEFAULT 'A1';
ALTER TABLE placement_questions ADD COLUMN IF NOT EXISTS audio_url TEXT DEFAULT '';
ALTER TABLE placement_questions ADD COLUMN IF NOT EXISTS passage_text TEXT DEFAULT '';

-- Ensure question_type has a default
ALTER TABLE placement_questions ALTER COLUMN question_type SET DEFAULT 'grammar';

-- Add indexes
CREATE INDEX IF NOT EXISTS idx_pq_language ON placement_questions(language_code);
CREATE INDEX IF NOT EXISTS idx_pq_type ON placement_questions(question_type);
CREATE INDEX IF NOT EXISTS idx_pq_lang_diff ON placement_questions(language_code, difficulty_level);
