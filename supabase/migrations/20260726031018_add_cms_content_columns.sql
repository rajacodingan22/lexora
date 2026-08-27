-- Add more columns to cms_content for different sections
ALTER TABLE public.cms_content ADD COLUMN IF NOT EXISTS sort_order INTEGER DEFAULT 0;
ALTER TABLE public.cms_content ADD COLUMN IF NOT EXISTS image_url TEXT DEFAULT '';
ALTER TABLE public.cms_content ADD COLUMN IF NOT EXISTS meta JSONB DEFAULT '{}'::jsonb;