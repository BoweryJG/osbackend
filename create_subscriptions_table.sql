-- Create user_subscriptions table
CREATE TABLE user_subscriptions (
  user_id TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  subscription_level TEXT NOT NULL CHECK (subscription_level IN ('free', 'asm', 'rsm')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create index on email for faster lookups
CREATE INDEX idx_user_subscriptions_email ON user_subscriptions(email);

-- Insert default subscription levels
INSERT INTO user_subscriptions (user_id, email, subscription_level) VALUES
('default_free', 'default_free@example.com', 'free');

-- Create function to automatically update the updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
   NEW.updated_at = NOW();
   RETURN NEW;
END;
$$ language 'plpgsql';

-- Create trigger to call the function
CREATE TRIGGER update_user_subscriptions_updated_at
BEFORE UPDATE ON user_subscriptions
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

-- Comments explaining subscription levels
COMMENT ON TABLE user_subscriptions IS 'Stores user subscription information for model access control';
COMMENT ON COLUMN user_subscriptions.subscription_level IS 'Subscription levels:
- free: Access to free models only
- asm: Access to free models and basic paid models
- rsm: Access to all models including premium models';
