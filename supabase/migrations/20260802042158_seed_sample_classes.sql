update courses set level_id = '0c8fe927-8542-4986-83ac-b58e66f059c9' where id = 'd0000000-0000-0000-0000-000000000003';
update courses set level_id = '02e783e5-b01d-465b-acc0-3742e22debe2' where id = 'd0000000-0000-0000-0000-000000000002';

insert into courses (id, program_id, language_code, level_id, title, description, syllabus, max_students, min_students, status, mode, is_visible_marketplace, starts_at, ends_at, image_url, price, meeting_count, project_count, is_try_class)
values
  ('d0000000-0000-0000-0000-000000000004', '94c725fc-d3d4-4f25-b417-862046b675db', 'en', '25862c2c-8541-4c1b-bf05-eb6a246aa4ff',
   '{"id":"Business English","en":"Business English"}',
   '{"id":"Bahasa Inggris untuk dunia kerja: email, meeting, presentasi, dan negosiasi.","en":"English for the workplace: emails, meetings, presentations, and negotiation."}',
   null, 20, 10, 'active', 'online', true, '2026-09-05 09:00:00+00', '2026-12-05 09:00:00+00', null, 350000, 12, 4, false),
  ('d0000000-0000-0000-0000-000000000005', '37e0919e-9cae-4470-8a87-5fa006803335', 'en', '02e783e5-b01d-465b-acc0-3742e22debe2',
   '{"id":"TOEFL Preparation","en":"TOEFL Preparation"}',
   '{"id":"Persiapan TOEFL: reading, listening, speaking, dan writing dengan simulasi ujian.","en":"TOEFL prep: reading, listening, speaking, and writing with exam simulations."}',
   null, 20, 10, 'active', 'online', true, '2026-09-15 09:00:00+00', '2026-12-15 09:00:00+00', null, 500000, 16, 4, false);

insert into batches (id, course_id, name, code, start_date, end_date, capacity, current_students, status)
values
  ('e0000000-0000-0000-0000-000000000007', 'd0000000-0000-0000-0000-000000000004', 'Biz Batch 1', 'BIZ-1', '2026-09-05 09:00:00+00', '2026-12-05 09:00:00+00', 20, 0, 'active'),
  ('e0000000-0000-0000-0000-000000000008', 'd0000000-0000-0000-0000-000000000005', 'TOEFL Batch 1', 'TOEFL-1', '2026-09-15 09:00:00+00', '2026-12-15 09:00:00+00', 20, 0, 'active');

insert into course_teachers (course_id, teacher_id)
values
  ('d0000000-0000-0000-0000-000000000004', 'b0000000-0000-0000-0000-000000000001'),
  ('d0000000-0000-0000-0000-000000000005', '072e1641-2ca0-4b91-95b2-e5332dd73168');