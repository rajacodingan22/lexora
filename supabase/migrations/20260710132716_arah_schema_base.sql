-- Enable pg_partman for automatic partition management
CREATE EXTENSION IF NOT EXISTS pg_partman SCHEMA extensions;

-- ============================
-- TABLES
-- ============================

-- Profiles extending auth.users
CREATE TABLE arah_profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username TEXT UNIQUE,
  display_name TEXT,
  avatar_url TEXT,
  bio TEXT,
  age_group TEXT CHECK (age_group IN ('13-15','16-18','19-24')),
  tone_preference TEXT DEFAULT 'santai' CHECK (tone_preference IN ('santai','tegas','kakak')),
  active_time TEXT DEFAULT 'pagi',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  onboarding_complete BOOLEAN DEFAULT FALSE,
  last_active_at TIMESTAMPTZ DEFAULT NOW(),
  ai_persona_id TEXT DEFAULT 'kak_mentor'
);

-- Conversations (partitioned by month)
CREATE TABLE arah_conversations (
  id UUID DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES arah_profiles(id) ON DELETE CASCADE,
  title TEXT,
  context JSONB DEFAULT '{}',
  mood_at_start INT CHECK (mood_at_start BETWEEN 1 AND 5),
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (id, created_at)
) PARTITION BY RANGE (created_at);

-- Messages (partitioned by month)
CREATE TABLE arah_messages (
  id BIGSERIAL,
  conversation_id UUID NOT NULL,
  user_id UUID NOT NULL REFERENCES arah_profiles(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user','ai','system')),
  content TEXT NOT NULL,
  trigger_type TEXT CHECK (trigger_type IN ('no_show','stall','dip','micro_win','scheduled','user_initiated')),
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (id, created_at)
) PARTITION BY RANGE (created_at);

-- Mood logs
CREATE TABLE arah_mood_logs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES arah_profiles(id) ON DELETE CASCADE,
  mood_score INT NOT NULL CHECK (mood_score BETWEEN 1 AND 5),
  energy_level INT CHECK (energy_level BETWEEN 1 AND 5),
  note TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Goals
CREATE TABLE arah_goals (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES arah_profiles(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  category TEXT CHECK (category IN ('karir','pendidikan','kesehatan','skill','sosial','finansial','spiritual','lainnya')),
  target_date DATE,
  status TEXT DEFAULT 'active' CHECK (status IN ('active','paused','completed','abandoned')),
  progress DECIMAL(5,2) DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Tasks
CREATE TABLE arah_tasks (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES arah_profiles(id) ON DELETE CASCADE,
  goal_id UUID REFERENCES arah_goals(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  description TEXT,
  difficulty TEXT DEFAULT 'easy' CHECK (difficulty IN ('easy','medium','hard')),
  duration_minutes INT,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending','in_progress','done','skipped')),
  due_date DATE,
  scheduled_time TIME,
  is_micro BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

-- Circles
CREATE TABLE arah_circles (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  invite_code TEXT UNIQUE,
  max_members INT DEFAULT 5,
  created_by UUID NOT NULL REFERENCES arah_profiles(id) ON DELETE CASCADE,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Circle members
CREATE TABLE arah_circle_members (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  circle_id UUID NOT NULL REFERENCES arah_circles(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES arah_profiles(id) ON DELETE CASCADE,
  role TEXT DEFAULT 'member' CHECK (role IN ('member','admin')),
  joined_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(circle_id, user_id)
);

-- Journal entries
CREATE TABLE arah_journal_entries (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES arah_profiles(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  reflection_type TEXT DEFAULT 'free' CHECK (reflection_type IN ('daily','weekly','gratitude','free')),
  ai_response TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Notifications
CREATE TABLE arah_notifications (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES arah_profiles(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('reminder','motivation','alert','circle','milestone','checkin')),
  title TEXT NOT NULL,
  body TEXT,
  data JSONB DEFAULT '{}',
  is_read BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Consistency scores
CREATE TABLE arah_consistency_scores (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES arah_profiles(id) ON DELETE CASCADE,
  score DECIMAL(5,2) DEFAULT 0,
  streak_days INT DEFAULT 0,
  best_streak INT DEFAULT 0,
  total_active_days INT DEFAULT 0,
  weekly_tasks_completed INT DEFAULT 0,
  weekly_tasks_total INT DEFAULT 0,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id)
);

-- User settings
CREATE TABLE arah_user_settings (
  user_id UUID PRIMARY KEY REFERENCES arah_profiles(id) ON DELETE CASCADE,
  push_enabled BOOLEAN DEFAULT TRUE,
  notification_frequency TEXT DEFAULT 'balanced' CHECK (notification_frequency IN ('minimal','balanced','active')),
  daily_reminder_time TIME DEFAULT '09:00',
  night_reflection BOOLEAN DEFAULT TRUE,
  circle_notifications BOOLEAN DEFAULT TRUE,
  learning_styles TEXT[] DEFAULT '{}',
  interests TEXT[] DEFAULT '{}',
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================
-- INDEXES
-- ============================

CREATE INDEX idx_mood_user_date ON arah_mood_logs(user_id, created_at DESC);
CREATE INDEX idx_tasks_user_status ON arah_tasks(user_id, status);
CREATE INDEX idx_tasks_user_date ON arah_tasks(user_id, due_date);
CREATE INDEX idx_goals_user ON arah_goals(user_id, status);
CREATE INDEX idx_notifications_user ON arah_notifications(user_id, is_read, created_at DESC);
CREATE INDEX idx_journal_user ON arah_journal_entries(user_id, created_at DESC);
CREATE INDEX idx_messages_conv ON arah_messages(conversation_id, created_at);
CREATE INDEX idx_conversations_user ON arah_conversations(user_id, is_active, created_at DESC);
CREATE INDEX idx_circle_members_user ON arah_circle_members(user_id);
CREATE INDEX idx_circle_members_circle ON arah_circle_members(circle_id);

-- ============================
-- TRIGGER: update timestamp
-- ============================

CREATE OR REPLACE FUNCTION update_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_profiles_timestamp BEFORE UPDATE ON arah_profiles
  FOR EACH ROW EXECUTE FUNCTION update_timestamp();
CREATE TRIGGER update_goals_timestamp BEFORE UPDATE ON arah_goals
  FOR EACH ROW EXECUTE FUNCTION update_timestamp();
CREATE TRIGGER update_conversations_timestamp BEFORE UPDATE ON arah_conversations
  FOR EACH ROW EXECUTE FUNCTION update_timestamp();

-- ============================
-- TRIGGER: sync profile on auth signup
-- ============================

CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO arah_profiles (id, display_name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'display_name', 'User'));
  INSERT INTO arah_user_settings (user_id)
  VALUES (NEW.id);
  INSERT INTO arah_consistency_scores (user_id)
  VALUES (NEW.id);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- ============================
-- RLS POLICIES
-- ============================

ALTER TABLE arah_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE arah_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE arah_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE arah_mood_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE arah_goals ENABLE ROW LEVEL SECURITY;
ALTER TABLE arah_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE arah_circles ENABLE ROW LEVEL SECURITY;
ALTER TABLE arah_circle_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE arah_journal_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE arah_notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE arah_consistency_scores ENABLE ROW LEVEL SECURITY;
ALTER TABLE arah_user_settings ENABLE ROW LEVEL SECURITY;

-- User can only access their own data
CREATE POLICY "Users own profile" ON arah_profiles FOR ALL USING (auth.uid() = id);
CREATE POLICY "Users own conversations" ON arah_conversations FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users own messages" ON arah_messages FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users own moods" ON arah_mood_logs FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users own goals" ON arah_goals FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users own tasks" ON arah_tasks FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users own journals" ON arah_journal_entries FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users own notifications" ON arah_notifications FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users own scores" ON arah_consistency_scores FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users own settings" ON arah_user_settings FOR ALL USING (auth.uid() = user_id);

-- Circles: members can see their circles
CREATE POLICY "Circle members view" ON arah_circles FOR SELECT
  USING (id IN (SELECT circle_id FROM arah_circle_members WHERE user_id = auth.uid()) OR created_by = auth.uid());
CREATE POLICY "Circle creator update" ON arah_circles FOR UPDATE
  USING (created_by = auth.uid());
CREATE POLICY "Circle creator delete" ON arah_circles FOR DELETE
  USING (created_by = auth.uid());

-- Circle members: members can see their own membership
CREATE POLICY "Members view own" ON arah_circle_members FOR SELECT
  USING (user_id = auth.uid() OR circle_id IN (SELECT circle_id FROM arah_circle_members WHERE user_id = auth.uid()));
CREATE POLICY "Members join" ON arah_circle_members FOR INSERT
  WITH CHECK (user_id = auth.uid());

-- ============================
-- FUNCTIONS
-- ============================

-- Function to get or create active conversation
CREATE OR REPLACE FUNCTION get_or_create_conversation(p_user_id UUID, p_mood INT DEFAULT NULL)
RETURNS UUID AS $$
DECLARE
  v_conv_id UUID;
BEGIN
  SELECT id INTO v_conv_id FROM arah_conversations
  WHERE user_id = p_user_id AND is_active = TRUE
  ORDER BY created_at DESC LIMIT 1;

  IF v_conv_id IS NULL THEN
    INSERT INTO arah_conversations (user_id, title, mood_at_start)
    VALUES (p_user_id, 'Chat ' || NOW()::TEXT, p_mood)
    RETURNING id INTO v_conv_id;
  END IF;

  RETURN v_conv_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to log mood
CREATE OR REPLACE FUNCTION log_mood(p_score INT, p_energy INT DEFAULT NULL, p_note TEXT DEFAULT NULL)
RETURNS UUID AS $$
DECLARE
  v_id UUID;
BEGIN
  INSERT INTO arah_mood_logs (user_id, mood_score, energy_level, note)
  VALUES (auth.uid(), p_score, p_energy, p_note)
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to update consistency score
CREATE OR REPLACE FUNCTION update_consistency_score(p_user_id UUID)
RETURNS VOID AS $$
DECLARE
  v_streak INT;
  v_best INT;
  v_active INT;
  v_completed INT;
  v_total INT;
BEGIN
  -- Calculate streak
  WITH daily_activity AS (
    SELECT DISTINCT created_at::DATE as activity_date
    FROM arah_mood_logs
    WHERE user_id = p_user_id
    UNION
    SELECT DISTINCT created_at::DATE
    FROM arah_tasks
    WHERE user_id = p_user_id AND status = 'done'
    UNION
    SELECT DISTINCT created_at::DATE
    FROM arah_messages
    WHERE user_id = p_user_id AND role = 'user'
  ), streak_calc AS (
    SELECT activity_date, ROW_NUMBER() OVER (ORDER BY activity_date DESC) as rn
    FROM daily_activity
  )
  SELECT COUNT(*) INTO v_streak FROM streak_calc
  WHERE activity_date = CURRENT_DATE - (rn - 1)::INT;

  -- Get best streak (simplified)
  SELECT COALESCE(MAX(streak_days), 0) INTO v_best FROM arah_consistency_scores WHERE user_id = p_user_id;

  -- Count active days
  SELECT COUNT(*) INTO v_active FROM (
    SELECT DISTINCT created_at::DATE FROM arah_mood_logs WHERE user_id = p_user_id
    UNION
    SELECT DISTINCT created_at::DATE FROM arah_tasks WHERE user_id = p_user_id AND status = 'done'
  ) d;

  -- Weekly tasks
  SELECT
    COUNT(*) FILTER (WHERE status = 'done'),
    COUNT(*)
  INTO v_completed, v_total
  FROM arah_tasks
  WHERE user_id = p_user_id
    AND created_at >= DATE_TRUNC('week', NOW());

  INSERT INTO arah_consistency_scores (user_id, score, streak_days, best_streak, total_active_days, weekly_tasks_completed, weekly_tasks_total)
  VALUES (p_user_id,
    CASE WHEN v_total > 0 THEN (v_completed::DECIMAL / v_total * 50) + LEAST(v_streak * 5, 50) ELSE 0 END,
    v_streak, GREATEST(v_best, v_streak), v_active, v_completed, v_total)
  ON CONFLICT (user_id) DO UPDATE SET
    score = CASE WHEN EXCLUDED.weekly_tasks_total > 0 THEN (EXCLUDED.weekly_tasks_completed::DECIMAL / EXCLUDED.weekly_tasks_total * 50) + LEAST(EXCLUDED.streak_days * 5, 50) ELSE 0 END,
    streak_days = EXCLUDED.streak_days,
    best_streak = GREATEST(arah_consistency_scores.best_streak, EXCLUDED.streak_days),
    total_active_days = EXCLUDED.total_active_days,
    weekly_tasks_completed = EXCLUDED.weekly_tasks_completed,
    weekly_tasks_total = EXCLUDED.weekly_tasks_total,
    updated_at = NOW();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to create monthly partitions
CREATE OR REPLACE FUNCTION create_monthly_partitions()
RETURNS VOID AS $$
DECLARE
  v_start DATE;
  v_end DATE;
BEGIN
  v_start := DATE_TRUNC('month', NOW());
  v_end := v_start + INTERVAL '2 months';

  -- Conversations partitions
  IF NOT EXISTS (SELECT FROM pg_class WHERE relname = 'arah_conversations_' || TO_CHAR(v_start, 'YYYY_MM')) THEN
    EXECUTE 'CREATE TABLE arah_conversations_' || TO_CHAR(v_start, 'YYYY_MM') ||
      ' PARTITION OF arah_conversations FOR VALUES FROM (''' || v_start ||
      ''') TO (''' || v_end || ''')';
  END IF;

  -- Messages partitions
  IF NOT EXISTS (SELECT FROM pg_class WHERE relname = 'arah_messages_' || TO_CHAR(v_start, 'YYYY_MM')) THEN
    EXECUTE 'CREATE TABLE arah_messages_' || TO_CHAR(v_start, 'YYYY_MM') ||
      ' PARTITION OF arah_messages FOR VALUES FROM (''' || v_start ||
      ''') TO (''' || v_end || ''')';
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Run initial partition creation
SELECT create_monthly_partitions();
