-- Categories
CREATE TABLE news_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug VARCHAR(100) UNIQUE NOT NULL,
  name VARCHAR(100) NOT NULL,
  description TEXT,
  icon VARCHAR(50),
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Tags
CREATE TABLE news_tags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug VARCHAR(100) UNIQUE NOT NULL,
  name VARCHAR(100) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Articles
CREATE TABLE news_articles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug VARCHAR(255) UNIQUE NOT NULL,
  title VARCHAR(255) NOT NULL,
  excerpt TEXT,
  content TEXT NOT NULL,
  category_id UUID REFERENCES news_categories(id),
  author_name VARCHAR(100) DEFAULT 'AI News',
  image_url TEXT,
  image_credit VARCHAR(255),
  source_name VARCHAR(100),
  source_url TEXT,
  is_featured BOOLEAN DEFAULT false,
  is_published BOOLEAN DEFAULT false,
  published_at TIMESTAMPTZ,
  view_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Article-Tags junction
CREATE TABLE article_tags (
  article_id UUID REFERENCES news_articles(id) ON DELETE CASCADE,
  tag_id UUID REFERENCES news_tags(id) ON DELETE CASCADE,
  PRIMARY KEY (article_id, tag_id)
);

-- Comments
CREATE TABLE news_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  article_id UUID REFERENCES news_articles(id) ON DELETE CASCADE NOT NULL,
  user_id UUID NOT NULL,
  user_email VARCHAR(255),
  user_name VARCHAR(100),
  content TEXT NOT NULL,
  is_approved BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Page views analytics
CREATE TABLE page_views (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  article_id UUID REFERENCES news_articles(id) ON DELETE SET NULL,
  path TEXT NOT NULL,
  country VARCHAR(100),
  city VARCHAR(100),
  referrer TEXT,
  user_agent TEXT,
  ip_address VARCHAR(45),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Saved/bookmarked articles
CREATE TABLE saved_articles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  article_id UUID REFERENCES news_articles(id) ON DELETE CASCADE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, article_id)
);

-- Indexes
CREATE INDEX idx_articles_published_at ON news_articles(published_at DESC);
CREATE INDEX idx_articles_category ON news_articles(category_id);
CREATE INDEX idx_articles_featured ON news_articles(is_featured) WHERE is_featured = true;
CREATE INDEX idx_articles_slug ON news_articles(slug);
CREATE INDEX idx_comments_article ON news_comments(article_id);
CREATE INDEX idx_page_views_article ON page_views(article_id);
CREATE INDEX idx_page_views_created ON page_views(created_at);
CREATE INDEX idx_page_views_country ON page_views(country);

-- RLS
ALTER TABLE news_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE news_tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE news_articles ENABLE ROW LEVEL SECURITY;
ALTER TABLE article_tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE news_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE page_views ENABLE ROW LEVEL SECURITY;
ALTER TABLE saved_articles ENABLE ROW LEVEL SECURITY;

-- Public read access
CREATE POLICY "Public read categories" ON news_categories FOR SELECT USING (true);
CREATE POLICY "Public read tags" ON news_tags FOR SELECT USING (true);
CREATE POLICY "Public read published articles" ON news_articles FOR SELECT USING (is_published = true);
CREATE POLICY "Public read article_tags" ON article_tags FOR SELECT USING (true);
CREATE POLICY "Public read approved comments" ON news_comments FOR SELECT USING (is_approved = true);

-- Authenticated users can insert comments
CREATE POLICY "Auth insert comments" ON news_comments FOR INSERT WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "Auth read own comments" ON news_comments FOR SELECT USING (auth.role() = 'authenticated' OR is_approved = true);
CREATE POLICY "Auth manage saved" ON saved_articles FOR ALL USING (auth.uid()::text = user_id::text);

-- Insert page views (anyone)
CREATE POLICY "Insert page views" ON page_views FOR INSERT WITH CHECK (true);
CREATE POLICY "Admin read page views" ON page_views FOR SELECT USING (auth.role() = 'authenticated');

-- Seed categories
INSERT INTO news_categories (slug, name, description, icon) VALUES
  ('teknologi', 'Teknologi', 'Berita teknologi terbaru', 'cpu'),
  ('bisnis', 'Bisnis', 'Berita bisnis dan ekonomi', 'briefcase'),
  ('olahraga', 'Olahraga', 'Berita olahraga', 'trophy'),
  ('hiburan', 'Hiburan', 'Berita hiburan dan gaya hidup', 'film'),
  ('sains', 'Sains', 'Berita sains dan penelitian', 'flask'),
  ('otomotif', 'Otomotif', 'Berita otomotif', 'car'),
  ('kesehatan', 'Kesehatan', 'Berita kesehatan', 'heart'),
  ('politik', 'Politik', 'Berita politik nasional', 'landmark'),
  ('dunia', 'Dunia', 'Berita internasional', 'globe');
