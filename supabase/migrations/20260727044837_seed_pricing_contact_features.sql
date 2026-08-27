-- Seed Pricing plans
INSERT INTO public.cms_content (section, heading, content, meta, is_published, sort_order)
VALUES
  ('pricing', 'Pilih Paket Belajar', to_jsonb('Mulai belajar bahasa asing dengan paket yang sesuai kebutuhanmu'::text), '{"plans":[{"name":"Free","price":"Gratis","period":"selamanya","badge":null,"featured":false,"features":["Akses placement test","1 kursus gratis","Basic AI chatbot","Materi belajar dasar"],"missing":["Kelas live","Sertifikat","Tugas & quiz","Konsultasi pengajar"]},{"name":"Pro","price":"Rp150.000","period":"/bulan","badge":"Terpopuler","featured":true,"features":["Semua fitur Free","Akses semua kursus","Kelas live tiap minggu","Tugas & quiz interaktif","Sertifikat digital","AI chatbot premium","Konsultasi pengajar"],"missing":[]},{"name":"Premium","price":"Rp350.000","period":"/bulan","badge":"Terbaik","featured":false,"features":["Semua fitur Pro","Kelas private 1-on-1","Kelas live tiap hari","Rencana belajar personal","Prioritas sertifikat QR","Akses offline materi","Undangan event eksklusif"],"missing":[]}],"comparison":[{"name":"Placement Test","free":true,"pro":true,"premium":true},{"name":"Kursus Aktif","free":"1 kursus","pro":"Semua","premium":"Semua + Private"},{"name":"Kelas Live","free":false,"pro":"Mingguan","premium":"Harian + 1-on-1"},{"name":"Tugas & Quiz","free":false,"pro":true,"premium":true},{"name":"AI Chatbot","free":"Basic","pro":"Premium","premium":"Premium"},{"name":"Sertifikat Digital","free":false,"pro":true,"premium":"QR Verified"},{"name":"Konsultasi Pengajar","free":false,"pro":"Chat","premium":"Chat + Video"},{"name":"Rencana Belajar Personal","free":false,"pro":false,"premium":true},{"name":"Akses Offline","free":false,"pro":false,"premium":true},{"name":"Event Eksklusif","free":false,"pro":false,"premium":true}],"faqs":[{"q":"Bisa ganti paket kapan saja?","a":"Tentu! Kamu bisa upgrade atau downgrade paket kapan saja. Perubahan akan berlaku di siklus penagihan berikutnya."},{"q":"Ada masa trial?","a":"Ya, paket Free bisa kamu gunakan selamanya tanpa batas waktu. Upgrade kapanpun kamu siap."},{"q":"Metode pembayaran apa saja?","a":"Kami menerima transfer bank (BCA, Mandiri, BRI), GoPay, OVO, DANA, dan kartu kredit."},{"q":"Apakah bisa refund?","a":"Ya, kami memberikan garansi 7 hari uang kembali jika kamu tidak puas dengan layanan Pro atau Premium."},{"q":"Apakah ada diskon tahunan?","a":"Ya, kamu bisa hemat hingga 20% dengan berlangganan paket tahunan. Hubungi kami untuk detailnya."}]}'::jsonb, true, 1)
ON CONFLICT DO NOTHING;

-- Seed Contact info
INSERT INTO public.cms_content (section, heading, content, meta, is_published, sort_order)
VALUES
  ('contact', 'Hubungi Kami', to_jsonb('Ada pertanyaan? Kami siap membantu'::text), '{"contact_info":[{"icon":"Phone","label":"WhatsApp","value":"+62 812 3456 7890","desc":"Senin - Jumat, 08:00 - 18:00"},{"icon":"Mail","label":"Email","value":"hello@edulingo.id","desc":"Kami balas dalam 1x24 jam"},{"icon":"MapPin","label":"Lokasi","value":"Jakarta, Indonesia","desc":"Kantor pusat EduLingo"}]}'::jsonb, true, 1)
ON CONFLICT DO NOTHING;

-- Seed landing page config (feature pills, languages, steps)
INSERT INTO public.cms_content (section, heading, content, is_published, sort_order)
VALUES
  ('landing_config', NULL, '{"featurePills":["Kelas Live","AI Chatbot","Sertifikat Resmi","6 Bahasa"],"steps":[{"num":"01","title":"Pilih Bahasa","desc":"Pilih dari 6 bahasa populer dan tentukan level targetmu."},{"num":"02","title":"Atur Target","desc":"Tentukan waktu belajar harian — mulai dari 5 menit saja."},{"num":"03","title":"Ikuti Kursus","desc":"Belajar lewat kelas live bersama pengajar dan materi terstruktur."},{"num":"04","title":"Pantau Progres","desc":"Lihat perkembangan kemampuan bahasamu secara real-time."}]}'::jsonb, true, 1)
ON CONFLICT DO NOTHING;

-- Seed Partners
INSERT INTO public.cms_content (section, heading, content, is_published, sort_order)
VALUES
  ('partners', NULL, '[{"id":"1","name":"Universitas Indonesia","logo_url":"","website":"#"},{"id":"2","name":"Universitas Gadjah Mada","logo_url":"","website":"#"},{"id":"3","name":"Gojek","logo_url":"","website":"#"},{"id":"4","name":"Tokopedia","logo_url":"","website":"#"},{"id":"5","name":"Google for Education","logo_url":"","website":"#"}]'::jsonb, true, 1)
ON CONFLICT DO NOTHING;
