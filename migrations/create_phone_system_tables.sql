-- Phone System Tables for RepConnect1
-- To be created in cbopynuvhcymbumjnvay.supabase.co

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

-- Call logs table
CREATE TABLE IF NOT EXISTS call_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  call_sid VARCHAR(100) UNIQUE,
  phone_number_id UUID REFERENCES phone_numbers(id),
  from_number VARCHAR(20),
  to_number VARCHAR(20),
  direction VARCHAR(10) CHECK (direction IN ('inbound', 'outbound')),
  status VARCHAR(20),
  duration INTEGER, -- in seconds
  recording_url TEXT,
  recording_sid VARCHAR(100),
  transcription TEXT,
  ai_summary TEXT,
  price DECIMAL(10,4),
  price_unit VARCHAR(3) DEFAULT 'USD',
  user_id UUID REFERENCES auth.users(id),
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  answered_at TIMESTAMP WITH TIME ZONE,
  ended_at TIMESTAMP WITH TIME ZONE
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
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
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

-- Link messages to conversations
ALTER TABLE sms_messages 
ADD COLUMN IF NOT EXISTS conversation_id UUID REFERENCES sms_conversations(id);

-- Usage records for tracking
CREATE TABLE IF NOT EXISTS phone_usage_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phone_number_id UUID REFERENCES phone_numbers(id),
  user_id UUID REFERENCES auth.users(id),
  type VARCHAR(20) CHECK (type IN ('call_minutes', 'sms_sent', 'mms_sent', 'recording_storage')),
  quantity DECIMAL(10,2),
  unit_cost DECIMAL(10,4),
  total_cost DECIMAL(10,4),
  billing_period DATE,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Phone system configuration
CREATE TABLE IF NOT EXISTS phone_system_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id),
  config_type VARCHAR(50), -- 'voicemail', 'call_forwarding', 'auto_response', etc.
  config_data JSONB,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for performance
CREATE INDEX idx_phone_numbers_assigned_to ON phone_numbers(assigned_to);
CREATE INDEX idx_phone_numbers_status ON phone_numbers(status);
CREATE INDEX idx_call_logs_user_id ON call_logs(user_id);
CREATE INDEX idx_call_logs_created_at ON call_logs(created_at);
CREATE INDEX idx_call_logs_phone_number ON call_logs(from_number, to_number);
CREATE INDEX idx_sms_messages_user_id ON sms_messages(user_id);
CREATE INDEX idx_sms_messages_created_at ON sms_messages(created_at);
CREATE INDEX idx_sms_messages_conversation ON sms_messages(conversation_id);
CREATE INDEX idx_sms_conversations_phone ON sms_conversations(phone_number_id, participant_number);
CREATE INDEX idx_phone_usage_billing ON phone_usage_records(billing_period, user_id);

-- Enable Row Level Security
ALTER TABLE phone_numbers ENABLE ROW LEVEL SECURITY;
ALTER TABLE call_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE sms_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE sms_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE phone_usage_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE phone_system_config ENABLE ROW LEVEL SECURITY;

-- RLS Policies
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

-- Usage records: users can only see their own usage
CREATE POLICY "Users can view their usage" ON phone_usage_records
  FOR SELECT USING (auth.uid() = user_id);

-- Phone config: users can manage their own config
CREATE POLICY "Users can view their config" ON phone_system_config
  FOR ALL USING (auth.uid() = user_id);

-- Create updated_at trigger function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Add updated_at triggers
CREATE TRIGGER update_phone_numbers_updated_at BEFORE UPDATE ON phone_numbers
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_phone_system_config_updated_at BEFORE UPDATE ON phone_system_config
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();