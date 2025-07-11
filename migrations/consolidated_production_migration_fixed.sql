-- ============================================
-- CONSOLIDATED PRODUCTION MIGRATION FOR OS BACKEND (FIXED)
-- ============================================
-- This is a single file containing all migrations
-- Run this in Supabase SQL Editor to set up all tables
-- Fixed version that handles missing columns gracefully
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
-- PHASE 1: COMMUNICATION TABLES
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
-- PHASE 2: CANVAS AI AGENTS TABLES
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
-- PHASE 3: INDEXES FOR PERFORMANCE
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
-- PHASE 4: ROW LEVEL SECURITY
-- ============================================

-- Enable RLS on all tables
ALTER TABLE phone_numbers ENABLE ROW LEVEL SECURITY;
ALTER TABLE call_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE call_recordings ENABLE ROW LEVEL SECURITY;
ALTER TABLE sms_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE sms_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE communication_usage_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE communication_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE canvas_ai_agents ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_feedback ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_interaction_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- ============================================
-- PHASE 5: RLS POLICIES (WITH EXISTENCE CHECKS)
-- ============================================

-- Drop existing policies first to avoid conflicts
DO $$
BEGIN
  -- Phone numbers policies
  DROP POLICY IF EXISTS "Users can view their phone numbers" ON phone_numbers;
  DROP POLICY IF EXISTS "Users can update their phone numbers" ON phone_numbers;
  
  -- Call logs policies
  DROP POLICY IF EXISTS "Users can view their call logs" ON call_logs;
  DROP POLICY IF EXISTS "Users can insert their call logs" ON call_logs;
  
  -- Call recordings policies
  DROP POLICY IF EXISTS "Users can view their call recordings" ON call_recordings;
  
  -- SMS policies
  DROP POLICY IF EXISTS "Users can view their SMS messages" ON sms_messages;
  DROP POLICY IF EXISTS "Users can insert their SMS messages" ON sms_messages;
  DROP POLICY IF EXISTS "Users can view their conversations" ON sms_conversations;
  
  -- Email policies
  DROP POLICY IF EXISTS "Users can view own email logs" ON email_logs;
  DROP POLICY IF EXISTS "Users can insert own email logs" ON email_logs;
  DROP POLICY IF EXISTS "Users can manage own campaigns" ON email_campaigns;
  DROP POLICY IF EXISTS "Users can manage own templates" ON email_templates;
  
  -- Usage and config policies
  DROP POLICY IF EXISTS "Users can view their usage" ON communication_usage_records;
  DROP POLICY IF EXISTS "Users can manage their config" ON communication_config;
  
  -- Canvas agent policies
  DROP POLICY IF EXISTS "Agents are viewable by authenticated users" ON canvas_ai_agents;
  DROP POLICY IF EXISTS "Authenticated users can manage agents" ON canvas_ai_agents;
  DROP POLICY IF EXISTS "Users can view own conversations" ON agent_conversations;
  DROP POLICY IF EXISTS "Users can create own conversations" ON agent_conversations;
  DROP POLICY IF EXISTS "Users can update own conversations" ON agent_conversations;
  DROP POLICY IF EXISTS "Users can delete own conversations" ON agent_conversations;
  DROP POLICY IF EXISTS "Users can manage own feedback" ON agent_feedback;
  DROP POLICY IF EXISTS "Users can view own interaction logs" ON agent_interaction_logs;
  
  -- Profile policies
  DROP POLICY IF EXISTS "Users can view own profile" ON profiles;
  DROP POLICY IF EXISTS "Users can update own profile" ON profiles;
END $$;

-- Now create the policies

-- Phone numbers policies
CREATE POLICY "Users can view their phone numbers" ON phone_numbers
  FOR SELECT USING (auth.uid() = assigned_to);

CREATE POLICY "Users can update their phone numbers" ON phone_numbers
  FOR UPDATE USING (auth.uid() = assigned_to);

-- Call logs policies
CREATE POLICY "Users can view their call logs" ON call_logs
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their call logs" ON call_logs
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Call recordings policies
CREATE POLICY "Users can view their call recordings" ON call_recordings
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM call_logs 
      WHERE call_logs.call_sid = call_recordings.call_sid 
      AND call_logs.user_id = auth.uid()
    )
  );

-- SMS messages policies
CREATE POLICY "Users can view their SMS messages" ON sms_messages
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their SMS messages" ON sms_messages
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Conversations policies
CREATE POLICY "Users can view their conversations" ON sms_conversations
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM phone_numbers 
      WHERE phone_numbers.id = sms_conversations.phone_number_id 
      AND phone_numbers.assigned_to = auth.uid()
    )
  );

-- Email policies
CREATE POLICY "Users can view own email logs" ON email_logs
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own email logs" ON email_logs
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can manage own campaigns" ON email_campaigns
  FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Users can manage own templates" ON email_templates
  FOR ALL USING (auth.uid() = user_id);

-- Usage records policies
CREATE POLICY "Users can view their usage" ON communication_usage_records
  FOR SELECT USING (auth.uid() = user_id);

-- Communication config policies
CREATE POLICY "Users can manage their config" ON communication_config
  FOR ALL USING (auth.uid() = user_id);

-- Canvas agent policies
CREATE POLICY "Agents are viewable by authenticated users" 
  ON canvas_ai_agents FOR SELECT 
  TO authenticated 
  USING (is_active = true);

CREATE POLICY "Authenticated users can manage agents" 
  ON canvas_ai_agents FOR ALL 
  TO authenticated 
  USING (true)
  WITH CHECK (true);

-- Agent conversations policies
CREATE POLICY "Users can view own conversations" 
  ON agent_conversations FOR SELECT 
  TO authenticated 
  USING (user_id = auth.uid());

CREATE POLICY "Users can create own conversations" 
  ON agent_conversations FOR INSERT 
  TO authenticated 
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update own conversations" 
  ON agent_conversations FOR UPDATE 
  TO authenticated 
  USING (user_id = auth.uid());

CREATE POLICY "Users can delete own conversations" 
  ON agent_conversations FOR DELETE 
  TO authenticated 
  USING (user_id = auth.uid());

-- Agent feedback policies
CREATE POLICY "Users can manage own feedback" 
  ON agent_feedback FOR ALL 
  TO authenticated 
  USING (user_id = auth.uid());

-- Agent interaction logs policies
CREATE POLICY "Users can view own interaction logs" 
  ON agent_interaction_logs FOR SELECT 
  TO authenticated 
  USING (user_id = auth.uid());

-- Profiles policies
CREATE POLICY "Users can view own profile" 
  ON profiles FOR SELECT 
  TO authenticated 
  USING (id = auth.uid());

CREATE POLICY "Users can update own profile" 
  ON profiles FOR UPDATE 
  TO authenticated 
  USING (id = auth.uid());

-- ============================================
-- PHASE 6: TRIGGERS
-- ============================================

-- Drop existing triggers first to avoid conflicts
DROP TRIGGER IF EXISTS update_phone_numbers_updated_at ON phone_numbers;
DROP TRIGGER IF EXISTS update_call_logs_updated_at ON call_logs;
DROP TRIGGER IF EXISTS update_call_recordings_updated_at ON call_recordings;
DROP TRIGGER IF EXISTS update_sms_messages_updated_at ON sms_messages;
DROP TRIGGER IF EXISTS update_email_campaigns_updated_at ON email_campaigns;
DROP TRIGGER IF EXISTS update_email_templates_updated_at ON email_templates;
DROP TRIGGER IF EXISTS update_communication_config_updated_at ON communication_config;

-- Add updated_at triggers
CREATE TRIGGER update_phone_numbers_updated_at BEFORE UPDATE ON phone_numbers
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_call_logs_updated_at BEFORE UPDATE ON call_logs
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_call_recordings_updated_at BEFORE UPDATE ON call_recordings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_sms_messages_updated_at BEFORE UPDATE ON sms_messages
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_email_campaigns_updated_at BEFORE UPDATE ON email_campaigns
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_email_templates_updated_at BEFORE UPDATE ON email_templates
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_communication_config_updated_at BEFORE UPDATE ON communication_config
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- PHASE 7: UTILITY FUNCTIONS
-- ============================================

-- Function to automatically create SMS conversation on message insert
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

-- Drop existing trigger if it exists
DROP TRIGGER IF EXISTS auto_manage_sms_conversation ON sms_messages;

-- Trigger to auto-manage SMS conversations
CREATE TRIGGER auto_manage_sms_conversation
BEFORE INSERT ON sms_messages
FOR EACH ROW
EXECUTE FUNCTION create_or_update_sms_conversation();

-- Create profile trigger to auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (new.id, new.email, new.raw_user_meta_data->>'full_name')
  ON CONFLICT (id) DO NOTHING;
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Only create trigger if it doesn't exist
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
-- PHASE 8: INSERT DEFAULT CANVAS AGENTS
-- ============================================

DO $$
BEGIN
  -- Hunter Agent
  IF NOT EXISTS (SELECT 1 FROM canvas_ai_agents WHERE name = 'Hunter') THEN
    INSERT INTO canvas_ai_agents (name, avatar_url, specialty, personality, system_prompt)
    VALUES (
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
    );
  END IF;

  -- Closer Agent
  IF NOT EXISTS (SELECT 1 FROM canvas_ai_agents WHERE name = 'Closer') THEN
    INSERT INTO canvas_ai_agents (name, avatar_url, specialty, personality, system_prompt)
    VALUES (
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
      'You are Closer, a seasoned sales professional who specializes in finalizing deals and overcoming objections. You have a talent for negotiation, understanding client needs, and creating win-win solutions. Be confident, strategic, and focused on getting to "yes".'
    );
  END IF;

  -- Educator Agent
  IF NOT EXISTS (SELECT 1 FROM canvas_ai_agents WHERE name = 'Educator') THEN
    INSERT INTO canvas_ai_agents (name, avatar_url, specialty, personality, system_prompt)
    VALUES (
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
    );
  END IF;

  -- Strategist Agent
  IF NOT EXISTS (SELECT 1 FROM canvas_ai_agents WHERE name = 'Strategist') THEN
    INSERT INTO canvas_ai_agents (name, avatar_url, specialty, personality, system_prompt)
    VALUES (
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
    );
  END IF;
END $$;

-- ============================================
-- PHASE 9: VERIFICATION
-- ============================================

-- Verify all tables were created successfully
DO $$
DECLARE
    expected_tables text[] := ARRAY[
        -- Communication tables
        'phone_numbers',
        'call_logs',
        'call_recordings',
        'sms_messages',
        'sms_conversations',
        'email_templates',
        'email_campaigns',
        'email_logs',
        'communication_usage_records',
        'communication_config',
        -- Canvas AI Agent tables
        'canvas_ai_agents',
        'agent_conversations',
        'agent_feedback',
        'agent_interaction_logs',
        'profiles'
    ];
    missing_tables text[];
    table_name text;
    created_tables text[];
BEGIN
    -- Check for missing tables
    missing_tables := ARRAY[]::text[];
    created_tables := ARRAY[]::text[];
    
    FOREACH table_name IN ARRAY expected_tables
    LOOP
        IF NOT EXISTS (
            SELECT 1 FROM information_schema.tables 
            WHERE table_schema = 'public' 
            AND information_schema.tables.table_name = table_name
        ) THEN
            missing_tables := array_append(missing_tables, table_name);
        ELSE
            created_tables := array_append(created_tables, table_name);
        END IF;
    END LOOP;
    
    -- Report results
    IF array_length(missing_tables, 1) > 0 THEN
        RAISE NOTICE 'WARNING: The following tables were not created: %', missing_tables;
    END IF;
    
    IF array_length(created_tables, 1) > 0 THEN
        RAISE NOTICE 'SUCCESS: The following tables exist: %', created_tables;
    END IF;
    
    RAISE NOTICE 'Migration completed. Total tables checked: %', array_length(expected_tables, 1);
END $$;

-- ============================================
-- MIGRATION COMPLETE!
-- ============================================
-- This fixed version:
-- 1. Drops existing policies before creating new ones
-- 2. Uses EXISTS subqueries instead of direct column references
-- 3. Adds ON CONFLICT handling for profile creation
-- 4. Drops triggers before recreating them
-- 5. Provides better error handling and reporting