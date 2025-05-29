-- Create usage logs table for tracking user consumption and billing
CREATE TABLE IF NOT EXISTS usage_logs (
  id SERIAL PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  product_type TEXT NOT NULL, -- 'aiQueries', 'transcriptionMinutes', 'automationRun', etc.
  quantity INTEGER DEFAULT 1,
  metadata JSONB DEFAULT '{}', -- Additional data like filename, transcription_id, etc.
  timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  stripe_usage_record_id TEXT, -- For usage-based billing
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_usage_logs_user_id ON usage_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_usage_logs_user_timestamp ON usage_logs(user_id, timestamp);
CREATE INDEX IF NOT EXISTS idx_usage_logs_product_type ON usage_logs(product_type);
CREATE INDEX IF NOT EXISTS idx_usage_logs_monthly ON usage_logs(user_id, product_type, date_trunc('month', timestamp));

-- Update user_subscriptions table to include plan_id
ALTER TABLE user_subscriptions 
ADD COLUMN IF NOT EXISTS plan_id TEXT DEFAULT 'free',
ADD COLUMN IF NOT EXISTS current_period_end TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS stripe_price_id TEXT;

-- Enable row level security on usage_logs
ALTER TABLE usage_logs ENABLE ROW LEVEL SECURITY;

-- Policy to allow users to view their own usage logs
CREATE POLICY usage_logs_user_policy ON usage_logs
  FOR SELECT USING (user_id = auth.uid());

-- Policy for service role to insert/update usage logs
CREATE POLICY usage_logs_service_policy ON usage_logs
  FOR ALL USING (TRUE);

-- Create a function to get monthly usage summary
CREATE OR REPLACE FUNCTION get_monthly_usage(p_user_id UUID, p_month DATE DEFAULT date_trunc('month', NOW())::DATE)
RETURNS TABLE(
  product_type TEXT,
  total_quantity BIGINT
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    ul.product_type,
    SUM(ul.quantity) as total_quantity
  FROM usage_logs ul
  WHERE ul.user_id = p_user_id
    AND date_trunc('month', ul.timestamp) = date_trunc('month', p_month::TIMESTAMP)
  GROUP BY ul.product_type;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create a function to check if user can perform action
CREATE OR REPLACE FUNCTION check_user_limit(
  p_user_id UUID,
  p_product_type TEXT,
  p_quantity INTEGER DEFAULT 1
)
RETURNS JSONB AS $$
DECLARE
  v_subscription RECORD;
  v_plan_limits JSONB;
  v_current_usage BIGINT;
  v_limit INTEGER;
BEGIN
  -- Get user subscription
  SELECT * INTO v_subscription
  FROM user_subscriptions 
  WHERE user_id = p_user_id;
  
  -- Default to free plan if no subscription
  IF v_subscription IS NULL THEN
    v_subscription.plan_id := 'free';
  END IF;
  
  -- Define plan limits (would be better to store this in a plans table)
  v_plan_limits := CASE v_subscription.plan_id
    WHEN 'free' THEN '{"aiQueries": 10, "transcriptionMinutes": 30}'::JSONB
    WHEN 'starter' THEN '{"aiQueries": 100, "transcriptionMinutes": 300}'::JSONB
    WHEN 'professional' THEN '{"aiQueries": 1000, "transcriptionMinutes": 1500}'::JSONB
    WHEN 'enterprise' THEN '{"aiQueries": -1, "transcriptionMinutes": -1}'::JSONB -- -1 = unlimited
    ELSE '{"aiQueries": 10, "transcriptionMinutes": 30}'::JSONB
  END;
  
  -- Get limit for this product type
  v_limit := (v_plan_limits->p_product_type)::INTEGER;
  
  -- Unlimited access
  IF v_limit = -1 THEN
    RETURN jsonb_build_object(
      'allowed', true,
      'remaining', 'unlimited',
      'current_usage', 0
    );
  END IF;
  
  -- Get current month usage
  SELECT COALESCE(SUM(quantity), 0) INTO v_current_usage
  FROM usage_logs
  WHERE user_id = p_user_id
    AND product_type = p_product_type
    AND date_trunc('month', timestamp) = date_trunc('month', NOW());
  
  -- Check if would exceed limit
  IF v_current_usage + p_quantity > v_limit THEN
    RETURN jsonb_build_object(
      'allowed', false,
      'remaining', GREATEST(0, v_limit - v_current_usage),
      'current_usage', v_current_usage,
      'overage', (v_current_usage + p_quantity) - v_limit
    );
  END IF;
  
  RETURN jsonb_build_object(
    'allowed', true,
    'remaining', v_limit - v_current_usage - p_quantity,
    'current_usage', v_current_usage
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;