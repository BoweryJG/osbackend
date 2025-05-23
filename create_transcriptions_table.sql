-- Create table for storing transcriptions from various sources (audio uploads, Twilio calls, etc.)
CREATE TABLE IF NOT EXISTS transcriptions (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID,
    filename VARCHAR(255),
    file_url TEXT,
    transcription TEXT NOT NULL,
    duration_seconds INTEGER,
    analysis JSONB,
    status VARCHAR(50) DEFAULT 'pending', -- 'pending', 'processing', 'completed', 'failed'
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for better query performance
CREATE INDEX idx_transcriptions_user_id ON transcriptions(user_id);
CREATE INDEX idx_transcriptions_status ON transcriptions(status);
CREATE INDEX idx_transcriptions_created_at ON transcriptions(created_at);

-- Add updated_at trigger function if it doesn't exist
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create trigger to automatically update the updated_at column
CREATE TRIGGER update_transcriptions_updated_at BEFORE UPDATE ON transcriptions
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
