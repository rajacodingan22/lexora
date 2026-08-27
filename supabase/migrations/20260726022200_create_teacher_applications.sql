-- Tabel pengajuan guru (teacher application/proposal)
CREATE TABLE public.teacher_applications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  
  -- A. Informasi Pribadi
  full_name TEXT NOT NULL DEFAULT '',
  birth_date TEXT,
  gender TEXT,
  nationality TEXT DEFAULT '',
  phone_number TEXT DEFAULT '',
  email TEXT DEFAULT '',
  address TEXT DEFAULT '',
  timezone TEXT DEFAULT '',
  
  -- B. Tentang Saya
  bio TEXT DEFAULT '',
  self_intro TEXT DEFAULT '',
  motivation TEXT DEFAULT '',
  
  -- C. Pendidikan
  highest_education TEXT DEFAULT '',
  institution TEXT DEFAULT '',
  major TEXT DEFAULT '',
  graduation_year TEXT DEFAULT '',
  
  -- D. Pengalaman Mengajar
  has_teaching_exp BOOLEAN DEFAULT false,
  experience_years TEXT DEFAULT '',
  experience_institution TEXT DEFAULT '',
  experience_description TEXT DEFAULT '',
  
  -- E. Bahasa yang diajarkan (JSON array of language codes)
  languages JSONB DEFAULT '[]'::jsonb,
  
  -- F. Program yang diajarkan (JSON array of program codes)
  programs JSONB DEFAULT '[]'::jsonb,
  
  -- G. Level yang dapat diajar (JSON object: {language_code: [level_codes]})
  levels JSONB DEFAULT '{}'::jsonb,
  
  -- H. Jadwal Mengajar
  teaching_days JSONB DEFAULT '[]'::jsonb,
  teaching_hours JSONB DEFAULT '{}'::jsonb,
  session_duration INTEGER DEFAULT 60,
  
  -- I. Kapasitas Mengajar
  max_students_per_class INTEGER DEFAULT 10,
  teaching_mode TEXT DEFAULT 'both', -- 'private', 'group', 'both'
  
  -- J. Dokumen (JSON array of {type, url, name})
  documents JSONB DEFAULT '[]'::jsonb,
  
  -- Persetujuan
  agreed_terms BOOLEAN DEFAULT false,
  agreed_policy BOOLEAN DEFAULT false,
  
  -- Status & Review
  status TEXT NOT NULL DEFAULT 'draft', -- 'draft', 'pending_review', 'needs_revision', 'approved', 'rejected'
  admin_notes TEXT DEFAULT '',
  reviewed_by UUID REFERENCES public.users(id),
  reviewed_at TIMESTAMPTZ,
  submitted_at TIMESTAMPTZ,
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- RLS
ALTER TABLE public.teacher_applications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ta_read_own" ON public.teacher_applications FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "ta_read_admin" ON public.teacher_applications FOR SELECT USING (public.is_admin());
CREATE POLICY "ta_insert_own" ON public.teacher_applications FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "ta_update_own" ON public.teacher_applications FOR UPDATE USING (auth.uid() = user_id AND status = ANY(ARRAY['draft', 'needs_revision']));
CREATE POLICY "ta_update_admin" ON public.teacher_applications FOR UPDATE USING (public.is_admin());

-- Trigger updated_at
CREATE TRIGGER set_teacher_applications_updated_at
  BEFORE UPDATE ON public.teacher_applications
  FOR EACH ROW EXECUTE FUNCTION update_timestamp();

-- Add country column to users if not exists
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS country TEXT DEFAULT '';
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS timezone TEXT DEFAULT '';
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS nationality TEXT DEFAULT '';

-- Update teachers table with more fields for application info
ALTER TABLE public.teachers ADD COLUMN IF NOT EXISTS application_id UUID REFERENCES public.teacher_applications(id);
ALTER TABLE public.teachers ADD COLUMN IF NOT EXISTS highest_education TEXT DEFAULT '';
ALTER TABLE public.teachers ADD COLUMN IF NOT EXISTS institution TEXT DEFAULT '';
ALTER TABLE public.teachers ADD COLUMN IF NOT EXISTS major TEXT DEFAULT '';
ALTER TABLE public.teachers ADD COLUMN IF NOT EXISTS teaching_mode TEXT DEFAULT 'both';
ALTER TABLE public.teachers ADD COLUMN IF NOT EXISTS max_students INTEGER DEFAULT 10;
