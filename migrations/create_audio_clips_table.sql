-- Create audio_clips table for storing audio clip metadata
CREATE TABLE IF NOT EXISTS audio_clips (
    id UUID PRIMARY KEY,
    text TEXT NOT NULL,
    voice VARCHAR(50) NOT NULL,
    formats JSONB NOT NULL,
    share_url TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    analytics JSONB DEFAULT '{
        "plays": 0,
        "unique_listeners": 0,
        "devices": {},
        "locations": {},
        "downloads": 0,
        "shares": 0,
        "sms_deliveries": 0
    }'::jsonb,
    metadata JSONB DEFAULT '{}'::jsonb
);

-- Create index on expires_at for cleanup queries
CREATE INDEX idx_audio_clips_expires_at ON audio_clips(expires_at);

-- Create index on created_at for sorting
CREATE INDEX idx_audio_clips_created_at ON audio_clips(created_at);

-- Create function to automatically delete expired clips
CREATE OR REPLACE FUNCTION delete_expired_audio_clips()
RETURNS void AS $$
BEGIN
    DELETE FROM audio_clips 
    WHERE expires_at < CURRENT_TIMESTAMP;
END;
$$ LANGUAGE plpgsql;

-- Create a scheduled job to run cleanup daily (requires pg_cron extension)
-- Note: pg_cron must be enabled in Supabase dashboard
-- SELECT cron.schedule('cleanup-expired-audio-clips', '0 2 * * *', 'SELECT delete_expired_audio_clips();');

-- Create RLS policies if row level security is enabled
ALTER TABLE audio_clips ENABLE ROW LEVEL SECURITY;

-- Policy to allow public read access to clips
CREATE POLICY "Audio clips are publicly readable" ON audio_clips
    FOR SELECT USING (true);

-- Policy to allow authenticated users to create clips
CREATE POLICY "Authenticated users can create clips" ON audio_clips
    FOR INSERT WITH CHECK (auth.role() = 'authenticated');

-- Policy to allow service role full access
CREATE POLICY "Service role has full access" ON audio_clips
    FOR ALL USING (auth.role() = 'service_role');