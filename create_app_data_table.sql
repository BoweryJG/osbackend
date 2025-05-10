-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create app_data table for centralized data storage across all modules
CREATE TABLE IF NOT EXISTS app_data (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  app_name TEXT NOT NULL,
  user_id TEXT NOT NULL,
  data JSONB NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for faster lookups
CREATE INDEX IF NOT EXISTS idx_app_data_user_id ON app_data(user_id);
CREATE INDEX IF NOT EXISTS idx_app_data_app_name ON app_data(app_name);
CREATE INDEX IF NOT EXISTS idx_app_data_user_app ON app_data(user_id, app_name);

-- Add GIN index for JSONB data to enable efficient querying of JSON properties
CREATE INDEX IF NOT EXISTS idx_app_data_gin ON app_data USING GIN (data);

-- Add comment to table
COMMENT ON TABLE app_data IS 'Centralized storage for all application data across modules';

-- Create function to automatically update the updated_at timestamp
CREATE OR REPLACE FUNCTION update_app_data_updated_at()
RETURNS TRIGGER AS $$
BEGIN
   NEW.updated_at = NOW();
   RETURN NEW;
END;
$$ LANGUAGE 'plpgsql';

-- Create trigger to call the function
CREATE TRIGGER update_app_data_updated_at
BEFORE UPDATE ON app_data
FOR EACH ROW
EXECUTE FUNCTION update_app_data_updated_at();

-- Create Row Level Security policies
ALTER TABLE app_data ENABLE ROW LEVEL SECURITY;

-- Create policy for users to access only their own data
CREATE POLICY app_data_user_policy ON app_data
  USING (user_id = auth.uid()::text);

-- Create policy for service role to access all data
CREATE POLICY app_data_service_policy ON app_data
  USING (TRUE)
  WITH CHECK (TRUE);
