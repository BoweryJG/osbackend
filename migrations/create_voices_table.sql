-- ============================================
-- VOICES TABLE FOR VOICE CLONING
-- ============================================
-- Stores voice profiles created through voice cloning
-- ============================================

-- Create voices table
CREATE TABLE IF NOT EXISTS voices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  voice_id VARCHAR(255) UNIQUE NOT NULL, -- ElevenLabs voice ID
  name VARCHAR(255) NOT NULL,
  description TEXT,
  provider VARCHAR(50) DEFAULT 'elevenlabs',
  preview_url TEXT,
  labels JSONB DEFAULT '{}',
  settings JSONB DEFAULT '{}', -- Voice settings (stability, similarity_boost, etc.)
  metadata JSONB DEFAULT '{}', -- Additional metadata (source URL, platform, etc.)
  is_active BOOLEAN DEFAULT true,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes
CREATE INDEX idx_voices_voice_id ON voices(voice_id);
CREATE INDEX idx_voices_created_by ON voices(created_by);
CREATE INDEX idx_voices_is_active ON voices(is_active);
CREATE INDEX idx_voices_provider ON voices(provider);

-- Create updated_at trigger
CREATE TRIGGER update_voices_updated_at
  BEFORE UPDATE ON voices
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Add RLS policies
ALTER TABLE voices ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view all active voices
CREATE POLICY "Active voices are viewable by all authenticated users" ON voices
  FOR SELECT
  USING (auth.role() = 'authenticated' AND is_active = true);

-- Policy: Users can only insert their own voices
CREATE POLICY "Users can insert their own voices" ON voices
  FOR INSERT
  WITH CHECK (auth.uid() = created_by);

-- Policy: Users can only update their own voices
CREATE POLICY "Users can update their own voices" ON voices
  FOR UPDATE
  USING (auth.uid() = created_by)
  WITH CHECK (auth.uid() = created_by);

-- Policy: Users can only delete their own voices
CREATE POLICY "Users can delete their own voices" ON voices
  FOR DELETE
  USING (auth.uid() = created_by);

-- Comments
COMMENT ON TABLE voices IS 'Stores voice profiles created through voice cloning';
COMMENT ON COLUMN voices.voice_id IS 'Unique identifier from the voice provider (e.g., ElevenLabs)';
COMMENT ON COLUMN voices.name IS 'User-friendly name for the voice';
COMMENT ON COLUMN voices.description IS 'Description of the voice or its source';
COMMENT ON COLUMN voices.provider IS 'Voice provider service (e.g., elevenlabs)';
COMMENT ON COLUMN voices.preview_url IS 'URL to preview audio sample of the voice';
COMMENT ON COLUMN voices.labels IS 'Key-value pairs for categorizing voices';
COMMENT ON COLUMN voices.settings IS 'Voice-specific settings like stability, similarity boost';
COMMENT ON COLUMN voices.metadata IS 'Additional metadata like source URL, platform, duration';
COMMENT ON COLUMN voices.is_active IS 'Whether the voice is currently available for use';
COMMENT ON COLUMN voices.created_by IS 'User who created this voice profile';