INSERT INTO public.languages (code, name, native_name, flag_emoji, is_rtl, is_active, sort_order) VALUES
  ('en', '{"en":"English","id":"Bahasa Inggris"}', 'English', '🇬🇧', false, true, 1),
  ('ja', '{"en":"Japanese","id":"Bahasa Jepang"}', '日本語', '🇯🇵', false, true, 2),
  ('ko', '{"en":"Korean","id":"Bahasa Korea"}', '한국어', '🇰🇷', false, true, 3),
  ('ar', '{"en":"Arabic","id":"Bahasa Arab"}', 'العربية', '🇸🇦', true, true, 4),
  ('fa', '{"en":"Persian","id":"Bahasa Persia"}', 'فارسی', '🇮🇷', true, true, 5),
  ('id', '{"en":"Indonesian","id":"Bahasa Indonesia"}', 'Bahasa Indonesia', '🇮🇩', false, true, 6),
  ('fr', '{"en":"French","id":"Bahasa Prancis"}', 'Français', '🇫🇷', false, true, 7);

-- CEFR levels per language
DO $$
DECLARE
  lang_codes TEXT[] := ARRAY['en','ja','ko','ar','fa','id','fr'];
  lang_code TEXT;
  levels JSONB := '[
    {"code":"A1","name":{"en":"Beginner","id":"Pemula"},"desc":{"en":"Basic ability.","id":"Kemampuan dasar."},"sort":1},
    {"code":"A2","name":{"en":"Elementary","id":"Dasar"},"desc":{"en":"Simple expressions.","id":"Ekspresi sederhana."},"sort":2},
    {"code":"B1","name":{"en":"Intermediate","id":"Menengah"},"desc":{"en":"Daily situations.","id":"Situasi sehari-hari."},"sort":3},
    {"code":"B2","name":{"en":"Upper Intermediate","id":"Menengah Atas"},"desc":{"en":"Fluency.","id":"Kefasihan."},"sort":4},
    {"code":"C1","name":{"en":"Advanced","id":"Mahir"},"desc":{"en":"Complex topics.","id":"Topik kompleks."},"sort":5},
    {"code":"C2","name":{"en":"Proficient","id":"Profesional"},"desc":{"en":"Native-like.","id":"Seperti native."},"sort":6}
  ]';
  lvl JSONB;
BEGIN
  FOREACH lang_code IN ARRAY lang_codes LOOP
    FOR lvl IN SELECT * FROM jsonb_array_elements(levels) LOOP
      INSERT INTO public.language_levels (language_code, code, name, description, sort_order, is_active)
      VALUES (
        lang_code,
        lvl->>'code',
        lvl->'name',
        lvl->'desc',
        (lvl->>'sort')::int,
        true
      );
    END LOOP;
  END LOOP;
END $$;
