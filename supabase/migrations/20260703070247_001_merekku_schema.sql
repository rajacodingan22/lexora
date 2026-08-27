-- ============================================================
-- MerekKu — Database Schema
-- ============================================================

-- 1. TABLE: businesses
CREATE TABLE IF NOT EXISTS businesses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id TEXT NOT NULL,
  name VARCHAR(255),
  category VARCHAR(100),
  product_description TEXT,
  target_market TEXT,
  challenges TEXT,
  created_at TIMESTAMP DEFAULT NOW() NOT NULL
);

-- 2. TABLE: sessions
CREATE TABLE IF NOT EXISTS sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  status VARCHAR(20) DEFAULT 'active' NOT NULL,
  created_at TIMESTAMP DEFAULT NOW() NOT NULL,
  closed_at TIMESTAMP
);

-- 3. TABLE: messages (working memory)
CREATE TABLE IF NOT EXISTS messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  role VARCHAR(50) NOT NULL,
  agent_role VARCHAR(50),
  content TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT NOW() NOT NULL
);

-- 4. TABLE: agent_outputs (notulen rapat)
CREATE TABLE IF NOT EXISTS agent_outputs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  agent_role VARCHAR(50) NOT NULL,
  content JSONB NOT NULL,
  created_at TIMESTAMP DEFAULT NOW() NOT NULL
);

-- 5. TABLE: brand_memory (brand bible yang hidup)
CREATE TABLE IF NOT EXISTS brand_memory (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  positioning_summary TEXT,
  target_persona JSONB,
  decision_log JSONB,
  visual_direction JSONB,
  tone_of_voice TEXT,
  last_updated_at TIMESTAMP DEFAULT NOW() NOT NULL
);

-- 6. TABLE: blueprints (Brand Blueprint hasil jadi)
CREATE TABLE IF NOT EXISTS blueprints (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  content JSONB NOT NULL,
  pdf_url TEXT,
  created_at TIMESTAMP DEFAULT NOW() NOT NULL
);

-- 7. TABLE: bisnisku_context (source code indexing)
CREATE TABLE IF NOT EXISTS bisnisku_context (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  module_name VARCHAR(255) NOT NULL,
  description TEXT,
  route_path TEXT,
  relevant_keywords JSONB,
  last_synced_at TIMESTAMP DEFAULT NOW() NOT NULL
);

-- INDEXES
CREATE INDEX IF NOT EXISTS idx_sessions_business_id ON sessions(business_id);
CREATE INDEX IF NOT EXISTS idx_messages_session_id ON messages(session_id);
CREATE INDEX IF NOT EXISTS idx_agent_outputs_session_id ON agent_outputs(session_id);
CREATE INDEX IF NOT EXISTS idx_brand_memory_business_id ON brand_memory(business_id);
CREATE INDEX IF NOT EXISTS idx_blueprints_business_id ON blueprints(business_id);
CREATE INDEX IF NOT EXISTS idx_blueprints_session_id ON blueprints(session_id);

-- RLS
ALTER TABLE businesses ENABLE ROW LEVEL SECURITY;
ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_outputs ENABLE ROW LEVEL SECURITY;
ALTER TABLE brand_memory ENABLE ROW LEVEL SECURITY;
ALTER TABLE blueprints ENABLE ROW LEVEL SECURITY;
ALTER TABLE bisnisku_context ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Users can only access their own businesses"
  ON businesses FOR ALL
  USING (owner_id = auth.uid()::text);

CREATE POLICY "Users can only access their own sessions"
  ON sessions FOR ALL
  USING (business_id IN (
    SELECT id FROM businesses WHERE owner_id = auth.uid()::text
  ));

CREATE POLICY "Users can only access their own messages"
  ON messages FOR ALL
  USING (session_id IN (
    SELECT s.id FROM sessions s
    JOIN businesses b ON b.id = s.business_id
    WHERE b.owner_id = auth.uid()::text
  ));

CREATE POLICY "Users can only access their own agent_outputs"
  ON agent_outputs FOR ALL
  USING (session_id IN (
    SELECT s.id FROM sessions s
    JOIN businesses b ON b.id = s.business_id
    WHERE b.owner_id = auth.uid()::text
  ));

CREATE POLICY "Users can only access their own brand_memory"
  ON brand_memory FOR ALL
  USING (business_id IN (
    SELECT id FROM businesses WHERE owner_id = auth.uid()::text
  ));

CREATE POLICY "Users can only access their own blueprints"
  ON blueprints FOR ALL
  USING (business_id IN (
    SELECT id FROM businesses WHERE owner_id = auth.uid()::text
  ));

CREATE POLICY "Everyone can read bisnisku_context"
  ON bisnisku_context FOR SELECT
  USING (true);