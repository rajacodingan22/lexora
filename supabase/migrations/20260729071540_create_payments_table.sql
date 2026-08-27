CREATE TABLE IF NOT EXISTS payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id),
  enrollment_id UUID REFERENCES enrollments(id) ON DELETE SET NULL,
  invoice_number TEXT NOT NULL,
  amount NUMERIC NOT NULL,
  proof_url TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'cancelled')),
  payment_method TEXT,
  notes TEXT,
  whatsapp_number TEXT,
  reviewed_by UUID REFERENCES users(id),
  paid_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "payments_read_own" ON payments FOR SELECT TO public USING (auth.uid() = user_id);
CREATE POLICY "payments_read_admin" ON payments FOR SELECT TO public USING (is_admin());
CREATE POLICY "payments_insert_student" ON payments FOR INSERT TO public WITH CHECK (auth.uid() = user_id);
CREATE POLICY "payments_update_admin" ON payments FOR UPDATE TO public USING (is_admin()) WITH CHECK (is_admin());
CREATE POLICY "payments_update_own" ON payments FOR UPDATE TO public USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- storage bucket for payment proofs
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('payment-proofs', 'payment-proofs', true, 5242880, '{image/jpeg,image/png,image/webp,application/pdf}')
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "proofs_read_public" ON storage.objects FOR SELECT TO public USING (bucket_id = 'payment-proofs');
CREATE POLICY "proofs_insert_own" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'payment-proofs' AND (auth.uid()::text = (storage.foldername(name))[1]));
CREATE POLICY "proofs_delete_own" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'payment-proofs' AND (auth.uid()::text = (storage.foldername(name))[1]));

-- add whatsapp column to system_settings if not exists
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'system_settings' AND column_name = 'whatsapp_number') THEN
    ALTER TABLE system_settings ADD COLUMN whatsapp_number TEXT;
  END IF;
END $$;