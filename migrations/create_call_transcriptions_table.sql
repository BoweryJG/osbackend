-- Create table for storing real-time call transcriptions
CREATE TABLE IF NOT EXISTS call_transcriptions (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    call_sid VARCHAR(255) NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'pending', -- 'pending', 'active', 'completed', 'failed'
    transcription TEXT DEFAULT '',
    partial_transcriptions JSONB DEFAULT '[]',
    metadata JSONB DEFAULT '{}',
    started_at TIMESTAMP WITH TIME ZONE,
    ended_at TIMESTAMP WITH TIME ZONE,
    duration_seconds INTEGER,
    error_message TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for better query performance
CREATE INDEX idx_call_transcriptions_call_sid ON call_transcriptions(call_sid);
CREATE INDEX idx_call_transcriptions_status ON call_transcriptions(status);
CREATE INDEX idx_call_transcriptions_created_at ON call_transcriptions(created_at);

-- Add foreign key constraint to link with twilio_calls table
ALTER TABLE call_transcriptions 
ADD CONSTRAINT fk_call_transcriptions_call_sid 
FOREIGN KEY (call_sid) 
REFERENCES twilio_calls(call_sid) 
ON DELETE CASCADE;

-- Create trigger to automatically update the updated_at column
CREATE TRIGGER update_call_transcriptions_updated_at 
BEFORE UPDATE ON call_transcriptions
FOR EACH ROW 
EXECUTE FUNCTION update_updated_at_column();

-- Add RLS policies
ALTER TABLE call_transcriptions ENABLE ROW LEVEL SECURITY;

-- Policy to allow users to view their own call transcriptions
CREATE POLICY call_transcriptions_user_policy ON call_transcriptions
FOR SELECT
USING (
    EXISTS (
        SELECT 1 FROM twilio_calls 
        WHERE twilio_calls.call_sid = call_transcriptions.call_sid 
        AND twilio_calls.user_id = auth.uid()
    )
);

-- Policy to allow service role full access
CREATE POLICY call_transcriptions_service_policy ON call_transcriptions
FOR ALL
USING (auth.role() = 'service_role')
WITH CHECK (auth.role() = 'service_role');

-- Add comment to the table
COMMENT ON TABLE call_transcriptions IS 'Stores real-time transcriptions for Twilio calls';
COMMENT ON COLUMN call_transcriptions.partial_transcriptions IS 'Array of partial transcription objects with text and timestamps';
COMMENT ON COLUMN call_transcriptions.metadata IS 'Additional metadata including stream info, tracks, etc.';