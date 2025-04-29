-- SQL script to create the sessions table in Supabase (without cron scheduling)

-- Create the sessions table
CREATE TABLE IF NOT EXISTS sessions (
  sid VARCHAR PRIMARY KEY,
  sess JSONB NOT NULL,
  expires TIMESTAMPTZ NOT NULL
);

-- Create an index on the expires column for efficient cleanup of expired sessions
CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions (expires);

-- Create a function to manually clean up expired sessions
-- You can run this function periodically through the Supabase SQL Editor
CREATE OR REPLACE FUNCTION cleanup_expired_sessions()
RETURNS void AS $$
BEGIN
  DELETE FROM sessions WHERE expires < NOW();
END;
$$ LANGUAGE plpgsql;

-- To manually run the cleanup function, execute:
-- SELECT cleanup_expired_sessions();
