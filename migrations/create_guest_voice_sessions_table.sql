-- Create table for tracking guest/trial voice sessions
CREATE TABLE IF NOT EXISTS guest_voice_sessions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  session_id TEXT UNIQUE NOT NULL,
  agent_id UUID REFERENCES unified_agents(id) ON DELETE SET NULL,
  client_identifier TEXT NOT NULL, -- Hashed IP + User-Agent for tracking
  started_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  ended_at TIMESTAMP WITH TIME ZONE,
  duration_seconds INTEGER DEFAULT 0,
  max_duration_seconds INTEGER DEFAULT 300, -- 5 minutes (300 seconds)
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'completed', 'expired', 'disconnected')),
  disconnect_reason TEXT, -- 'time_limit', 'user_action', 'error', etc.
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index for fast lookups
CREATE INDEX idx_guest_voice_sessions_client ON guest_voice_sessions(client_identifier);
CREATE INDEX idx_guest_voice_sessions_status ON guest_voice_sessions(status);
CREATE INDEX idx_guest_voice_sessions_created ON guest_voice_sessions(created_at);

-- Function to check if client has remaining trial time today
CREATE OR REPLACE FUNCTION get_remaining_trial_seconds(p_client_identifier TEXT)
RETURNS INTEGER AS $$
DECLARE
  used_seconds INTEGER;
  daily_limit INTEGER := 300; -- 5 minutes per day
BEGIN
  -- Calculate total seconds used today by this client
  SELECT COALESCE(SUM(duration_seconds), 0) INTO used_seconds
  FROM guest_voice_sessions
  WHERE client_identifier = p_client_identifier
    AND created_at >= CURRENT_DATE
    AND status IN ('completed', 'expired');
  
  -- Return remaining seconds (minimum 0)
  RETURN GREATEST(0, daily_limit - used_seconds);
END;
$$ LANGUAGE plpgsql;

-- Function to update session duration
CREATE OR REPLACE FUNCTION update_guest_session_duration(p_session_id TEXT, p_duration INTEGER)
RETURNS BOOLEAN AS $$
DECLARE
  session_record RECORD;
BEGIN
  -- Get session details
  SELECT * INTO session_record
  FROM guest_voice_sessions
  WHERE session_id = p_session_id
    AND status = 'active';
  
  IF NOT FOUND THEN
    RETURN FALSE;
  END IF;
  
  -- Update duration
  UPDATE guest_voice_sessions
  SET 
    duration_seconds = p_duration,
    updated_at = NOW(),
    status = CASE 
      WHEN p_duration >= max_duration_seconds THEN 'expired'
      ELSE status
    END,
    ended_at = CASE
      WHEN p_duration >= max_duration_seconds THEN NOW()
      ELSE ended_at
    END,
    disconnect_reason = CASE
      WHEN p_duration >= max_duration_seconds THEN 'time_limit'
      ELSE disconnect_reason
    END
  WHERE session_id = p_session_id;
  
  RETURN TRUE;
END;
$$ LANGUAGE plpgsql;

-- RLS Policies
ALTER TABLE guest_voice_sessions ENABLE ROW LEVEL SECURITY;

-- Allow anyone to read their own sessions (by session_id)
CREATE POLICY "Anyone can read their own guest sessions"
  ON guest_voice_sessions
  FOR SELECT
  USING (true); -- Sessions are anonymous, identified by session_id

-- Service role can do everything
CREATE POLICY "Service role has full access to guest sessions"
  ON guest_voice_sessions
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Grant permissions
GRANT SELECT ON guest_voice_sessions TO anon, authenticated;
GRANT INSERT ON guest_voice_sessions TO anon, authenticated;
GRANT UPDATE ON guest_voice_sessions TO anon, authenticated;
GRANT EXECUTE ON FUNCTION get_remaining_trial_seconds(TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION update_guest_session_duration(TEXT, INTEGER) TO anon, authenticated;