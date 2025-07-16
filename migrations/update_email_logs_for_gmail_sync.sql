-- Update email_logs table to support Gmail sync
-- Add missing columns that the Gmail sync service expects

-- First, add new columns if they don't exist
DO $$ 
BEGIN
    -- Add body column for email content
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'email_logs' AND column_name = 'body') THEN
        ALTER TABLE email_logs ADD COLUMN body TEXT;
    END IF;
    
    -- Add email_type column to distinguish inbound/outbound
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'email_logs' AND column_name = 'email_type') THEN
        ALTER TABLE email_logs ADD COLUMN email_type TEXT DEFAULT 'outbound' CHECK (email_type IN ('inbound', 'outbound'));
    END IF;
    
    -- Add Gmail-specific columns
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'email_logs' AND column_name = 'gmail_message_id') THEN
        ALTER TABLE email_logs ADD COLUMN gmail_message_id TEXT;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'email_logs' AND column_name = 'thread_id') THEN
        ALTER TABLE email_logs ADD COLUMN thread_id TEXT;
    END IF;
    
    -- Add updated_at column if it doesn't exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'email_logs' AND column_name = 'updated_at') THEN
        ALTER TABLE email_logs ADD COLUMN updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP;
    END IF;
    
    -- Update status column to allow more statuses
    ALTER TABLE email_logs DROP CONSTRAINT IF EXISTS email_logs_status_check;
    ALTER TABLE email_logs ADD CONSTRAINT email_logs_status_check 
        CHECK (status IN ('sent', 'failed', 'bounced', 'opened', 'clicked', 'synced', 'draft'));
END $$;

-- Make status column nullable and set default
ALTER TABLE email_logs ALTER COLUMN status SET DEFAULT 'synced';
ALTER TABLE email_logs ALTER COLUMN status DROP NOT NULL;

-- Create indexes for Gmail sync performance
CREATE INDEX IF NOT EXISTS idx_email_logs_gmail_message_id ON email_logs(gmail_message_id);
CREATE INDEX IF NOT EXISTS idx_email_logs_thread_id ON email_logs(thread_id);
CREATE INDEX IF NOT EXISTS idx_email_logs_email_type ON email_logs(email_type);
CREATE INDEX IF NOT EXISTS idx_email_logs_from_email ON email_logs(from_email);
CREATE INDEX IF NOT EXISTS idx_email_logs_to_email ON email_logs(to_email);

-- Create policy for service role to insert emails (for backend sync)
CREATE POLICY IF NOT EXISTS "Service role can manage email logs" ON email_logs
    FOR ALL USING (true);

-- Grant necessary permissions
GRANT ALL ON email_logs TO service_role;

-- Add comment to table
COMMENT ON TABLE email_logs IS 'Stores email logs including Gmail synced emails';
COMMENT ON COLUMN email_logs.gmail_message_id IS 'Gmail API message ID for synced emails';
COMMENT ON COLUMN email_logs.thread_id IS 'Gmail thread ID for email conversations';
COMMENT ON COLUMN email_logs.email_type IS 'Type of email: inbound or outbound';
COMMENT ON COLUMN email_logs.body IS 'Email body content';