-- Add Stripe-related fields to user_subscriptions
ALTER TABLE IF EXISTS user_subscriptions
  ADD COLUMN IF NOT EXISTS stripe_customer_id TEXT,
  ADD COLUMN IF NOT EXISTS stripe_subscription_id TEXT,
  ADD COLUMN IF NOT EXISTS subscription_status TEXT DEFAULT 'inactive';

-- Indexes for quick lookup
CREATE INDEX IF NOT EXISTS idx_user_subscriptions_customer_id ON user_subscriptions(stripe_customer_id);
CREATE INDEX IF NOT EXISTS idx_user_subscriptions_subscription_id ON user_subscriptions(stripe_subscription_id);

-- Comments for documentation
COMMENT ON COLUMN user_subscriptions.stripe_customer_id IS 'Stripe customer identifier';
COMMENT ON COLUMN user_subscriptions.stripe_subscription_id IS 'Stripe subscription identifier';
COMMENT ON COLUMN user_subscriptions.subscription_status IS 'Current status from Stripe: active, past_due, canceled, etc.';
