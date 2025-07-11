-- Complete setup for all remaining tables
-- This includes Canvas Agents and Communication (Phone/Email) systems

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- =====================================================
-- PHASE 1: COMMUNICATION INFRASTRUCTURE
-- =====================================================

-- Shared update_updated_at function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Phone Numbers Management
CREATE TABLE IF NOT EXISTS phone_numbers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    phone_number VARCHAR(20) UNIQUE NOT NULL,
    user_id TEXT,
    provider VARCHAR(50) DEFAULT 'twilio',
    capabilities JSONB DEFAULT '{"voice": true, "sms": true, "mms": true}'::jsonb,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Unified Call Logs (merges phone_system and twilio tables)
CREATE TABLE IF NOT EXISTS call_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    call_sid VARCHAR(255) UNIQUE,
    phone_number_id UUID REFERENCES phone_numbers(id),
    user_id TEXT,
    from_number VARCHAR(20) NOT NULL,
    to_number VARCHAR(20) NOT NULL,
    direction VARCHAR(20) CHECK (direction IN ('inbound', 'outbound')),
    status VARCHAR(50),
    duration INTEGER,
    recording_url TEXT,
    recording_sid VARCHAR(255),
    transcription_text TEXT,
    ai_summary TEXT,
    price DECIMAL(10, 4),
    price_unit VARCHAR(10) DEFAULT 'USD',
    error_code VARCHAR(20),
    error_message TEXT,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Call Recordings
CREATE TABLE IF NOT EXISTS call_recordings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    call_id UUID REFERENCES call_logs(id) ON DELETE CASCADE,
    recording_sid VARCHAR(255) UNIQUE,
    recording_url TEXT NOT NULL,
    duration INTEGER,
    channels INTEGER DEFAULT 1,
    price DECIMAL(10, 4),
    price_unit VARCHAR(10) DEFAULT 'USD',
    status VARCHAR(50) DEFAULT 'completed',
    error_code VARCHAR(20),
    error_message TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- SMS Messages
CREATE TABLE IF NOT EXISTS sms_messages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    message_sid VARCHAR(255) UNIQUE,
    conversation_id UUID,
    phone_number_id UUID REFERENCES phone_numbers(id),
    user_id TEXT,
    from_number VARCHAR(20) NOT NULL,
    to_number VARCHAR(20) NOT NULL,
    direction VARCHAR(20) CHECK (direction IN ('inbound', 'outbound')),
    body TEXT NOT NULL,
    media_urls TEXT[],
    num_media INTEGER DEFAULT 0,
    num_segments INTEGER DEFAULT 1,
    status VARCHAR(50),
    price DECIMAL(10, 4),
    price_unit VARCHAR(10) DEFAULT 'USD',
    error_code VARCHAR(20),
    error_message TEXT,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- SMS Conversations
CREATE TABLE IF NOT EXISTS sms_conversations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    phone_number_id UUID REFERENCES phone_numbers(id),
    user_id TEXT,
    participant_number VARCHAR(20) NOT NULL,
    last_message_at TIMESTAMP WITH TIME ZONE,
    message_count INTEGER DEFAULT 0,
    is_active BOOLEAN DEFAULT true,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Email Templates
CREATE TABLE IF NOT EXISTS email_templates (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    subject VARCHAR(500) NOT NULL,
    html_content TEXT,
    text_content TEXT,
    variables JSONB DEFAULT '[]'::jsonb,
    category VARCHAR(100),
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Email Campaigns
CREATE TABLE IF NOT EXISTS email_campaigns (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    template_id UUID REFERENCES email_templates(id),
    from_email VARCHAR(255) NOT NULL,
    from_name VARCHAR(255),
    reply_to VARCHAR(255),
    subject VARCHAR(500),
    status VARCHAR(50) DEFAULT 'draft',
    scheduled_at TIMESTAMP WITH TIME ZONE,
    sent_at TIMESTAMP WITH TIME ZONE,
    recipient_count INTEGER DEFAULT 0,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Email Logs
CREATE TABLE IF NOT EXISTS email_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    campaign_id UUID REFERENCES email_campaigns(id),
    template_id UUID REFERENCES email_templates(id),
    to_email VARCHAR(255) NOT NULL,
    to_name VARCHAR(255),
    from_email VARCHAR(255) NOT NULL,
    from_name VARCHAR(255),
    subject VARCHAR(500),
    status VARCHAR(50) DEFAULT 'pending',
    provider VARCHAR(50) DEFAULT 'gmail',
    message_id VARCHAR(255),
    opened_at TIMESTAMP WITH TIME ZONE,
    clicked_at TIMESTAMP WITH TIME ZONE,
    bounced_at TIMESTAMP WITH TIME ZONE,
    complained_at TIMESTAMP WITH TIME ZONE,
    error_message TEXT,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Unified Usage Records
CREATE TABLE IF NOT EXISTS communication_usage_records (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id TEXT,
    service_type VARCHAR(50) NOT NULL,
    usage_type VARCHAR(100) NOT NULL,
    quantity DECIMAL(10, 2),
    unit VARCHAR(50),
    price DECIMAL(10, 4),
    price_unit VARCHAR(10) DEFAULT 'USD',
    billing_period_start DATE,
    billing_period_end DATE,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Configuration Storage
CREATE TABLE IF NOT EXISTS communication_config (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id TEXT UNIQUE NOT NULL,
    twilio_config JSONB DEFAULT '{}'::jsonb,
    email_config JSONB DEFAULT '{}'::jsonb,
    voip_config JSONB DEFAULT '{}'::jsonb,
    notification_preferences JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for communication tables
CREATE INDEX IF NOT EXISTS idx_phone_numbers_user_id ON phone_numbers(user_id);
CREATE INDEX IF NOT EXISTS idx_call_logs_user_id ON call_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_call_logs_created_at ON call_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sms_messages_user_id ON sms_messages(user_id);
CREATE INDEX IF NOT EXISTS idx_sms_messages_conversation_id ON sms_messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_sms_conversations_user_id ON sms_conversations(user_id);
CREATE INDEX IF NOT EXISTS idx_email_logs_to_email ON email_logs(to_email);
CREATE INDEX IF NOT EXISTS idx_email_logs_campaign_id ON email_logs(campaign_id);
CREATE INDEX IF NOT EXISTS idx_communication_usage_user_id ON communication_usage_records(user_id);

-- Create update triggers for communication tables
CREATE TRIGGER update_phone_numbers_updated_at BEFORE UPDATE ON phone_numbers
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_call_logs_updated_at BEFORE UPDATE ON call_logs
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_sms_messages_updated_at BEFORE UPDATE ON sms_messages
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_sms_conversations_updated_at BEFORE UPDATE ON sms_conversations
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_email_templates_updated_at BEFORE UPDATE ON email_templates
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_email_campaigns_updated_at BEFORE UPDATE ON email_campaigns
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_email_logs_updated_at BEFORE UPDATE ON email_logs
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_communication_config_updated_at BEFORE UPDATE ON communication_config
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Enable RLS on communication tables
ALTER TABLE phone_numbers ENABLE ROW LEVEL SECURITY;
ALTER TABLE call_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE call_recordings ENABLE ROW LEVEL SECURITY;
ALTER TABLE sms_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE sms_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE communication_usage_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE communication_config ENABLE ROW LEVEL SECURITY;

-- =====================================================
-- PHASE 2: CANVAS AI AGENTS
-- =====================================================

-- Create profiles table if it doesn't exist
CREATE TABLE IF NOT EXISTS profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT,
    full_name TEXT,
    company TEXT,
    role TEXT,
    avatar_url TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Canvas AI Agents table
CREATE TABLE IF NOT EXISTS canvas_ai_agents (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(100) NOT NULL,
    type VARCHAR(50) NOT NULL,
    description TEXT,
    personality_traits JSONB DEFAULT '[]'::jsonb,
    specialties TEXT[],
    greeting_message TEXT,
    system_prompt TEXT,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Agent Conversations
CREATE TABLE IF NOT EXISTS agent_conversations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
    agent_id UUID REFERENCES canvas_ai_agents(id) ON DELETE CASCADE,
    session_id VARCHAR(255),
    messages JSONB DEFAULT '[]'::jsonb,
    context JSONB DEFAULT '{}'::jsonb,
    status VARCHAR(50) DEFAULT 'active',
    started_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    ended_at TIMESTAMP WITH TIME ZONE,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Agent Feedback
CREATE TABLE IF NOT EXISTS agent_feedback (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    conversation_id UUID REFERENCES agent_conversations(id) ON DELETE CASCADE,
    user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
    rating INTEGER CHECK (rating >= 1 AND rating <= 5),
    feedback_text TEXT,
    tags TEXT[],
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Agent Interaction Logs
CREATE TABLE IF NOT EXISTS agent_interaction_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    conversation_id UUID REFERENCES agent_conversations(id) ON DELETE CASCADE,
    user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
    agent_id UUID REFERENCES canvas_ai_agents(id) ON DELETE CASCADE,
    interaction_type VARCHAR(50),
    duration_seconds INTEGER,
    tokens_used INTEGER,
    cost DECIMAL(10, 4),
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for Canvas agent tables
CREATE INDEX IF NOT EXISTS idx_agent_conversations_user_id ON agent_conversations(user_id);
CREATE INDEX IF NOT EXISTS idx_agent_conversations_agent_id ON agent_conversations(agent_id);
CREATE INDEX IF NOT EXISTS idx_agent_conversations_session_id ON agent_conversations(session_id);
CREATE INDEX IF NOT EXISTS idx_agent_feedback_user_id ON agent_feedback(user_id);
CREATE INDEX IF NOT EXISTS idx_agent_interaction_logs_user_id ON agent_interaction_logs(user_id);

-- Create update triggers for Canvas agent tables
CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON profiles
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_canvas_ai_agents_updated_at BEFORE UPDATE ON canvas_ai_agents
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_agent_conversations_updated_at BEFORE UPDATE ON agent_conversations
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Enable RLS on Canvas agent tables
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE canvas_ai_agents ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_feedback ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_interaction_logs ENABLE ROW LEVEL SECURITY;

-- =====================================================
-- PHASE 3: RLS POLICIES
-- =====================================================

-- Communication table policies
CREATE POLICY "Users can view own phone numbers" ON phone_numbers
    FOR SELECT USING (auth.uid()::text = user_id);
CREATE POLICY "Users can view own call logs" ON call_logs
    FOR SELECT USING (auth.uid()::text = user_id);
CREATE POLICY "Users can view own SMS" ON sms_messages
    FOR SELECT USING (auth.uid()::text = user_id);
CREATE POLICY "Users can view own conversations" ON sms_conversations
    FOR SELECT USING (auth.uid()::text = user_id);
CREATE POLICY "Users can view own email logs" ON email_logs
    FOR SELECT USING (to_email = auth.jwt() ->> 'email');

-- Canvas agent policies
CREATE POLICY "Users can view own profile" ON profiles
    FOR ALL USING (auth.uid() = id);
CREATE POLICY "Anyone can view active agents" ON canvas_ai_agents
    FOR SELECT USING (is_active = true);
CREATE POLICY "Users can view own conversations" ON agent_conversations
    FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users can manage own feedback" ON agent_feedback
    FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users can view own interaction logs" ON agent_interaction_logs
    FOR SELECT USING (auth.uid() = user_id);

-- Service role policies (for backend access)
CREATE POLICY "Service role full access" ON ALL TABLES IN SCHEMA public
    FOR ALL USING (auth.role() = 'service_role');

-- =====================================================
-- PHASE 4: DEFAULT DATA
-- =====================================================

-- Insert default Canvas AI agents
INSERT INTO canvas_ai_agents (name, type, description, personality_traits, specialties, greeting_message, system_prompt, is_active) VALUES
('Hunter', 'sales_hunter', 'Lead generation and prospecting specialist', 
 '["proactive", "persistent", "analytical", "relationship-builder"]'::jsonb,
 ARRAY['Lead Generation', 'Cold Outreach', 'Market Research', 'Opportunity Identification'],
 'Hi! I''m Hunter, your lead generation specialist. I''m here to help you identify and connect with high-value prospects. What industry or market are you targeting?',
 'You are Hunter, a sales AI agent specializing in lead generation and prospecting. Be proactive, analytical, and focused on identifying high-quality opportunities.',
 true),

('Closer', 'sales_closer', 'Deal closing and negotiation expert',
 '["confident", "persuasive", "strategic", "results-driven"]'::jsonb,
 ARRAY['Negotiation', 'Objection Handling', 'Deal Structuring', 'Closing Techniques'],
 'Hello! I''m Closer, your deal closing specialist. I excel at negotiation and overcoming objections. Tell me about the deal you''re working on.',
 'You are Closer, a sales AI agent specializing in deal closing and negotiation. Be confident, strategic, and focused on achieving win-win outcomes.',
 true),

('Educator', 'sales_educator', 'Product education and demonstration specialist',
 '["patient", "knowledgeable", "clear-communicator", "empathetic"]'::jsonb,
 ARRAY['Product Demos', 'Feature Education', 'Value Proposition', 'Technical Explanations'],
 'Welcome! I''m Educator, your product knowledge expert. I''m here to help you understand our solutions and how they can benefit you. What would you like to learn about?',
 'You are Educator, a sales AI agent specializing in product education and demonstrations. Be patient, clear, and focused on helping users understand value.',
 true),

('Strategist', 'sales_strategist', 'Sales strategy and planning expert',
 '["analytical", "visionary", "methodical", "collaborative"]'::jsonb,
 ARRAY['Sales Planning', 'Pipeline Management', 'Forecasting', 'Process Optimization'],
 'Greetings! I''m Strategist, your sales planning expert. I help develop winning sales strategies and optimize your sales process. What''s your current sales challenge?',
 'You are Strategist, a sales AI agent specializing in sales strategy and planning. Be analytical, strategic, and focused on long-term success.',
 true)
ON CONFLICT DO NOTHING;

-- Create trigger to auto-create profile for new users
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS trigger AS $$
BEGIN
    INSERT INTO profiles (id, email)
    VALUES (new.id, new.email)
    ON CONFLICT (id) DO NOTHING;
    RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create the trigger
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- Grant permissions
GRANT USAGE ON SCHEMA public TO anon, authenticated;
GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO service_role;

-- =====================================================
-- VERIFICATION
-- =====================================================
DO $$
BEGIN
    RAISE NOTICE 'Migration complete. Created tables:';
    RAISE NOTICE '- Communication: phone_numbers, call_logs, sms_messages, email_templates, etc.';
    RAISE NOTICE '- Canvas Agents: canvas_ai_agents, agent_conversations, agent_feedback, etc.';
    RAISE NOTICE '- Supporting: profiles with auto-creation trigger';
END $$;