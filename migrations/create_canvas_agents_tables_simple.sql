-- Canvas AI Agents Tables Migration
-- This creates all necessary tables for the Canvas Sales Agents feature

-- Create Canvas AI Agents table
CREATE TABLE IF NOT EXISTS canvas_ai_agents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
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

-- Create Agent Feedback table for learning
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

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_agent_conversations_user_id ON agent_conversations(user_id);
CREATE INDEX IF NOT EXISTS idx_agent_conversations_agent_id ON agent_conversations(agent_id);
CREATE INDEX IF NOT EXISTS idx_agent_conversations_created_at ON agent_conversations(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_agent_feedback_conversation_id ON agent_feedback(conversation_id);
CREATE INDEX IF NOT EXISTS idx_agent_interaction_logs_conversation_id ON agent_interaction_logs(conversation_id);

-- Enable RLS
ALTER TABLE canvas_ai_agents ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_feedback ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_interaction_logs ENABLE ROW LEVEL SECURITY;

-- RLS Policies

-- Agents are readable by all authenticated users
CREATE POLICY "Agents are viewable by authenticated users" 
  ON canvas_ai_agents FOR SELECT 
  TO authenticated 
  USING (is_active = true);

-- Allow authenticated users to manage agents (temporary - restrict later)
CREATE POLICY "Authenticated users can manage agents" 
  ON canvas_ai_agents FOR ALL 
  TO authenticated 
  USING (true)
  WITH CHECK (true);

-- Users can only see their own conversations
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

-- Users can only manage their own feedback
CREATE POLICY "Users can manage own feedback" 
  ON agent_feedback FOR ALL 
  TO authenticated 
  USING (user_id = auth.uid());

-- Users can only see their own interaction logs
CREATE POLICY "Users can view own interaction logs" 
  ON agent_interaction_logs FOR SELECT 
  TO authenticated 
  USING (user_id = auth.uid());

-- Insert default agents
INSERT INTO canvas_ai_agents (name, avatar_url, specialty, personality, system_prompt) VALUES
(
  'Hunter', 
  '/avatars/hunter-agent.png',
  ARRAY['dental_implants', 'orthodontics', 'cosmetic_dentistry'],
  '{
    "tone": "energetic",
    "verbosity": "concise",
    "approach": "direct",
    "temperature": 0.8
  }'::jsonb,
  'You are Hunter, a high-energy sales agent focused on finding new opportunities and prospects. You excel at identifying untapped markets and qualifying leads quickly.'
),
(
  'Closer',
  '/avatars/closer-agent.png', 
  ARRAY['aesthetic_procedures', 'lasers', 'injectables'],
  '{
    "tone": "confident",
    "verbosity": "detailed",
    "approach": "consultative",
    "temperature": 0.7
  }'::jsonb,
  'You are Closer, a deal-making specialist who excels at negotiations and overcoming objections. You provide strategic guidance for closing complex medical device sales.'
),
(
  'Educator',
  '/avatars/educator-agent.png',
  ARRAY['all_procedures'],
  '{
    "tone": "patient",
    "verbosity": "detailed",
    "approach": "educational",
    "temperature": 0.6
  }'::jsonb,
  'You are Educator, a teaching-focused agent who helps sales reps understand complex medical procedures and technologies. You break down technical concepts into clear, actionable insights.'
),
(
  'Strategist',
  '/avatars/strategist-agent.png',
  ARRAY['practice_management', 'market_analysis'],
  '{
    "tone": "analytical",
    "verbosity": "comprehensive",
    "approach": "data-driven",
    "temperature": 0.5
  }'::jsonb,
  'You are Strategist, a market intelligence expert who analyzes competitive landscapes and develops territory strategies. You provide data-driven recommendations for market penetration.'
)
ON CONFLICT (name) DO NOTHING; -- Prevent duplicate inserts if run multiple times