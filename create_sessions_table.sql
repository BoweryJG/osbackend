-- SQL script to create the sessions table in Supabase

-- Create the sessions table
CREATE TABLE IF NOT EXISTS sessions (
  sid VARCHAR PRIMARY KEY,
  sess JSONB NOT NULL,
  expires TIMESTAMPTZ NOT NULL
);

-- Create an index on the expires column for efficient cleanup of expired sessions
CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions (expires);

-- Optional: Create a function and trigger to automatically clean up expired sessions
-- This will run daily to remove expired sessions
CREATE OR REPLACE FUNCTION cleanup_expired_sessions()
RETURNS void AS $$
BEGIN
  DELETE FROM sessions WHERE expires < NOW();
END;
$$ LANGUAGE plpgsql;

-- Schedule the cleanup function to run daily
SELECT cron.schedule(
  'cleanup-expired-sessions',
  '0 0 * * *', -- Run at midnight every day
  $$SELECT cleanup_expired_sessions()$$
);

-- Note: The cron scheduler requires the pg_cron extension.
-- If you get an error about the cron schema not existing, you may need to
-- enable the pg_cron extension in your Supabase project settings first.
-- If you can't enable pg_cron, you can skip the scheduling part and
-- manually run the cleanup function periodically.
