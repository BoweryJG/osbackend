-- Create table for storing Twilio call records
CREATE TABLE IF NOT EXISTS twilio_calls (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    call_sid VARCHAR(255) UNIQUE NOT NULL,
    phone_number_sid VARCHAR(255),
    from_number VARCHAR(50) NOT NULL,
    to_number VARCHAR(50) NOT NULL,
    direction VARCHAR(20) NOT NULL, -- 'inbound' or 'outbound'
    status VARCHAR(50) NOT NULL, -- 'queued', 'ringing', 'in-progress', 'completed', 'failed', 'busy', 'no-answer'
    duration INTEGER DEFAULT 0,
    recording_url TEXT,
    recording_sid VARCHAR(255),
    transcription_id UUID,
    user_id UUID,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create table for storing SMS messages
CREATE TABLE IF NOT EXISTS twilio_sms (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    message_sid VARCHAR(255) UNIQUE NOT NULL,
    from_number VARCHAR(50) NOT NULL,
    to_number VARCHAR(50) NOT NULL,
    body TEXT NOT NULL,
    direction VARCHAR(20) NOT NULL, -- 'inbound' or 'outbound'
    status VARCHAR(50) NOT NULL, -- 'queued', 'sending', 'sent', 'delivered', 'undelivered', 'failed'
    num_segments INTEGER DEFAULT 1,
    user_id UUID,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create table for storing Twilio recordings
CREATE TABLE IF NOT EXISTS twilio_recordings (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    recording_sid VARCHAR(255) UNIQUE NOT NULL,
    call_sid VARCHAR(255) NOT NULL REFERENCES twilio_calls(call_sid) ON DELETE CASCADE,
    recording_url TEXT NOT NULL,
    duration INTEGER NOT NULL,
    transcription_id UUID,
    status VARCHAR(50) DEFAULT 'pending', -- 'pending', 'processing', 'completed', 'failed'
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for better query performance
CREATE INDEX idx_twilio_calls_call_sid ON twilio_calls(call_sid);
CREATE INDEX idx_twilio_calls_from_number ON twilio_calls(from_number);
CREATE INDEX idx_twilio_calls_to_number ON twilio_calls(to_number);
CREATE INDEX idx_twilio_calls_created_at ON twilio_calls(created_at);
CREATE INDEX idx_twilio_calls_user_id ON twilio_calls(user_id);

CREATE INDEX idx_twilio_sms_message_sid ON twilio_sms(message_sid);
CREATE INDEX idx_twilio_sms_from_number ON twilio_sms(from_number);
CREATE INDEX idx_twilio_sms_to_number ON twilio_sms(to_number);
CREATE INDEX idx_twilio_sms_created_at ON twilio_sms(created_at);
CREATE INDEX idx_twilio_sms_user_id ON twilio_sms(user_id);

CREATE INDEX idx_twilio_recordings_recording_sid ON twilio_recordings(recording_sid);
CREATE INDEX idx_twilio_recordings_call_sid ON twilio_recordings(call_sid);

-- Add updated_at trigger function if it doesn't exist
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create triggers to automatically update the updated_at column
CREATE TRIGGER update_twilio_calls_updated_at BEFORE UPDATE ON twilio_calls
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_twilio_sms_updated_at BEFORE UPDATE ON twilio_sms
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_twilio_recordings_updated_at BEFORE UPDATE ON twilio_recordings
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
