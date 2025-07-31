-- Create user_email_usage table for tracking monthly email usage (RepX1-3 tiers)
CREATE TABLE IF NOT EXISTS user_email_usage (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  month VARCHAR(7) NOT NULL, -- Format: YYYY-MM
  emails_sent INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, month)
);

-- Create index for faster lookups
CREATE INDEX idx_user_email_usage_lookup ON user_email_usage(user_id, month);

-- Create function to increment email usage
CREATE OR REPLACE FUNCTION increment_email_usage(
  p_user_id UUID,
  p_month VARCHAR(7),
  p_count INTEGER DEFAULT 1
)
RETURNS VOID AS $$
BEGIN
  INSERT INTO user_email_usage (user_id, month, emails_sent, updated_at)
  VALUES (p_user_id, p_month, p_count, NOW())
  ON CONFLICT (user_id, month)
  DO UPDATE SET 
    emails_sent = user_email_usage.emails_sent + p_count,
    updated_at = NOW();
END;
$$ LANGUAGE plpgsql;

-- Add RLS policies
ALTER TABLE user_email_usage ENABLE ROW LEVEL SECURITY;

-- Users can view their own usage
CREATE POLICY "Users can view own email usage" ON user_email_usage
  FOR SELECT USING (auth.uid() = user_id);

-- Service role can manage all usage
CREATE POLICY "Service role can manage email usage" ON user_email_usage
  FOR ALL USING (auth.role() = 'service_role');