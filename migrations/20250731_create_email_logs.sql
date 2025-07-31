-- Create email_send_logs table for tracking all emails sent via SES
CREATE TABLE IF NOT EXISTS email_send_logs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  message_id VARCHAR(255) NOT NULL,
  recipients TEXT[] NOT NULL,
  subject TEXT,
  tier VARCHAR(10) NOT NULL,
  service VARCHAR(20) DEFAULT 'ses',
  sent_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for faster lookups
CREATE INDEX idx_email_send_logs_user ON email_send_logs(user_id);
CREATE INDEX idx_email_send_logs_sent_at ON email_send_logs(sent_at);
CREATE INDEX idx_email_send_logs_message_id ON email_send_logs(message_id);

-- Add RLS policies
ALTER TABLE email_send_logs ENABLE ROW LEVEL SECURITY;

-- Users can view their own email logs
CREATE POLICY "Users can view own email logs" ON email_send_logs
  FOR SELECT USING (auth.uid() = user_id);

-- Service role can manage all logs
CREATE POLICY "Service role can manage email logs" ON email_send_logs
  FOR ALL USING (auth.role() = 'service_role');