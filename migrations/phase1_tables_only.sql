-- ============================================
-- PHASE 1: CREATE TABLES ONLY (NO RLS)
-- ============================================
-- This creates all tables without RLS policies
-- Run this first, then run phase2_rls_policies.sql
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
-- DEFAULT DATA
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
    'You are Hunter, a high-energy sales agent focused on lead generation and opportunity discovery.'
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
    'You are Closer, a seasoned sales professional who specializes in finalizing deals.'
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
    'You are Educator, a knowledgeable sales consultant who excels at explaining complex products.'
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
    'You are Strategist, a senior sales advisor who specializes in complex, enterprise-level deals.'
  )
ON CONFLICT (name) DO NOTHING;

-- ============================================
-- VERIFICATION
-- ============================================

DO $$
DECLARE
    table_count INTEGER;
BEGIN
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
    
    RAISE NOTICE 'Phase 1 Complete: Created % tables', table_count;
END $$;

-- ============================================
-- Phase 1 Complete!
-- ============================================
-- This script creates all tables without RLS policies
-- Run the diagnostic script to verify all tables have correct columns
-- Then run phase2_rls_policies.sql to add security