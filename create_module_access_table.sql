-- Create module_access table for controlling access to different modules
CREATE TABLE IF NOT EXISTS module_access (
  user_id TEXT REFERENCES user_subscriptions(user_id),
  module TEXT NOT NULL,
  has_access BOOLEAN DEFAULT FALSE,
  PRIMARY KEY (user_id, module)
);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_module_access_user_id ON module_access(user_id);

-- Add comment to table
COMMENT ON TABLE module_access IS 'Controls user access to different application modules';

-- Insert default access rules for subscription levels
INSERT INTO module_access (user_id, module, has_access)
VALUES
-- Free tier users get access to basic modules
('default_free', 'workspace', TRUE),
('default_free', 'blog', TRUE),
('default_free', 'market_insights', FALSE),
('default_free', 'linguistics', FALSE),
('default_free', 'crm', FALSE);

-- Create function to set default module access based on subscription level
CREATE OR REPLACE FUNCTION set_default_module_access()
RETURNS TRIGGER AS $$
BEGIN
  -- For free tier
  IF NEW.subscription_level = 'free' THEN
    INSERT INTO module_access (user_id, module, has_access)
    VALUES
      (NEW.user_id, 'workspace', TRUE),
      (NEW.user_id, 'blog', TRUE),
      (NEW.user_id, 'market_insights', FALSE),
      (NEW.user_id, 'linguistics', FALSE),
      (NEW.user_id, 'crm', FALSE);
  
  -- For ASM tier
  ELSIF NEW.subscription_level = 'asm' THEN
    INSERT INTO module_access (user_id, module, has_access)
    VALUES
      (NEW.user_id, 'workspace', TRUE),
      (NEW.user_id, 'blog', TRUE),
      (NEW.user_id, 'market_insights', TRUE),
      (NEW.user_id, 'linguistics', TRUE),
      (NEW.user_id, 'crm', FALSE);
  
  -- For RSM tier
  ELSIF NEW.subscription_level = 'rsm' THEN
    INSERT INTO module_access (user_id, module, has_access)
    VALUES
      (NEW.user_id, 'workspace', TRUE),
      (NEW.user_id, 'blog', TRUE),
      (NEW.user_id, 'market_insights', TRUE),
      (NEW.user_id, 'linguistics', TRUE),
      (NEW.user_id, 'crm', TRUE);
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to automatically set module access when a new subscription is added
CREATE TRIGGER set_default_module_access_trigger
AFTER INSERT ON user_subscriptions
FOR EACH ROW
EXECUTE FUNCTION set_default_module_access();
