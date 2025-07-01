-- Migration: Create Call Intelligence Tables
-- Description: Creates tables for real-time transcription and call intelligence features
-- Date: 2025-07-01

-- Create call_summaries table
CREATE TABLE IF NOT EXISTS call_summaries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    call_sid VARCHAR(255) NOT NULL UNIQUE,
    summary TEXT,
    key_points JSONB DEFAULT '[]'::jsonb,
    action_items JSONB DEFAULT '[]'::jsonb,
    sentiment_score DECIMAL(3,2) CHECK (sentiment_score >= -1 AND sentiment_score <= 1),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for call_summaries
CREATE INDEX idx_call_summaries_call_sid ON call_summaries(call_sid);
CREATE INDEX idx_call_summaries_created_at ON call_summaries(created_at DESC);
CREATE INDEX idx_call_summaries_sentiment_score ON call_summaries(sentiment_score);

-- Create call_streams table
CREATE TABLE IF NOT EXISTS call_streams (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    call_sid VARCHAR(255) NOT NULL,
    stream_sid VARCHAR(255) NOT NULL UNIQUE,
    status VARCHAR(50) DEFAULT 'initiated' CHECK (status IN ('initiated', 'connected', 'disconnected', 'failed')),
    started_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    ended_at TIMESTAMP WITH TIME ZONE,
    CONSTRAINT chk_ended_after_started CHECK (ended_at IS NULL OR ended_at >= started_at)
);

-- Create indexes for call_streams
CREATE INDEX idx_call_streams_call_sid ON call_streams(call_sid);
CREATE INDEX idx_call_streams_stream_sid ON call_streams(stream_sid);
CREATE INDEX idx_call_streams_status ON call_streams(status);
CREATE INDEX idx_call_streams_started_at ON call_streams(started_at DESC);

-- Create real_time_transcriptions table
CREATE TABLE IF NOT EXISTS real_time_transcriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    call_sid VARCHAR(255) NOT NULL,
    text TEXT NOT NULL,
    timestamp TIMESTAMP WITH TIME ZONE NOT NULL,
    speaker VARCHAR(50) DEFAULT 'unknown',
    confidence DECIMAL(3,2) CHECK (confidence >= 0 AND confidence <= 1),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for real_time_transcriptions
CREATE INDEX idx_real_time_transcriptions_call_sid ON real_time_transcriptions(call_sid);
CREATE INDEX idx_real_time_transcriptions_timestamp ON real_time_transcriptions(timestamp);
CREATE INDEX idx_real_time_transcriptions_speaker ON real_time_transcriptions(speaker);
CREATE INDEX idx_real_time_transcriptions_created_at ON real_time_transcriptions(created_at DESC);

-- Add full-text search index on transcription text
CREATE INDEX idx_real_time_transcriptions_text_search ON real_time_transcriptions USING GIN(to_tsvector('english', text));

-- Update twilio_calls table to add new fields
ALTER TABLE twilio_calls 
ADD COLUMN IF NOT EXISTS summary_id UUID,
ADD COLUMN IF NOT EXISTS stream_sid VARCHAR(255),
ADD COLUMN IF NOT EXISTS real_time_transcript JSONB DEFAULT '[]'::jsonb;

-- Add foreign key constraint to call_summaries
ALTER TABLE twilio_calls
ADD CONSTRAINT fk_twilio_calls_summary 
FOREIGN KEY (summary_id) 
REFERENCES call_summaries(id) 
ON DELETE SET NULL;

-- Add indexes for new twilio_calls columns
CREATE INDEX idx_twilio_calls_summary_id ON twilio_calls(summary_id);
CREATE INDEX idx_twilio_calls_stream_sid ON twilio_calls(stream_sid);

-- Add foreign key constraints for call_sid references
-- Note: These assume twilio_calls has a sid column that stores the call_sid
-- If the column name is different, adjust accordingly

-- Add foreign key for call_summaries
ALTER TABLE call_summaries
ADD CONSTRAINT fk_call_summaries_call_sid
FOREIGN KEY (call_sid)
REFERENCES twilio_calls(sid)
ON DELETE CASCADE;

-- Add foreign key for call_streams
ALTER TABLE call_streams
ADD CONSTRAINT fk_call_streams_call_sid
FOREIGN KEY (call_sid)
REFERENCES twilio_calls(sid)
ON DELETE CASCADE;

-- Add foreign key for real_time_transcriptions
ALTER TABLE real_time_transcriptions
ADD CONSTRAINT fk_real_time_transcriptions_call_sid
FOREIGN KEY (call_sid)
REFERENCES twilio_calls(sid)
ON DELETE CASCADE;

-- Create a composite index for efficient querying of transcriptions by call and time
CREATE INDEX idx_real_time_transcriptions_call_timestamp 
ON real_time_transcriptions(call_sid, timestamp DESC);

-- Create a view for easy access to call intelligence data
CREATE OR REPLACE VIEW call_intelligence_overview AS
SELECT 
    tc.sid AS call_sid,
    tc.from_number,
    tc.to_number,
    tc.status AS call_status,
    tc.duration,
    tc.created_at AS call_created_at,
    cs.summary,
    cs.key_points,
    cs.action_items,
    cs.sentiment_score,
    cst.stream_sid,
    cst.status AS stream_status,
    COUNT(DISTINCT rt.id) AS transcription_count,
    MIN(rt.timestamp) AS first_transcription_time,
    MAX(rt.timestamp) AS last_transcription_time
FROM twilio_calls tc
LEFT JOIN call_summaries cs ON tc.summary_id = cs.id
LEFT JOIN call_streams cst ON tc.sid = cst.call_sid
LEFT JOIN real_time_transcriptions rt ON tc.sid = rt.call_sid
GROUP BY 
    tc.sid, tc.from_number, tc.to_number, tc.status, 
    tc.duration, tc.created_at, cs.summary, cs.key_points, 
    cs.action_items, cs.sentiment_score, cst.stream_sid, cst.status;

-- Add comments for documentation
COMMENT ON TABLE call_summaries IS 'Stores AI-generated summaries and insights for calls';
COMMENT ON TABLE call_streams IS 'Tracks real-time streaming sessions for calls';
COMMENT ON TABLE real_time_transcriptions IS 'Stores real-time transcription segments from calls';
COMMENT ON COLUMN call_summaries.sentiment_score IS 'Sentiment score ranging from -1 (negative) to 1 (positive)';
COMMENT ON COLUMN real_time_transcriptions.confidence IS 'Transcription confidence score from 0 to 1';
COMMENT ON COLUMN twilio_calls.real_time_transcript IS 'JSONB array of real-time transcript segments';