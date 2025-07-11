-- ============================================
-- CONSOLIDATED COMMUNICATION TABLES MIGRATION
-- ============================================
-- This script creates all communication-related tables for:
-- 1. Phone System (Twilio/VoIP)
-- 2. SMS/MMS Messaging
-- 3. Email System
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
-- PHONE SYSTEM TABLES
-- ============================================

-- Phone numbers table
CREATE TABLE IF NOT EXISTS phone_numbers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phone_number VARCHAR(20) UNIQUE NOT NULL,
  friendly_name VARCHAR(255),
  capabilities JSONB DEFAULT '{"voice": true, "SMS": true, "MMS": true}',
  provider VARCHAR(50) DEFAULT 'twilio', -- 'twilio' or 'voipms'
  provider_sid VARCHAR(100),
  monthly_cost DECIMAL(10,2) DEFAULT 10.00,
  status VARCHAR(20) DEFAULT 'active',
  assigned_to UUID REFERENCES auth.users(id),
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Call logs table (consolidated from phone_system and twilio tables)
CREATE TABLE IF NOT EXISTS call_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  call_sid VARCHAR(100) UNIQUE,
  phone_number_id UUID REFERENCES phone_numbers(id),
  phone_number_sid VARCHAR(255), -- Twilio phone number SID
  from_number VARCHAR(20),
  to_number VARCHAR(20),
  direction VARCHAR(10) CHECK (direction IN ('inbound', 'outbound')),
  status VARCHAR(20), -- 'queued', 'ringing', 'in-progress', 'completed', 'failed', 'busy', 'no-answer'
  duration INTEGER DEFAULT 0, -- in seconds
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

-- Recordings table (separate for better management)
CREATE TABLE IF NOT EXISTS call_recordings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recording_sid VARCHAR(255) UNIQUE NOT NULL,
  call_sid VARCHAR(255) NOT NULL,
  recording_url TEXT NOT NULL,
  duration INTEGER NOT NULL,
  transcription_id UUID,
  status VARCHAR(50) DEFAULT 'pending', -- 'pending', 'processing', 'completed', 'failed'
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- ============================================
-- SMS/MMS MESSAGING TABLES
-- ============================================

-- SMS messages table (consolidated)
CREATE TABLE IF NOT EXISTS sms_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_sid VARCHAR(100) UNIQUE,
  phone_number_id UUID REFERENCES phone_numbers(id),
  from_number VARCHAR(20),
  to_number VARCHAR(20),
  body TEXT,
  num_segments INTEGER DEFAULT 1,
  direction VARCHAR(10) CHECK (direction IN ('inbound', 'outbound')),
  status VARCHAR(20), -- 'queued', 'sending', 'sent', 'delivered', 'undelivered', 'failed'
  price DECIMAL(10,4),
  price_unit VARCHAR(3) DEFAULT 'USD',
  error_code VARCHAR(20),
  error_message TEXT,
  user_id UUID REFERENCES auth.users(id),
  conversation_id UUID, -- Will be added after conversations table
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  sent_at TIMESTAMP WITH TIME ZONE,
  delivered_at TIMESTAMP WITH TIME ZONE
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

-- Add foreign key for conversation_id
ALTER TABLE sms_messages 
ADD CONSTRAINT fk_sms_conversation 
FOREIGN KEY (conversation_id) REFERENCES sms_conversations(id);

-- ============================================
-- EMAIL SYSTEM TABLES
-- ============================================

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

-- ============================================
-- USAGE AND CONFIGURATION TABLES
-- ============================================

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
  config_type VARCHAR(50), -- 'voicemail', 'call_forwarding', 'auto_response', 'email_settings', etc.
  config_data JSONB,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================
-- INDEXES FOR PERFORMANCE
-- ============================================

-- Phone system indexes
CREATE INDEX idx_phone_numbers_assigned_to ON phone_numbers(assigned_to);
CREATE INDEX idx_phone_numbers_status ON phone_numbers(status);
CREATE INDEX idx_call_logs_user_id ON call_logs(user_id);
CREATE INDEX idx_call_logs_created_at ON call_logs(created_at);
CREATE INDEX idx_call_logs_phone_number ON call_logs(from_number, to_number);
CREATE INDEX idx_call_logs_call_sid ON call_logs(call_sid);
CREATE INDEX idx_call_recordings_recording_sid ON call_recordings(recording_sid);
CREATE INDEX idx_call_recordings_call_sid ON call_recordings(call_sid);

-- SMS indexes
CREATE INDEX idx_sms_messages_user_id ON sms_messages(user_id);
CREATE INDEX idx_sms_messages_created_at ON sms_messages(created_at);
CREATE INDEX idx_sms_messages_conversation ON sms_messages(conversation_id);
CREATE INDEX idx_sms_messages_message_sid ON sms_messages(message_sid);
CREATE INDEX idx_sms_messages_from_number ON sms_messages(from_number);
CREATE INDEX idx_sms_messages_to_number ON sms_messages(to_number);
CREATE INDEX idx_sms_conversations_phone ON sms_conversations(phone_number_id, participant_number);

-- Email indexes
CREATE INDEX idx_email_logs_campaign_id ON email_logs(campaign_id);
CREATE INDEX idx_email_logs_user_id ON email_logs(user_id);
CREATE INDEX idx_email_logs_sent_at ON email_logs(sent_at);
CREATE INDEX idx_email_campaigns_user_id ON email_campaigns(user_id);
CREATE INDEX idx_email_campaigns_status ON email_campaigns(status);
CREATE INDEX idx_email_templates_user_id ON email_templates(user_id);
CREATE INDEX idx_email_templates_category ON email_templates(category);

-- Usage and config indexes
CREATE INDEX idx_usage_billing ON communication_usage_records(billing_period, user_id);
CREATE INDEX idx_config_user_type ON communication_config(user_id, config_type);

-- ============================================
-- ROW LEVEL SECURITY
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

-- ============================================
-- RLS POLICIES
-- ============================================

-- Phone numbers: users can only see their assigned numbers
CREATE POLICY "Users can view their phone numbers" ON phone_numbers
  FOR SELECT USING (auth.uid() = assigned_to);

CREATE POLICY "Users can update their phone numbers" ON phone_numbers
  FOR UPDATE USING (auth.uid() = assigned_to);

-- Call logs: users can only see their own calls
CREATE POLICY "Users can view their call logs" ON call_logs
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their call logs" ON call_logs
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Call recordings: users can only see recordings for their calls
CREATE POLICY "Users can view their call recordings" ON call_recordings
  FOR SELECT USING (
    call_sid IN (SELECT call_sid FROM call_logs WHERE user_id = auth.uid())
  );

-- SMS messages: users can only see their own messages
CREATE POLICY "Users can view their SMS messages" ON sms_messages
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their SMS messages" ON sms_messages
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Conversations: users can only see conversations for their numbers
CREATE POLICY "Users can view their conversations" ON sms_conversations
  FOR SELECT USING (
    phone_number_id IN (
      SELECT id FROM phone_numbers WHERE assigned_to = auth.uid()
    )
  );

-- Email data: users can only see their own email data
CREATE POLICY "Users can view own email logs" ON email_logs
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own email logs" ON email_logs
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can manage own campaigns" ON email_campaigns
  FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Users can manage own templates" ON email_templates
  FOR ALL USING (auth.uid() = user_id);

-- Usage records: users can only see their own usage
CREATE POLICY "Users can view their usage" ON communication_usage_records
  FOR SELECT USING (auth.uid() = user_id);

-- Communication config: users can manage their own config
CREATE POLICY "Users can manage their config" ON communication_config
  FOR ALL USING (auth.uid() = user_id);

-- ============================================
-- TRIGGERS
-- ============================================

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
-- UTILITY FUNCTIONS
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

-- Trigger to auto-manage SMS conversations
CREATE TRIGGER auto_manage_sms_conversation
BEFORE INSERT ON sms_messages
FOR EACH ROW
EXECUTE FUNCTION create_or_update_sms_conversation();

-- ============================================
-- SAMPLE DATA / TESTING (commented out)
-- ============================================

-- Sample phone number
-- INSERT INTO phone_numbers (phone_number, friendly_name, assigned_to)
-- VALUES ('+1234567890', 'Main Business Line', 'USER_UUID_HERE');

-- Sample email template
-- INSERT INTO email_templates (name, subject, html_content, user_id)
-- VALUES ('Welcome Email', 'Welcome to RepConnect', '<h1>Welcome!</h1>', 'USER_UUID_HERE');