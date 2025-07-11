-- Knowledge Bank System Migration
-- This script creates all necessary tables for the Agent Academy knowledge bank system

-- Enable pgvector extension for embeddings
CREATE EXTENSION IF NOT EXISTS vector;

-- =====================================================
-- PART 1: Core Knowledge Bank Tables
-- =====================================================

-- Knowledge Documents table
CREATE TABLE IF NOT EXISTS knowledge_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  document_type TEXT NOT NULL CHECK (document_type IN ('pdf', 'txt', 'docx', 'url', 'manual')),
  source_url TEXT,
  file_path TEXT,
  content TEXT,
  metadata JSONB DEFAULT '{}',
  word_count INTEGER,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Knowledge Embeddings table
CREATE TABLE IF NOT EXISTS knowledge_embeddings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID REFERENCES knowledge_documents(id) ON DELETE CASCADE,
  chunk_index INTEGER NOT NULL,
  chunk_text TEXT NOT NULL,
  embedding vector(1536), -- OpenAI embedding dimension
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Specialization Tracks table
CREATE TABLE IF NOT EXISTS specialization_tracks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  icon_url TEXT,
  required_knowledge_ids UUID[] DEFAULT '{}',
  recommended_knowledge_ids UUID[] DEFAULT '{}',
  certification_criteria JSONB DEFAULT '{}',
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Agent Knowledge Progress table
CREATE TABLE IF NOT EXISTS agent_knowledge_progress (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID REFERENCES canvas_ai_agents(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  document_id UUID REFERENCES knowledge_documents(id) ON DELETE CASCADE,
  progress_percentage INTEGER DEFAULT 0 CHECK (progress_percentage >= 0 AND progress_percentage <= 100),
  last_accessed TIMESTAMPTZ DEFAULT NOW(),
  quiz_scores JSONB DEFAULT '[]',
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(agent_id, document_id)
);

-- Agent Specialization Progress table
CREATE TABLE IF NOT EXISTS agent_specialization_progress (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID REFERENCES canvas_ai_agents(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  track_id UUID REFERENCES specialization_tracks(id) ON DELETE CASCADE,
  enrollment_date TIMESTAMPTZ DEFAULT NOW(),
  completion_date TIMESTAMPTZ,
  overall_progress INTEGER DEFAULT 0 CHECK (overall_progress >= 0 AND overall_progress <= 100),
  certificate_issued BOOLEAN DEFAULT false,
  certificate_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(agent_id, track_id)
);

-- Knowledge Quizzes table
CREATE TABLE IF NOT EXISTS knowledge_quizzes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID REFERENCES knowledge_documents(id) ON DELETE CASCADE,
  track_id UUID REFERENCES specialization_tracks(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  questions JSONB NOT NULL DEFAULT '[]',
  passing_score INTEGER DEFAULT 70 CHECK (passing_score >= 0 AND passing_score <= 100),
  time_limit_minutes INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Quiz Attempts table
CREATE TABLE IF NOT EXISTS quiz_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quiz_id UUID REFERENCES knowledge_quizzes(id) ON DELETE CASCADE,
  agent_id UUID REFERENCES canvas_ai_agents(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  score INTEGER CHECK (score >= 0 AND score <= 100),
  passed BOOLEAN DEFAULT false,
  answers JSONB DEFAULT '{}',
  time_taken_seconds INTEGER,
  attempted_at TIMESTAMPTZ DEFAULT NOW()
);

-- Custom Curricula table
CREATE TABLE IF NOT EXISTS custom_curricula (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  created_by UUID REFERENCES auth.users(id),
  document_ids UUID[] DEFAULT '{}',
  quiz_ids UUID[] DEFAULT '{}',
  target_agents UUID[] DEFAULT '{}',
  deadline TIMESTAMPTZ,
  is_mandatory BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Curriculum Enrollment table
CREATE TABLE IF NOT EXISTS curriculum_enrollment (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  curriculum_id UUID REFERENCES custom_curricula(id) ON DELETE CASCADE,
  agent_id UUID REFERENCES canvas_ai_agents(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  enrolled_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  progress INTEGER DEFAULT 0 CHECK (progress >= 0 AND progress <= 100),
  UNIQUE(curriculum_id, agent_id)
);

-- Knowledge Retention Tests table
CREATE TABLE IF NOT EXISTS retention_tests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID REFERENCES canvas_ai_agents(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  knowledge_ids UUID[] DEFAULT '{}',
  test_date TIMESTAMPTZ DEFAULT NOW(),
  retention_score INTEGER CHECK (retention_score >= 0 AND retention_score <= 100),
  weak_areas JSONB DEFAULT '[]',
  recommendations JSONB DEFAULT '[]'
);

-- =====================================================
-- PART 2: Create Indexes for Performance
-- =====================================================

-- Embeddings indexes for vector similarity search
CREATE INDEX IF NOT EXISTS idx_knowledge_embeddings_embedding ON knowledge_embeddings 
USING ivfflat (embedding vector_cosine_ops)
WITH (lists = 100);

CREATE INDEX IF NOT EXISTS idx_knowledge_embeddings_document_id ON knowledge_embeddings(document_id);
CREATE INDEX IF NOT EXISTS idx_knowledge_documents_type ON knowledge_documents(document_type);
CREATE INDEX IF NOT EXISTS idx_agent_knowledge_progress_agent_id ON agent_knowledge_progress(agent_id);
CREATE INDEX IF NOT EXISTS idx_agent_knowledge_progress_document_id ON agent_knowledge_progress(document_id);
CREATE INDEX IF NOT EXISTS idx_agent_specialization_progress_agent_id ON agent_specialization_progress(agent_id);
CREATE INDEX IF NOT EXISTS idx_agent_specialization_progress_track_id ON agent_specialization_progress(track_id);
CREATE INDEX IF NOT EXISTS idx_quiz_attempts_agent_id ON quiz_attempts(agent_id);
CREATE INDEX IF NOT EXISTS idx_quiz_attempts_quiz_id ON quiz_attempts(quiz_id);
CREATE INDEX IF NOT EXISTS idx_curriculum_enrollment_agent_id ON curriculum_enrollment(agent_id);
CREATE INDEX IF NOT EXISTS idx_curriculum_enrollment_curriculum_id ON curriculum_enrollment(curriculum_id);

-- =====================================================
-- PART 3: Enable Row Level Security (RLS)
-- =====================================================

ALTER TABLE knowledge_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE knowledge_embeddings ENABLE ROW LEVEL SECURITY;
ALTER TABLE specialization_tracks ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_knowledge_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_specialization_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE knowledge_quizzes ENABLE ROW LEVEL SECURITY;
ALTER TABLE quiz_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE custom_curricula ENABLE ROW LEVEL SECURITY;
ALTER TABLE curriculum_enrollment ENABLE ROW LEVEL SECURITY;
ALTER TABLE retention_tests ENABLE ROW LEVEL SECURITY;

-- =====================================================
-- PART 4: Create RLS Policies
-- =====================================================

-- Knowledge documents are viewable by all authenticated users
CREATE POLICY "Knowledge documents are viewable by authenticated users" 
  ON knowledge_documents FOR SELECT 
  TO authenticated 
  USING (true);

CREATE POLICY "Users can create knowledge documents" 
  ON knowledge_documents FOR INSERT 
  TO authenticated 
  WITH CHECK (created_by = auth.uid());

CREATE POLICY "Users can update their own knowledge documents" 
  ON knowledge_documents FOR UPDATE 
  TO authenticated 
  USING (created_by = auth.uid());

-- Knowledge embeddings follow document permissions
CREATE POLICY "Knowledge embeddings are viewable by authenticated users" 
  ON knowledge_embeddings FOR SELECT 
  TO authenticated 
  USING (true);

CREATE POLICY "System can manage embeddings" 
  ON knowledge_embeddings FOR ALL 
  TO authenticated 
  USING (true)
  WITH CHECK (true);

-- Specialization tracks are viewable by all
CREATE POLICY "Specialization tracks are viewable by authenticated users" 
  ON specialization_tracks FOR SELECT 
  TO authenticated 
  USING (is_active = true);

CREATE POLICY "Admins can manage specialization tracks" 
  ON specialization_tracks FOR ALL 
  TO authenticated 
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true));

-- Users can view their agents' progress
CREATE POLICY "Users can view own agent progress" 
  ON agent_knowledge_progress FOR SELECT 
  TO authenticated 
  USING (user_id = auth.uid());

CREATE POLICY "Users can manage own agent progress" 
  ON agent_knowledge_progress FOR ALL 
  TO authenticated 
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Specialization progress policies
CREATE POLICY "Users can view own agent specialization progress" 
  ON agent_specialization_progress FOR SELECT 
  TO authenticated 
  USING (user_id = auth.uid());

CREATE POLICY "Users can manage own agent specialization progress" 
  ON agent_specialization_progress FOR ALL 
  TO authenticated 
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Quiz policies
CREATE POLICY "Quizzes are viewable by authenticated users" 
  ON knowledge_quizzes FOR SELECT 
  TO authenticated 
  USING (true);

CREATE POLICY "Admins can manage quizzes" 
  ON knowledge_quizzes FOR ALL 
  TO authenticated 
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true));

-- Quiz attempts policies
CREATE POLICY "Users can view own quiz attempts" 
  ON quiz_attempts FOR SELECT 
  TO authenticated 
  USING (user_id = auth.uid());

CREATE POLICY "Users can create quiz attempts" 
  ON quiz_attempts FOR INSERT 
  TO authenticated 
  WITH CHECK (user_id = auth.uid());

-- Custom curricula policies
CREATE POLICY "Users can view curricula" 
  ON custom_curricula FOR SELECT 
  TO authenticated 
  USING (created_by = auth.uid() OR is_mandatory = true);

CREATE POLICY "Users can create curricula" 
  ON custom_curricula FOR INSERT 
  TO authenticated 
  WITH CHECK (created_by = auth.uid());

CREATE POLICY "Users can update own curricula" 
  ON custom_curricula FOR UPDATE 
  TO authenticated 
  USING (created_by = auth.uid());

-- Curriculum enrollment policies
CREATE POLICY "Users can view own enrollments" 
  ON curriculum_enrollment FOR SELECT 
  TO authenticated 
  USING (user_id = auth.uid());

CREATE POLICY "Users can manage own enrollments" 
  ON curriculum_enrollment FOR ALL 
  TO authenticated 
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Retention test policies
CREATE POLICY "Users can view own retention tests" 
  ON retention_tests FOR SELECT 
  TO authenticated 
  USING (user_id = auth.uid());

CREATE POLICY "Users can create retention tests" 
  ON retention_tests FOR INSERT 
  TO authenticated 
  WITH CHECK (user_id = auth.uid());

-- =====================================================
-- PART 5: Insert Default Specialization Tracks
-- =====================================================

INSERT INTO specialization_tracks (name, description, icon_url, certification_criteria) VALUES
(
  'Medical Device Sales',
  'Master the art of selling medical devices and equipment to healthcare providers',
  '/icons/medical-device.svg',
  '{
    "required_documents": 10,
    "minimum_quiz_score": 80,
    "practice_scenarios": 5
  }'::jsonb
),
(
  'Legal Compliance',
  'Understand healthcare regulations, HIPAA, and medical device compliance',
  '/icons/legal-compliance.svg',
  '{
    "required_documents": 8,
    "minimum_quiz_score": 85,
    "practice_scenarios": 3
  }'::jsonb
),
(
  'Technical Product Knowledge',
  'Deep dive into product specifications, features, and technical differentiators',
  '/icons/technical-knowledge.svg',
  '{
    "required_documents": 12,
    "minimum_quiz_score": 75,
    "practice_scenarios": 6
  }'::jsonb
),
(
  'Sales Excellence',
  'Advanced sales techniques, objection handling, and closing strategies',
  '/icons/sales-excellence.svg',
  '{
    "required_documents": 15,
    "minimum_quiz_score": 80,
    "practice_scenarios": 10
  }'::jsonb
)
ON CONFLICT (name) DO NOTHING;

-- =====================================================
-- PART 6: Create Helper Functions
-- =====================================================

-- Function to calculate agent's overall knowledge score
CREATE OR REPLACE FUNCTION calculate_agent_knowledge_score(p_agent_id UUID)
RETURNS INTEGER AS $$
DECLARE
  v_score INTEGER;
BEGIN
  SELECT 
    COALESCE(AVG(progress_percentage), 0)::INTEGER INTO v_score
  FROM agent_knowledge_progress
  WHERE agent_id = p_agent_id;
  
  RETURN v_score;
END;
$$ LANGUAGE plpgsql;

-- Function to check if agent completed a specialization
CREATE OR REPLACE FUNCTION check_specialization_completion(p_agent_id UUID, p_track_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
  v_completed BOOLEAN := false;
  v_criteria JSONB;
  v_required_docs INTEGER;
  v_completed_docs INTEGER;
  v_min_quiz_score INTEGER;
  v_avg_quiz_score INTEGER;
BEGIN
  -- Get certification criteria
  SELECT certification_criteria INTO v_criteria
  FROM specialization_tracks
  WHERE id = p_track_id;
  
  v_required_docs := COALESCE((v_criteria->>'required_documents')::INTEGER, 0);
  v_min_quiz_score := COALESCE((v_criteria->>'minimum_quiz_score')::INTEGER, 70);
  
  -- Count completed documents
  SELECT COUNT(*) INTO v_completed_docs
  FROM agent_knowledge_progress akp
  JOIN knowledge_documents kd ON akp.document_id = kd.id
  JOIN specialization_tracks st ON kd.id = ANY(st.required_knowledge_ids)
  WHERE akp.agent_id = p_agent_id 
    AND st.id = p_track_id
    AND akp.progress_percentage >= 100;
  
  -- Get average quiz score
  SELECT AVG(score)::INTEGER INTO v_avg_quiz_score
  FROM quiz_attempts qa
  JOIN knowledge_quizzes kq ON qa.quiz_id = kq.id
  WHERE qa.agent_id = p_agent_id
    AND kq.track_id = p_track_id
    AND qa.passed = true;
  
  -- Check if criteria are met
  IF v_completed_docs >= v_required_docs AND v_avg_quiz_score >= v_min_quiz_score THEN
    v_completed := true;
  END IF;
  
  RETURN v_completed;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- Migration Complete
-- =====================================================