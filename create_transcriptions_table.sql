-- Create transcriptions table for storing audio transcription records
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE IF NOT EXISTS transcriptions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id TEXT NOT NULL,
  filename TEXT NOT NULL,
  file_url TEXT NOT NULL,
  transcription TEXT,
  duration_seconds INTEGER,
  analysis TEXT,
  status TEXT DEFAULT 'processing',
  error TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for common lookups
CREATE INDEX IF NOT EXISTS idx_transcriptions_user_id ON transcriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_transcriptions_created_at ON transcriptions(created_at);
CREATE INDEX IF NOT EXISTS idx_transcriptions_status ON transcriptions(status);

-- Automatically update the updated_at column
CREATE OR REPLACE FUNCTION update_transcriptions_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_transcriptions_updated_at
BEFORE UPDATE ON transcriptions
FOR EACH ROW
EXECUTE FUNCTION update_transcriptions_updated_at();

-- Enable row level security and policies
ALTER TABLE transcriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY transcriptions_user_policy ON transcriptions
  USING (user_id = auth.uid()::text);

CREATE POLICY transcriptions_service_policy ON transcriptions
  USING (TRUE)
  WITH CHECK (TRUE);
