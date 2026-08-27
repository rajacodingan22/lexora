-- Create events table
CREATE TABLE IF NOT EXISTS public.events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL DEFAULT '',
  slug TEXT NOT NULL DEFAULT '',
  description TEXT DEFAULT '',
  content TEXT DEFAULT '',
  image_url TEXT DEFAULT '',
  event_date DATE,
  event_time TEXT DEFAULT '',
  location TEXT DEFAULT '',
  event_type TEXT DEFAULT 'online',
  registration_link TEXT DEFAULT '',
  status TEXT DEFAULT 'draft',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_events_slug ON events(slug);
CREATE INDEX IF NOT EXISTS idx_events_status ON events(status);
CREATE INDEX IF NOT EXISTS idx_events_date ON events(event_date DESC);

-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create storage bucket for uploads
INSERT INTO storage.buckets (id, name, public) 
VALUES ('teacher-documents', 'teacher-documents', true)
ON CONFLICT (id) DO NOTHING;

INSERT INTO storage.buckets (id, name, public) 
VALUES ('course-materials', 'course-materials', true)
ON CONFLICT (id) DO NOTHING;

INSERT INTO storage.buckets (id, name, public) 
VALUES ('assignment-submissions', 'assignment-submissions', true)
ON CONFLICT (id) DO NOTHING;

INSERT INTO storage.buckets (id, name, public) 
VALUES ('news-images', 'news-images', true)
ON CONFLICT (id) DO NOTHING;

-- RLS policies for events
DROP POLICY IF EXISTS "events_select_all" ON public.events;
CREATE POLICY "events_select_all" ON public.events
  FOR SELECT USING (status = 'published' OR auth.role() = 'authenticated');

DROP POLICY IF EXISTS "events_insert_admin" ON public.events;
CREATE POLICY "events_insert_admin" ON public.events
  FOR INSERT WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "events_update_admin" ON public.events;
CREATE POLICY "events_update_admin" ON public.events
  FOR UPDATE USING (public.is_admin());

DROP POLICY IF EXISTS "events_delete_admin" ON public.events;
CREATE POLICY "events_delete_admin" ON public.events
  FOR DELETE USING (public.is_admin());

-- Add teacher_id to courses if not exists (use user_id directly)
ALTER TABLE public.courses ADD COLUMN IF NOT EXISTS image_url TEXT DEFAULT '';

-- Add document_type to teacher_applications documents JSONB needs proper structure
-- Ensure news table has thumbnail field
ALTER TABLE public.news ADD COLUMN IF NOT EXISTS thumbnail_url TEXT DEFAULT '';

-- Create function to auto-generate certificate when grade_aggregates.is_passing becomes true
CREATE OR REPLACE FUNCTION public.auto_generate_certificate()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER SET search_path = 'public'
AS $$
DECLARE
  v_course_id UUID;
  v_user_id UUID;
  v_cert_code TEXT;
  v_existing INT;
  v_lang_code TEXT;
BEGIN
  IF NEW.is_passing = true AND (OLD.is_passing IS NULL OR OLD.is_passing = false) THEN
    SELECT e.course_id, e.user_id INTO v_course_id, v_user_id
    FROM enrollments e WHERE e.id = NEW.enrollment_id;

    SELECT COUNT(*) INTO v_existing
    FROM certificates
    WHERE enrollment_id = NEW.enrollment_id;

    IF v_existing = 0 THEN
      v_cert_code := 'EDU-' || UPPER(SUBSTRING(MD5(NEW.id::TEXT || NOW()::TEXT) FROM 1 FOR 8));

      SELECT c.language_code INTO v_lang_code
      FROM courses c WHERE c.id = v_course_id;

      INSERT INTO certificates (enrollment_id, user_id, course_id, language_code, certificate_code, status, final_grade, issue_date)
      VALUES (NEW.enrollment_id, v_user_id, v_course_id, v_lang_code, v_cert_code, 'generated', NEW.weighted_total, CURRENT_DATE);
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- Drop and recreate trigger
DROP TRIGGER IF EXISTS trg_auto_generate_certificate ON grade_aggregates;
CREATE TRIGGER trg_auto_generate_certificate
  AFTER UPDATE OF is_passing ON grade_aggregates
  FOR EACH ROW
  WHEN (NEW.is_passing = true)
  EXECUTE FUNCTION auto_generate_certificate();

-- Create notification sending function
CREATE OR REPLACE FUNCTION public.send_notification(
  p_user_id UUID,
  p_type TEXT,
  p_title TEXT,
  p_body TEXT DEFAULT '',
  p_link TEXT DEFAULT ''
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = 'public'
AS $$
BEGIN
  INSERT INTO notifications (user_id, type, title, body, link)
  VALUES (p_user_id, p_type, p_title, p_body, p_link);
END;
$$;
