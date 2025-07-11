-- Complete Database Setup for Supabase
-- Run this entire script in your Supabase SQL Editor

-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. Create user_subscriptions table
CREATE TABLE IF NOT EXISTS user_subscriptions (
  user_id TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  subscription_level TEXT NOT NULL CHECK (subscription_level IN ('free', 'asm', 'rsm')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  stripe_customer_id TEXT,
  stripe_subscription_id TEXT,
  stripe_price_id TEXT,
  stripe_subscription_status TEXT,
  stripe_current_period_end TIMESTAMP WITH TIME ZONE,
  stripe_cancel_at_period_end BOOLEAN DEFAULT false
);

-- Create index on email for faster lookups
CREATE INDEX IF NOT EXISTS idx_user_subscriptions_email ON user_subscriptions(email);

-- Create function to automatically update the updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
   NEW.updated_at = NOW();
   RETURN NEW;
END;
$$ language 'plpgsql';

-- Create trigger for user_subscriptions
DROP TRIGGER IF EXISTS update_user_subscriptions_updated_at ON user_subscriptions;
CREATE TRIGGER update_user_subscriptions_updated_at
BEFORE UPDATE ON user_subscriptions
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

-- 2. Create transcriptions table
CREATE TABLE IF NOT EXISTS transcriptions (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  call_sid TEXT UNIQUE,
  recording_url TEXT,
  transcription_text TEXT,
  transcription_status TEXT DEFAULT 'pending',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  metadata JSONB DEFAULT '{}'::jsonb
);

-- Create indexes for transcriptions
CREATE INDEX IF NOT EXISTS idx_transcriptions_call_sid ON transcriptions(call_sid);
CREATE INDEX IF NOT EXISTS idx_transcriptions_status ON transcriptions(transcription_status);

-- 3. Create activity_log table
CREATE TABLE IF NOT EXISTS activity_log (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id TEXT,
  action TEXT NOT NULL,
  details JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 4. Create callback_requests table  
CREATE TABLE IF NOT EXISTS callback_requests (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  phone_number TEXT NOT NULL,
  name TEXT,
  email TEXT,
  preferred_time TEXT,
  notes TEXT,
  status TEXT DEFAULT 'pending',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 5. Create emergency_calls table
CREATE TABLE IF NOT EXISTS emergency_calls (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  caller_number TEXT NOT NULL,
  emergency_type TEXT,
  location TEXT,
  details JSONB,
  status TEXT DEFAULT 'active',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 6. Create voice_calls table
CREATE TABLE IF NOT EXISTS voice_calls (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  call_sid TEXT UNIQUE,
  from_number TEXT,
  to_number TEXT,
  duration INTEGER,
  status TEXT,
  recording_url TEXT,
  transcript TEXT,
  metadata JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_activity_log_user_id ON activity_log(user_id);
CREATE INDEX IF NOT EXISTS idx_activity_log_created_at ON activity_log(created_at);
CREATE INDEX IF NOT EXISTS idx_callback_requests_status ON callback_requests(status);
CREATE INDEX IF NOT EXISTS idx_emergency_calls_status ON emergency_calls(status);
CREATE INDEX IF NOT EXISTS idx_voice_calls_call_sid ON voice_calls(call_sid);

-- Enable Row Level Security on all tables
ALTER TABLE user_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE transcriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE activity_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE callback_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE emergency_calls ENABLE ROW LEVEL SECURITY;
ALTER TABLE voice_calls ENABLE ROW LEVEL SECURITY;

-- Create basic RLS policies (you can customize these based on your needs)

-- User subscriptions - users can only see their own data
CREATE POLICY "Users can view own subscription" ON user_subscriptions
    FOR SELECT USING (auth.uid()::text = user_id OR auth.jwt() ->> 'email' = email);

CREATE POLICY "Service role can manage subscriptions" ON user_subscriptions
    FOR ALL USING (auth.role() = 'service_role');

-- Transcriptions - authenticated users can view
CREATE POLICY "Authenticated users can view transcriptions" ON transcriptions
    FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Service role can manage transcriptions" ON transcriptions
    FOR ALL USING (auth.role() = 'service_role');

-- Activity log - users can see their own activity
CREATE POLICY "Users can view own activity" ON activity_log
    FOR SELECT USING (auth.uid()::text = user_id);

CREATE POLICY "Service role can manage activity" ON activity_log
    FOR ALL USING (auth.role() = 'service_role');

-- Callback requests - authenticated users can create, service role can manage
CREATE POLICY "Authenticated users can create callback requests" ON callback_requests
    FOR INSERT WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Service role can manage callback requests" ON callback_requests
    FOR ALL USING (auth.role() = 'service_role');

-- Emergency calls - anyone can create, service role can manage
CREATE POLICY "Anyone can create emergency calls" ON emergency_calls
    FOR INSERT WITH CHECK (true);

CREATE POLICY "Service role can manage emergency calls" ON emergency_calls
    FOR ALL USING (auth.role() = 'service_role');

-- Voice calls - authenticated users can view, service role can manage
CREATE POLICY "Authenticated users can view voice calls" ON voice_calls
    FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Service role can manage voice calls" ON voice_calls
    FOR ALL USING (auth.role() = 'service_role');

-- Grant necessary permissions
GRANT USAGE ON SCHEMA public TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO service_role;

-- Insert a default free subscription (optional)
INSERT INTO user_subscriptions (user_id, email, subscription_level) 
VALUES ('default_free', 'default_free@example.com', 'free')
ON CONFLICT (user_id) DO NOTHING;