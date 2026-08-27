-- Seed FAQ section
INSERT INTO public.cms_content (section, heading, content, is_published, sort_order)
VALUES
  ('faq', NULL, '[{"question":"Apa itu EduLingo?","answer":"EduLingo adalah platform pembelajaran bahasa asing yang menyediakan kursus terstruktur dengan pengajar profesional, placement test, dan AI chatbot untuk praktik percakapan."},{"question":"Bagaimana cara mendaftar?","answer":"Kunjungi halaman daftar, isi data diri, verifikasi email, dan kamu bisa langsung memulai placement test gratis."},{"question":"Apakah ada biaya pendaftaran?","answer":"Pendaftaran gratis! Kamu bisa mengikuti placement test dan melihat program tanpa biaya. Biaya dikenakan saat memulai kursus."},{"question":"Apa itu Placement Test?","answer":"Placement test adalah tes penempatan untuk menentukan level kemampuan bahasa kamu. Tes ini wajib diikuti sebelum memilih program."},{"question":"Bahasa apa saja yang tersedia?","answer":"Saat ini tersedia 6 bahasa: Inggris, Jepang, Korea, Arab, Persia, dan Indonesia (BIPA)."},{"question":"Apakah ada sertifikat?","answer":"Ya, setelah menyelesaikan kursus dengan nilai minimal lulus, kamu akan mendapatkan sertifikat digital dengan QR verification."},{"question":"Bagaimana sistem pembelajarannya?","answer":"Kelas dilakukan via Zoom/Google Meet, dilengkapi materi belajar, tugas, quiz, dan ujian akhir. Ada juga AI chatbot untuk praktik mandiri."},{"question":"Bisa belajar dimana saja?","answer":"Tentu! Semua kelas online bisa diikuti dari mana saja, cukup dengan koneksi internet."}]'::jsonb, true, 1)
ON CONFLICT DO NOTHING;

-- Seed About section (content is a JSON string)
INSERT INTO public.cms_content (section, heading, content, meta, is_published, sort_order)
VALUES
  ('about', 'Tentang EduLingo', to_jsonb('Platform pembelajaran bahasa yang menghubungkan siswa dengan pengajar profesional untuk pengalaman belajar yang efektif dan menyenangkan.'::text), '{"mission":"Membantu setiap orang menguasai bahasa asing melalui metode belajar terstruktur dan pengajar berkualitas.","vision":"Menjadi platform pembelajaran bahasa terdepan di Indonesia yang mencetak lulusan berstandar internasional."}'::jsonb, true, 1)
ON CONFLICT DO NOTHING;

-- Seed Hero section
INSERT INTO public.cms_content (section, heading, content, meta, is_published, sort_order)
VALUES
  ('hero', 'Kuasai Bahasa Asing', to_jsonb('Platform belajar bahasa asing dengan kursus terstruktur, pengajar profesional, dan sertifikat resmi yang diakui.'::text), '{"cta_text":"Mulai Sekarang — Gratis","cta_link":"/daftar"}'::jsonb, true, 1)
ON CONFLICT DO NOTHING;

-- Seed Testimonials section
INSERT INTO public.cms_content (section, heading, content, is_published, sort_order)
VALUES
  ('testimonials', NULL, '[{"id":"1","student_name":"Saraswati Putri","student_photo":"","content":"Kursusnya terstruktur dengan baik dan pengajarnya sabar menjelaskan. Dalam 3 bulan, kemampuan bahasa Jepang saya meningkat pesat.","rating":5},{"id":"2","student_name":"Andika Pratama","student_photo":"","content":"Belajar jadi lebih terarah dengan placement test dan rekomendasi kursus yang sesuai level. Sertifikatnya juga diakui perusahaan.","rating":5},{"id":"3","student_name":"Maya Indah","student_photo":"","content":"Praktis untuk jadwal sibuk. Kelas live di akhir pekan pas banget buat profesional yang tetap ingin belajar.","rating":4}]'::jsonb, true, 1)
ON CONFLICT DO NOTHING;
