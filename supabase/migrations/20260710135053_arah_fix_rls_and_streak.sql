-- ============================
-- FIX: Missing INSERT RLS for circles
-- ============================

CREATE POLICY "Anyone can create circles" ON arah_circles FOR INSERT
  WITH CHECK (auth.uid() = created_by);

-- ============================
-- FIX: Streak calculation — break at first gap
-- ============================

CREATE OR REPLACE FUNCTION update_consistency_score(p_user_id UUID)
RETURNS VOID AS $$
DECLARE
  v_streak INT := 0;
  v_best INT;
  v_active INT;
  v_completed INT;
  v_total INT;
  v_prev_date DATE;
  v_curr_date DATE;
  v_is_consecutive BOOLEAN := TRUE;
BEGIN
  -- Calculate streak (consecutive days, break at first gap)
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
  ), ordered_days AS (
    SELECT activity_date
    FROM daily_activity
    ORDER BY activity_date DESC
  )
  SELECT COUNT(*) INTO v_streak FROM (
    SELECT activity_date,
      CASE WHEN
        LAG(activity_date) OVER (ORDER BY activity_date DESC) IS NULL
        OR activity_date = LAG(activity_date) OVER (ORDER BY activity_date DESC) - 1
      THEN 1 ELSE 0 END as is_contiguous
    FROM ordered_days
  ) sub WHERE is_contiguous = 1;

  -- Get best streak from history
  SELECT COALESCE(MAX(best_streak), 0) INTO v_best FROM arah_consistency_scores WHERE user_id = p_user_id;

  -- Count active days (total distinct days)
  SELECT COUNT(*) INTO v_active FROM (
    SELECT DISTINCT created_at::DATE FROM arah_mood_logs WHERE user_id = p_user_id
    UNION
    SELECT DISTINCT created_at::DATE FROM arah_tasks WHERE user_id = p_user_id AND status = 'done'
  ) d;

  -- Weekly tasks completed
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

-- ============================
-- FIX: Partition creation with proper timestamptz bounds
-- ============================

CREATE OR REPLACE FUNCTION create_monthly_partitions()
RETURNS VOID AS $$
DECLARE
  v_start TIMESTAMPTZ;
  v_end TIMESTAMPTZ;
BEGIN
  v_start := DATE_TRUNC('month', NOW());
  v_end := v_start + INTERVAL '2 months';

  IF NOT EXISTS (SELECT FROM pg_class WHERE relname = 'arah_conversations_' || TO_CHAR(v_start, 'YYYY_MM')) THEN
    EXECUTE 'CREATE TABLE arah_conversations_' || TO_CHAR(v_start, 'YYYY_MM') ||
      ' PARTITION OF arah_conversations FOR VALUES FROM (''' || v_start ||
      ''') TO (''' || v_end || ''')';
  END IF;

  IF NOT EXISTS (SELECT FROM pg_class WHERE relname = 'arah_messages_' || TO_CHAR(v_start, 'YYYY_MM')) THEN
    EXECUTE 'CREATE TABLE arah_messages_' || TO_CHAR(v_start, 'YYYY_MM') ||
      ' PARTITION OF arah_messages FOR VALUES FROM (''' || v_start ||
      ''') TO (''' || v_end || ''')';
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
