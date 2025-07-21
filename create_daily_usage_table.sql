-- Create daily usage tracking table for Canvas scans
-- This tracks daily limits per user for RepX subscription tiers

CREATE TABLE IF NOT EXISTS daily_usage (
  id SERIAL PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  scans_used INTEGER NOT NULL DEFAULT 0,
  scan_type TEXT DEFAULT 'canvas', -- 'canvas', 'streamlined', 'adaptive', 'instant', etc.
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  -- Ensure only one record per user per date
  UNIQUE(user_id, date)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_daily_usage_user_date ON daily_usage(user_id, date);
CREATE INDEX IF NOT EXISTS idx_daily_usage_date ON daily_usage(date);
CREATE INDEX IF NOT EXISTS idx_daily_usage_user_id ON daily_usage(user_id);

-- Enable row level security
ALTER TABLE daily_usage ENABLE ROW LEVEL SECURITY;

-- Policy to allow users to view their own usage
CREATE POLICY daily_usage_user_policy ON daily_usage
  FOR SELECT USING (user_id = auth.uid());

-- Policy for service role to insert/update
CREATE POLICY daily_usage_service_policy ON daily_usage
  FOR ALL USING (TRUE);

-- Function to increment daily usage (upsert)
CREATE OR REPLACE FUNCTION increment_daily_usage(
  p_user_id UUID,
  p_scan_type TEXT DEFAULT 'canvas',
  p_increment INTEGER DEFAULT 1
)
RETURNS INTEGER AS $$
DECLARE
  v_new_count INTEGER;
BEGIN
  INSERT INTO daily_usage (user_id, date, scans_used, scan_type, updated_at)
  VALUES (p_user_id, CURRENT_DATE, p_increment, p_scan_type, NOW())
  ON CONFLICT (user_id, date)
  DO UPDATE SET 
    scans_used = daily_usage.scans_used + p_increment,
    updated_at = NOW()
  RETURNING scans_used INTO v_new_count;
  
  RETURN v_new_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get daily usage for a user
CREATE OR REPLACE FUNCTION get_daily_usage(
  p_user_id UUID,
  p_date DATE DEFAULT CURRENT_DATE
)
RETURNS INTEGER AS $$
DECLARE
  v_usage INTEGER;
BEGIN
  SELECT COALESCE(scans_used, 0) INTO v_usage
  FROM daily_usage
  WHERE user_id = p_user_id AND date = p_date;
  
  RETURN COALESCE(v_usage, 0);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to check RepX subscription limits
CREATE OR REPLACE FUNCTION check_repx_scan_limit(
  p_user_id UUID
)
RETURNS JSONB AS $$
DECLARE
  v_subscription RECORD;
  v_daily_limit INTEGER;
  v_current_usage INTEGER;
  v_tier TEXT;
BEGIN
  -- Get user subscription from user_profiles table
  SELECT subscription INTO v_subscription
  FROM user_profiles 
  WHERE id = p_user_id;
  
  -- Extract tier from subscription JSON
  v_tier := COALESCE(v_subscription.subscription->>'tier', 'free');
  
  -- Define RepX tier limits
  v_daily_limit := CASE v_tier
    WHEN 'free' THEN 3
    WHEN 'repx1' THEN 0      -- Phone only, no Canvas scans
    WHEN 'repx2' THEN 10
    WHEN 'repx3' THEN 25
    WHEN 'repx4' THEN 50
    WHEN 'repx5' THEN 999999 -- Unlimited
    ELSE 3 -- Default to free tier
  END;
  
  -- Get today's usage
  SELECT get_daily_usage(p_user_id) INTO v_current_usage;
  
  -- Special case for RepX1 (phone-only tier)
  IF v_tier = 'repx1' THEN
    RETURN jsonb_build_object(
      'allowed', false,
      'tier', v_tier,
      'daily_limit', 0,
      'current_usage', v_current_usage,
      'remaining', 0,
      'message', 'RepX1 includes phone services only. Upgrade to RepX2+ for Canvas scans.'
    );
  END IF;
  
  -- Unlimited tier
  IF v_daily_limit = 999999 THEN
    RETURN jsonb_build_object(
      'allowed', true,
      'tier', v_tier,
      'daily_limit', v_daily_limit,
      'current_usage', v_current_usage,
      'remaining', 999999,
      'message', 'Unlimited scans available'
    );
  END IF;
  
  -- Regular tier with daily limits
  RETURN jsonb_build_object(
    'allowed', v_current_usage < v_daily_limit,
    'tier', v_tier,
    'daily_limit', v_daily_limit,
    'current_usage', v_current_usage,
    'remaining', GREATEST(0, v_daily_limit - v_current_usage),
    'message', CASE 
      WHEN v_current_usage >= v_daily_limit THEN 'Daily scan limit reached'
      WHEN v_current_usage >= v_daily_limit - 2 THEN 'Approaching daily limit'
      ELSE 'Scans available'
    END
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Clean up old daily usage records (keep last 90 days)
CREATE OR REPLACE FUNCTION cleanup_old_daily_usage()
RETURNS INTEGER AS $$
DECLARE
  v_deleted INTEGER;
BEGIN
  DELETE FROM daily_usage 
  WHERE date < CURRENT_DATE - INTERVAL '90 days';
  
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Example usage tracking record for logging
INSERT INTO usage_logs (user_id, product_type, quantity, metadata)
SELECT 
  user_id,
  'canvas_scans' as product_type,
  scans_used as quantity,
  jsonb_build_object('scan_type', scan_type, 'date', date) as metadata
FROM daily_usage 
WHERE date = CURRENT_DATE
ON CONFLICT DO NOTHING;