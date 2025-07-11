-- Canvas AI Agents Complete Migration
-- This script creates all necessary tables and features for the Canvas Sales Agents system
-- Run this script to set up the complete Canvas agents infrastructure

-- =====================================================
-- PART 1: Core Canvas AI Agent Tables
-- =====================================================

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

-- =====================================================
-- PART 2: Create Indexes for Performance
-- =====================================================

CREATE INDEX IF NOT EXISTS idx_agent_conversations_user_id ON agent_conversations(user_id);
CREATE INDEX IF NOT EXISTS idx_agent_conversations_agent_id ON agent_conversations(agent_id);
CREATE INDEX IF NOT EXISTS idx_agent_conversations_created_at ON agent_conversations(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_agent_feedback_conversation_id ON agent_feedback(conversation_id);
CREATE INDEX IF NOT EXISTS idx_agent_interaction_logs_conversation_id ON agent_interaction_logs(conversation_id);

-- =====================================================
-- PART 3: Enable Row Level Security (RLS)
-- =====================================================

ALTER TABLE canvas_ai_agents ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_feedback ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_interaction_logs ENABLE ROW LEVEL SECURITY;

-- =====================================================
-- PART 4: Create RLS Policies
-- =====================================================

-- Drop existing policies if they exist (to avoid conflicts)
DROP POLICY IF EXISTS "Agents are viewable by authenticated users" ON canvas_ai_agents;
DROP POLICY IF EXISTS "Authenticated users can manage agents" ON canvas_ai_agents;
DROP POLICY IF EXISTS "Users can view own conversations" ON agent_conversations;
DROP POLICY IF EXISTS "Users can create own conversations" ON agent_conversations;
DROP POLICY IF EXISTS "Users can update own conversations" ON agent_conversations;
DROP POLICY IF EXISTS "Users can delete own conversations" ON agent_conversations;
DROP POLICY IF EXISTS "Users can manage own feedback" ON agent_feedback;
DROP POLICY IF EXISTS "Users can view own interaction logs" ON agent_interaction_logs;

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

-- =====================================================
-- PART 5: Create Profiles Table (if needed)
-- =====================================================

CREATE TABLE IF NOT EXISTS profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT,
  full_name TEXT,
  avatar_url TEXT,
  is_admin BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS on profiles
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Users can view own profile" ON profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON profiles;

-- Profiles policies
CREATE POLICY "Users can view own profile" 
  ON profiles FOR SELECT 
  TO authenticated 
  USING (id = auth.uid());

CREATE POLICY "Users can update own profile" 
  ON profiles FOR UPDATE 
  TO authenticated 
  USING (id = auth.uid());

-- Create profile trigger to auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (new.id, new.email, new.raw_user_meta_data->>'full_name');
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

-- =====================================================
-- PART 6: Insert Default Canvas Agents
-- =====================================================

DO $$
BEGIN
  -- Hunter Agent
  IF NOT EXISTS (SELECT 1 FROM canvas_ai_agents WHERE name = 'Hunter') THEN
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
    );
  END IF;

  -- Closer Agent
  IF NOT EXISTS (SELECT 1 FROM canvas_ai_agents WHERE name = 'Closer') THEN
    INSERT INTO canvas_ai_agents (name, avatar_url, specialty, personality, system_prompt) VALUES
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
    );
  END IF;

  -- Educator Agent
  IF NOT EXISTS (SELECT 1 FROM canvas_ai_agents WHERE name = 'Educator') THEN
    INSERT INTO canvas_ai_agents (name, avatar_url, specialty, personality, system_prompt) VALUES
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
    );
  END IF;

  -- Strategist Agent
  IF NOT EXISTS (SELECT 1 FROM canvas_ai_agents WHERE name = 'Strategist') THEN
    INSERT INTO canvas_ai_agents (name, avatar_url, specialty, personality, system_prompt) VALUES
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
    );
  END IF;
END $$;

-- =====================================================
-- PART 7: Add Agent Features to Procedure Tables
-- =====================================================

-- Note: These ALTER TABLE commands will only add columns if they don't already exist
-- This assumes dental_procedures and aesthetic_procedures tables already exist

-- Update dental_procedures table if it exists
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'dental_procedures') THEN
    ALTER TABLE dental_procedures 
    ADD COLUMN IF NOT EXISTS is_featured BOOLEAN DEFAULT false,
    ADD COLUMN IF NOT EXISTS agent_knowledge JSONB DEFAULT '{}',
    ADD COLUMN IF NOT EXISTS common_objections JSONB DEFAULT '[]',
    ADD COLUMN IF NOT EXISTS key_selling_points TEXT[] DEFAULT '{}',
    ADD COLUMN IF NOT EXISTS competitive_advantages TEXT[] DEFAULT '{}',
    ADD COLUMN IF NOT EXISTS sales_strategy TEXT,
    ADD COLUMN IF NOT EXISTS roi_timeline TEXT,
    ADD COLUMN IF NOT EXISTS target_demographics TEXT;

    -- Create index for featured procedures
    CREATE INDEX IF NOT EXISTS idx_dental_procedures_featured 
    ON dental_procedures(is_featured) 
    WHERE is_featured = true;
  END IF;
END $$;

-- Update aesthetic_procedures table if it exists
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'aesthetic_procedures') THEN
    ALTER TABLE aesthetic_procedures 
    ADD COLUMN IF NOT EXISTS is_featured BOOLEAN DEFAULT false,
    ADD COLUMN IF NOT EXISTS agent_knowledge JSONB DEFAULT '{}',
    ADD COLUMN IF NOT EXISTS common_objections JSONB DEFAULT '[]',
    ADD COLUMN IF NOT EXISTS key_selling_points TEXT[] DEFAULT '{}',
    ADD COLUMN IF NOT EXISTS competitive_advantages TEXT[] DEFAULT '{}',
    ADD COLUMN IF NOT EXISTS sales_strategy TEXT,
    ADD COLUMN IF NOT EXISTS roi_timeline TEXT,
    ADD COLUMN IF NOT EXISTS target_demographics TEXT;

    -- Create index for featured procedures
    CREATE INDEX IF NOT EXISTS idx_aesthetic_procedures_featured 
    ON aesthetic_procedures(is_featured) 
    WHERE is_featured = true;
  END IF;
END $$;

-- =====================================================
-- PART 8: Update Featured Procedures (if tables exist)
-- =====================================================

-- Update featured dental procedures
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'dental_procedures') THEN
    -- YOMI Robotic Surgery
    UPDATE dental_procedures 
    SET is_featured = true,
        key_selling_points = ARRAY[
          'Robotic precision for predictable implant placement',
          'Reduced surgery time and patient discomfort',
          'Higher case acceptance with advanced technology'
        ],
        competitive_advantages = ARRAY[
          'Only robotic dental surgery system on market',
          'FDA cleared for full arch procedures',
          'Proven ROI within 18-24 months'
        ],
        sales_strategy = 'Focus on practice differentiation and attracting high-value implant cases',
        roi_timeline = '18-24 months with 2-3 cases per month',
        target_demographics = 'Tech-forward practices with 5+ implant cases/month'
    WHERE name ILIKE '%YOMI%' OR name ILIKE '%robotic%';

    -- All-on-4
    UPDATE dental_procedures 
    SET is_featured = true,
        key_selling_points = ARRAY[
          'Complete smile transformation in one day',
          'Predictable results with proven protocol',
          'Premium price point with high profit margins'
        ],
        competitive_advantages = ARRAY[
          'Established brand recognition',
          'Comprehensive training and support',
          'Marketing materials included'
        ],
        sales_strategy = 'Target practices looking to expand into full-arch solutions',
        roi_timeline = '6-12 months with 1 case per month',
        target_demographics = 'Practices with strong referral networks'
    WHERE name ILIKE '%all-on-4%' OR name ILIKE '%all on 4%' OR name ILIKE '%full arch%';

    -- Invisalign
    UPDATE dental_procedures 
    SET is_featured = true,
        key_selling_points = ARRAY[
          'Most recognized clear aligner brand',
          'Comprehensive case support',
          'Patient financing options available'
        ],
        competitive_advantages = ARRAY[
          'Brand recognition drives patient demand',
          'Proven clinical outcomes',
          'Extensive provider network'
        ],
        sales_strategy = 'Emphasize patient demand and practice growth potential',
        roi_timeline = 'Immediate with minimal investment',
        target_demographics = 'General dentists wanting to expand services'
    WHERE name ILIKE '%invisalign%';

    -- Other featured dental procedures
    UPDATE dental_procedures SET is_featured = true 
    WHERE name ILIKE '%nobel biocare%' 
       OR name ILIKE '%straumann%'
       OR name ILIKE '%digital denture%'
       OR name ILIKE '%CEREC%'
       OR name ILIKE '%guided surgery%';
  END IF;
END $$;

-- Update featured aesthetic procedures
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'aesthetic_procedures') THEN
    -- CoolSculpting
    UPDATE aesthetic_procedures 
    SET is_featured = true,
        key_selling_points = ARRAY[
          'Non-invasive fat reduction with proven results',
          'No downtime appeals to busy patients',
          'High patient satisfaction rates'
        ],
        competitive_advantages = ARRAY[
          '#1 non-invasive fat reduction brand',
          'Elite system with improved comfort',
          'Extensive clinical studies'
        ],
        sales_strategy = 'Position as gateway to body contouring services',
        roi_timeline = '12-18 months with proper marketing',
        target_demographics = 'Practices targeting body-conscious patients 30-60'
    WHERE name ILIKE '%coolsculpt%';

    -- Botox/Dysport
    UPDATE aesthetic_procedures 
    SET is_featured = true,
        key_selling_points = ARRAY[
          'Most popular aesthetic treatment globally',
          'Quick treatment with immediate results',
          'High profit margins with repeat patients'
        ],
        competitive_advantages = ARRAY[
          'Gold standard neurotoxin',
          'Extensive safety profile',
          'Strong patient awareness'
        ],
        sales_strategy = 'Gateway treatment for aesthetic practices',
        roi_timeline = 'Immediate profitability',
        target_demographics = 'Patients 25-65 seeking preventative and corrective treatment'
    WHERE name ILIKE '%botox%' OR name ILIKE '%dysport%';

    -- Dermal Fillers
    UPDATE aesthetic_procedures 
    SET is_featured = true,
        key_selling_points = ARRAY[
          'Immediate volumizing results',
          'Long-lasting effects up to 2 years',
          'Comprehensive product portfolio'
        ],
        competitive_advantages = ARRAY[
          'Vycross technology for smooth results',
          'Full face treatment options',
          'Allergan brand trust'
        ],
        sales_strategy = 'Complement neurotoxin services for full-face rejuvenation',
        roi_timeline = 'Immediate with high margins',
        target_demographics = 'Patients 35+ seeking facial volume restoration'
    WHERE name ILIKE '%juvederm%' OR name ILIKE '%restylane%' OR category = 'Dermal Fillers';

    -- EmSculpt
    UPDATE aesthetic_procedures 
    SET is_featured = true,
        key_selling_points = ARRAY[
          'Simultaneous fat reduction and muscle building',
          'FDA cleared for multiple body areas',
          'No downtime with visible results'
        ],
        competitive_advantages = ARRAY[
          'Only device that builds muscle while burning fat',
          'HIFEM + RF technology',
          'Clinical studies show 30% fat reduction'
        ],
        sales_strategy = 'Premium body contouring for athletic demographic',
        roi_timeline = '18-24 months with strong marketing',
        target_demographics = 'Fit patients wanting to enhance results'
    WHERE name ILIKE '%emsculpt%';

    -- Other featured aesthetic procedures
    UPDATE aesthetic_procedures SET is_featured = true 
    WHERE name ILIKE '%morpheus%'
       OR name ILIKE '%ultherapy%'
       OR name ILIKE '%hydrafacial%'
       OR name ILIKE '%CO2 laser%'
       OR name ILIKE '%IPL%'
       OR name ILIKE '%BBL%'
       OR name ILIKE '%sculptra%'
       OR (name ILIKE '%thread%' AND name ILIKE '%lift%');
  END IF;
END $$;

-- =====================================================
-- Migration Complete
-- =====================================================
-- This script has created/updated:
-- 1. canvas_ai_agents table with 4 default agents
-- 2. agent_conversations table for chat history
-- 3. agent_feedback table for learning/improvement
-- 4. agent_interaction_logs table for analytics
-- 5. profiles table (if not exists) with auto-creation trigger
-- 6. All necessary indexes and RLS policies
-- 7. Agent-specific columns in procedure tables (if they exist)
-- 8. Featured procedures with sales data (if tables exist)