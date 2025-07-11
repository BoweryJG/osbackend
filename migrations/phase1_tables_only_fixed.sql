-- ============================================
-- PHASE 1: CREATE TABLES ONLY (NO RLS) - FIXED
-- ============================================
-- This creates all tables without RLS policies
-- Fixed version with proper quote escaping
-- ============================================

-- ============================================
-- SHARED FUNCTIONS
-- ============================================

-- Create updated_at trigger function (shared across all tables)
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- COMMUNICATION TABLES
-- ============================================

-- Phone numbers table
CREATE TABLE IF NOT EXISTS phone_numbers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phone_number VARCHAR(20) UNIQUE NOT NULL,
  friendly_name VARCHAR(255),
  capabilities JSONB DEFAULT '{"voice": true, "SMS": true, "MMS": true}',
  provider VARCHAR(50) DEFAULT 'twilio',
  provider_sid VARCHAR(100),
  monthly_cost DECIMAL(10,2) DEFAULT 10.00,
  status VARCHAR(20) DEFAULT 'active',
  assigned_to UUID REFERENCES auth.users(id),
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Call logs table
CREATE TABLE IF NOT EXISTS call_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  call_sid VARCHAR(100) UNIQUE,
  phone_number_id UUID REFERENCES phone_numbers(id),
  phone_number_sid VARCHAR(255),
  from_number VARCHAR(20),
  to_number VARCHAR(20),
  direction VARCHAR(10) CHECK (direction IN ('inbound', 'outbound')),
  status VARCHAR(20),
  duration INTEGER DEFAULT 0,
  recording_url TEXT,
  recording_sid VARCHAR(100),
  transcription TEXT,
  transcription_id UUID,
  ai_summary TEXT,
  price DECIMAL(10,4),
  price_unit VARCHAR(3) DEFAULT 'USD',
  user_id UUID REFERENCES auth.users(id),
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  answered_at TIMESTAMP WITH TIME ZONE,
  ended_at TIMESTAMP WITH TIME ZONE
);

-- Recordings table
CREATE TABLE IF NOT EXISTS call_recordings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recording_sid VARCHAR(255) UNIQUE NOT NULL,
  call_sid VARCHAR(255) NOT NULL,
  recording_url TEXT NOT NULL,
  duration INTEGER NOT NULL,
  transcription_id UUID,
  status VARCHAR(50) DEFAULT 'pending',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- SMS conversations for threading
CREATE TABLE IF NOT EXISTS sms_conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phone_number_id UUID REFERENCES phone_numbers(id),
  participant_number VARCHAR(20),
  last_message_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  last_message_preview TEXT,
  unread_count INTEGER DEFAULT 0,
  is_archived BOOLEAN DEFAULT FALSE,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- SMS messages table
CREATE TABLE IF NOT EXISTS sms_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_sid VARCHAR(100) UNIQUE,
  phone_number_id UUID REFERENCES phone_numbers(id),
  from_number VARCHAR(20),
  to_number VARCHAR(20),
  body TEXT,
  num_segments INTEGER DEFAULT 1,
  direction VARCHAR(10) CHECK (direction IN ('inbound', 'outbound')),
  status VARCHAR(20),
  price DECIMAL(10,4),
  price_unit VARCHAR(3) DEFAULT 'USD',
  error_code VARCHAR(20),
  error_message TEXT,
  user_id UUID REFERENCES auth.users(id),
  conversation_id UUID REFERENCES sms_conversations(id),
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  sent_at TIMESTAMP WITH TIME ZONE,
  delivered_at TIMESTAMP WITH TIME ZONE
);

-- Email templates table
CREATE TABLE IF NOT EXISTS email_templates (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  subject TEXT NOT NULL,
  html_content TEXT NOT NULL,
  text_content TEXT,
  variables JSONB DEFAULT '[]',
  category TEXT,
  user_id UUID NOT NULL REFERENCES auth.users(id),
  is_active BOOLEAN DEFAULT true,
  usage_count INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Email campaigns table
CREATE TABLE IF NOT EXISTS email_campaigns (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  subject TEXT NOT NULL,
  html_template TEXT NOT NULL,
  text_template TEXT,
  template_id UUID REFERENCES email_templates(id),
  recipients JSONB NOT NULL DEFAULT '[]',
  schedule JSONB NOT NULL DEFAULT '[]',
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'scheduled', 'running', 'completed', 'cancelled')),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  stats JSONB DEFAULT '{"sent": 0, "opened": 0, "clicked": 0, "failed": 0}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  started_at TIMESTAMP WITH TIME ZONE,
  completed_at TIMESTAMP WITH TIME ZONE
);

-- Email logs table
CREATE TABLE IF NOT EXISTS email_logs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  message_id TEXT,
  from_email TEXT NOT NULL,
  to_email TEXT NOT NULL,
  subject TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('sent', 'failed', 'bounced', 'opened', 'clicked')),
  sent_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  campaign_id UUID REFERENCES email_campaigns(id),
  user_id UUID REFERENCES auth.users(id),
  error TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Usage records for tracking all communication costs
CREATE TABLE IF NOT EXISTS communication_usage_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phone_number_id UUID REFERENCES phone_numbers(id),
  user_id UUID REFERENCES auth.users(id),
  type VARCHAR(30) CHECK (type IN ('call_minutes', 'sms_sent', 'mms_sent', 'recording_storage', 'email_sent')),
  quantity DECIMAL(10,2),
  unit_cost DECIMAL(10,4),
  total_cost DECIMAL(10,4),
  billing_period DATE,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Communication system configuration
CREATE TABLE IF NOT EXISTS communication_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id),
  config_type VARCHAR(50),
  config_data JSONB,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================
-- CANVAS AI AGENTS TABLES
-- ============================================

-- Create Canvas AI Agents table
CREATE TABLE IF NOT EXISTS canvas_ai_agents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  avatar_url TEXT,
  specialty TEXT[] DEFAULT '{}',
  personality JSONB DEFAULT '{
    "tone": "professional",
    "verbosity": "concise",
    "approach": "consultative",
    "temperature": 0.7
  }'::jsonb,
  system_prompt TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create Agent Conversations table
CREATE TABLE IF NOT EXISTS agent_conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  agent_id UUID REFERENCES canvas_ai_agents(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  messages JSONB[] DEFAULT '{}',
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create Agent Feedback table
CREATE TABLE IF NOT EXISTS agent_feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID REFERENCES agent_conversations(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  rating INTEGER CHECK (rating >= 1 AND rating <= 5),
  feedback TEXT,
  outcome JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create Agent Interaction Logs table
CREATE TABLE IF NOT EXISTS agent_interaction_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID REFERENCES agent_conversations(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  metrics JSONB DEFAULT '{}',
  timestamp TIMESTAMPTZ DEFAULT NOW()
);

-- Create Profiles Table (if needed)
CREATE TABLE IF NOT EXISTS profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT,
  full_name TEXT,
  avatar_url TEXT,
  is_admin BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- INDEXES FOR PERFORMANCE
-- ============================================

-- Phone system indexes
CREATE INDEX IF NOT EXISTS idx_phone_numbers_assigned_to ON phone_numbers(assigned_to);
CREATE INDEX IF NOT EXISTS idx_phone_numbers_status ON phone_numbers(status);
CREATE INDEX IF NOT EXISTS idx_call_logs_user_id ON call_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_call_logs_created_at ON call_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_call_logs_phone_number ON call_logs(from_number, to_number);
CREATE INDEX IF NOT EXISTS idx_call_logs_call_sid ON call_logs(call_sid);
CREATE INDEX IF NOT EXISTS idx_call_recordings_recording_sid ON call_recordings(recording_sid);
CREATE INDEX IF NOT EXISTS idx_call_recordings_call_sid ON call_recordings(call_sid);

-- SMS indexes
CREATE INDEX IF NOT EXISTS idx_sms_messages_user_id ON sms_messages(user_id);
CREATE INDEX IF NOT EXISTS idx_sms_messages_created_at ON sms_messages(created_at);
CREATE INDEX IF NOT EXISTS idx_sms_messages_conversation ON sms_messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_sms_messages_message_sid ON sms_messages(message_sid);
CREATE INDEX IF NOT EXISTS idx_sms_messages_from_number ON sms_messages(from_number);
CREATE INDEX IF NOT EXISTS idx_sms_messages_to_number ON sms_messages(to_number);
CREATE INDEX IF NOT EXISTS idx_sms_conversations_phone ON sms_conversations(phone_number_id, participant_number);

-- Email indexes
CREATE INDEX IF NOT EXISTS idx_email_logs_campaign_id ON email_logs(campaign_id);
CREATE INDEX IF NOT EXISTS idx_email_logs_user_id ON email_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_email_logs_sent_at ON email_logs(sent_at);
CREATE INDEX IF NOT EXISTS idx_email_campaigns_user_id ON email_campaigns(user_id);
CREATE INDEX IF NOT EXISTS idx_email_campaigns_status ON email_campaigns(status);
CREATE INDEX IF NOT EXISTS idx_email_templates_user_id ON email_templates(user_id);
CREATE INDEX IF NOT EXISTS idx_email_templates_category ON email_templates(category);

-- Canvas agent indexes
CREATE INDEX IF NOT EXISTS idx_agent_conversations_user_id ON agent_conversations(user_id);
CREATE INDEX IF NOT EXISTS idx_agent_conversations_agent_id ON agent_conversations(agent_id);
CREATE INDEX IF NOT EXISTS idx_agent_conversations_created_at ON agent_conversations(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_agent_feedback_conversation_id ON agent_feedback(conversation_id);
CREATE INDEX IF NOT EXISTS idx_agent_interaction_logs_conversation_id ON agent_interaction_logs(conversation_id);

-- Usage and config indexes
CREATE INDEX IF NOT EXISTS idx_usage_billing ON communication_usage_records(billing_period, user_id);
CREATE INDEX IF NOT EXISTS idx_config_user_type ON communication_config(user_id, config_type);

-- ============================================
-- DEFAULT DATA (with properly escaped quotes)
-- ============================================

-- Insert default Canvas agents
INSERT INTO canvas_ai_agents (name, avatar_url, specialty, personality, system_prompt)
VALUES 
  (
    'Hunter',
    '/agents/hunter.png',
    ARRAY['Lead Generation', 'Market Research', 'Opportunity Discovery'],
    '{
      "tone": "energetic",
      "verbosity": "concise",
      "approach": "proactive",
      "temperature": 0.8,
      "traits": ["ambitious", "persistent", "resourceful"]
    }'::jsonb,
    'You are Hunter, a high-energy sales agent focused on lead generation and opportunity discovery. You excel at identifying potential prospects, qualifying leads, and uncovering new market opportunities. Be proactive, enthusiastic, and always be looking for the next big opportunity.'
  ),
  (
    'Closer',
    '/agents/closer.png',
    ARRAY['Deal Negotiation', 'Contract Finalization', 'Objection Handling'],
    '{
      "tone": "confident",
      "verbosity": "moderate",
      "approach": "strategic",
      "temperature": 0.7,
      "traits": ["persuasive", "decisive", "results-oriented"]
    }'::jsonb,
    'You are Closer, a seasoned sales professional who specializes in finalizing deals and overcoming objections. You have a talent for negotiation, understanding client needs, and creating win-win solutions. Be confident, strategic, and focused on getting to yes.'
  ),
  (
    'Educator',
    '/agents/educator.png',
    ARRAY['Product Knowledge', 'Training', 'Customer Education'],
    '{
      "tone": "informative",
      "verbosity": "detailed",
      "approach": "consultative",
      "temperature": 0.6,
      "traits": ["patient", "knowledgeable", "articulate"]
    }'::jsonb,
    'You are Educator, a knowledgeable sales consultant who excels at explaining complex products and solutions. You focus on educating prospects and customers, building trust through expertise, and ensuring they understand the value proposition. Be clear, thorough, and always helpful.'
  ),
  (
    'Strategist',
    '/agents/strategist.png',
    ARRAY['Account Planning', 'Long-term Relationships', 'Enterprise Sales'],
    '{
      "tone": "analytical",
      "verbosity": "balanced",
      "approach": "methodical",
      "temperature": 0.7,
      "traits": ["analytical", "visionary", "relationship-focused"]
    }'::jsonb,
    'You are Strategist, a senior sales advisor who specializes in complex, enterprise-level deals and long-term account management. You excel at developing comprehensive sales strategies, building executive relationships, and creating long-term value. Be thoughtful, strategic, and always think several steps ahead.'
  )
ON CONFLICT (name) DO NOTHING;

-- ============================================
-- TRIGGERS (Add after tables are created)
-- ============================================

-- Add updated_at triggers
DO $$
BEGIN
  -- Phone numbers
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_phone_numbers_updated_at') THEN
    CREATE TRIGGER update_phone_numbers_updated_at BEFORE UPDATE ON phone_numbers
      FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  END IF;
  
  -- Call logs
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_call_logs_updated_at') THEN
    CREATE TRIGGER update_call_logs_updated_at BEFORE UPDATE ON call_logs
      FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  END IF;
  
  -- Call recordings
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_call_recordings_updated_at') THEN
    CREATE TRIGGER update_call_recordings_updated_at BEFORE UPDATE ON call_recordings
      FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  END IF;
  
  -- SMS messages
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_sms_messages_updated_at') THEN
    CREATE TRIGGER update_sms_messages_updated_at BEFORE UPDATE ON sms_messages
      FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  END IF;
  
  -- Email campaigns
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_email_campaigns_updated_at') THEN
    CREATE TRIGGER update_email_campaigns_updated_at BEFORE UPDATE ON email_campaigns
      FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  END IF;
  
  -- Email templates
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_email_templates_updated_at') THEN
    CREATE TRIGGER update_email_templates_updated_at BEFORE UPDATE ON email_templates
      FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  END IF;
  
  -- Communication config
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_communication_config_updated_at') THEN
    CREATE TRIGGER update_communication_config_updated_at BEFORE UPDATE ON communication_config
      FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  END IF;
  
  -- Canvas agents
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_canvas_ai_agents_updated_at') THEN
    CREATE TRIGGER update_canvas_ai_agents_updated_at BEFORE UPDATE ON canvas_ai_agents
      FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  END IF;
  
  -- Agent conversations
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_agent_conversations_updated_at') THEN
    CREATE TRIGGER update_agent_conversations_updated_at BEFORE UPDATE ON agent_conversations
      FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  END IF;
  
  -- Profiles
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_profiles_updated_at') THEN
    CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON profiles
      FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  END IF;
END $$;

-- ============================================
-- SMS Conversation Management Function
-- ============================================

CREATE OR REPLACE FUNCTION create_or_update_sms_conversation()
RETURNS TRIGGER AS $$
DECLARE
  v_conversation_id UUID;
  v_participant_number VARCHAR(20);
BEGIN
  -- Determine participant number based on direction
  IF NEW.direction = 'inbound' THEN
    v_participant_number := NEW.from_number;
  ELSE
    v_participant_number := NEW.to_number;
  END IF;

  -- Find or create conversation
  SELECT id INTO v_conversation_id
  FROM sms_conversations
  WHERE phone_number_id = NEW.phone_number_id
    AND participant_number = v_participant_number;

  IF v_conversation_id IS NULL THEN
    INSERT INTO sms_conversations (phone_number_id, participant_number, last_message_preview, last_message_at)
    VALUES (NEW.phone_number_id, v_participant_number, LEFT(NEW.body, 100), NEW.created_at)
    RETURNING id INTO v_conversation_id;
  ELSE
    UPDATE sms_conversations
    SET last_message_preview = LEFT(NEW.body, 100),
        last_message_at = NEW.created_at,
        unread_count = CASE WHEN NEW.direction = 'inbound' THEN unread_count + 1 ELSE unread_count END
    WHERE id = v_conversation_id;
  END IF;

  NEW.conversation_id := v_conversation_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Add trigger for SMS conversation management
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'auto_manage_sms_conversation') THEN
    CREATE TRIGGER auto_manage_sms_conversation
    BEFORE INSERT ON sms_messages
    FOR EACH ROW
    EXECUTE FUNCTION create_or_update_sms_conversation();
  END IF;
END $$;

-- ============================================
-- Profile Creation Function
-- ============================================

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (new.id, new.email, new.raw_user_meta_data->>'full_name')
  ON CONFLICT (id) DO NOTHING;
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Add trigger for profile creation
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger 
    WHERE tgname = 'on_auth_user_created'
  ) THEN
    CREATE TRIGGER on_auth_user_created
      AFTER INSERT ON auth.users
      FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
  END IF;
END $$;

-- ============================================
-- VERIFICATION
-- ============================================

DO $$
DECLARE
    table_count INTEGER;
    agent_count INTEGER;
BEGIN
    -- Count tables
    SELECT COUNT(*) INTO table_count
    FROM information_schema.tables
    WHERE table_schema = 'public'
    AND table_type = 'BASE TABLE'
    AND table_name IN (
        'phone_numbers', 'call_logs', 'call_recordings',
        'sms_messages', 'sms_conversations',
        'email_templates', 'email_campaigns', 'email_logs',
        'communication_usage_records', 'communication_config',
        'canvas_ai_agents', 'agent_conversations',
        'agent_feedback', 'agent_interaction_logs', 'profiles'
    );
    
    -- Count agents
    SELECT COUNT(*) INTO agent_count FROM canvas_ai_agents;
    
    RAISE NOTICE 'Phase 1 Complete: Created % tables', table_count;
    RAISE NOTICE 'Inserted % Canvas AI agents', agent_count;
END $$;

-- ============================================
-- Phase 1 Complete!
-- ============================================
-- This script creates all tables without RLS policies
-- Tables are ready for use, but without row-level security
-- Run phase2_rls_policies.sql after this to add security