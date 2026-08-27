<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# DB Migration Sync Rule (WAJIB)

- **Setiap perubahan database yang di-apply ke Supabase remote WAJIB disinkronkan ke file lokal `supabase/migrations/`** — nama file harus persis `{version}_{name}.sql` sesuai riwayat remote di `supabase_migrations.schema_migrations`.
- Setelah apply migration (via MCP `supabase_apply_migration`), jalankan `supabase list_migrations` (MCP) dan cek file lokal cocok. Jika remote menerima version yang berbeda dari nama file yang dibuat, **rename file lokal agar sama dengan versi remote**.
- **Cara ambil ulang SQL migrasi dari remote** (jika file lokal hilang/kedaluwarsa):
  `select version, name, array_to_string(statements, E'\n;\n') as sql_text from supabase_migrations.schema_migrations order by version;`
  (kolom `statements` berisi SQL asli tiap migrasi; seluruh 160 migrasi tersimpan di remote)
  Hasil MCP besar akan ter-truncate ke file di `~/.local/share/opencode/tool-output/` — parse dengan script Node (lihat `C:\Users\asust\AppData\Local\Temp\opencode\parse-migrations.js`) lalu salin ke `supabase/migrations/`. **Jangan baca file hasil truncate langsung via Read** (bisa merusak konteks); verifikasi encoding UTF-8 via byte-check (emoji/jepang).
- Catatan: `create or replace` / perbaikan ad-hoc di luar migrasi TIDAK otomatis masuk ke file migrasi — tetap tulis/revisi file migrasi terkait agar arsip lokal merepresentasikan keadaan remote.
- Tidak ada Docker/DB lokal — jangan asumsikan `supabase start` berjalan.
