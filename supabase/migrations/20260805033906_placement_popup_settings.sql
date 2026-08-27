insert into system_settings (key, value) values
  ('placement_popup_enabled', to_jsonb(true)),
  ('placement_test_price', to_jsonb(599000)),
  ('placement_bonus_meetings', to_jsonb(2))
on conflict (key) do nothing;