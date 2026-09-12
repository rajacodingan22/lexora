-- Cabut 4 policy ad-hoc discussion_posts yang dibuat di luar migrasi
-- (tidak tercatat di arsip lokal, ditemukan audit 2026-09-11 langsung di remote).
-- Alasan pencabutan:
--   dp_read_enrolled  : baca se-course tanpa status enrollment (diganti batch-only).
--   dp_insert_own     : tanpa cek enrollment/locked/parent -> by pass pengaman (policy OR).
--   dp_update_own     : student bisa edit + pin/lock/delete postingannya sendiri.
--   dp_delete_own     : hard delete milik sendiri (CASCADE menghapus balasan orang).
-- Pengganti: discussion_posts_read_batch / insert_batch / update_staff (20260911000002).

drop policy if exists dp_read_enrolled on public.discussion_posts;
drop policy if exists dp_insert_own on public.discussion_posts;
drop policy if exists dp_update_own on public.discussion_posts;
drop policy if exists dp_delete_own on public.discussion_posts;
