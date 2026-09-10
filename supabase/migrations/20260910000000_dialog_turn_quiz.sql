-- Beat terkunci pilihan: {images: [{url, caption}], options: [text], correctIndex: number}
-- Null = beat biasa (langsung tampil teks).
alter table public.dialog_script_turns
  add column if not exists quiz jsonb;
