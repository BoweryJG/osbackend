-- Master Database Setup Script for Supabase
-- Run this script in your Supabase SQL Editor to set up all tables

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create a simple users view that references auth.users
-- This fixes the health check that expects a 'users' table
CREATE OR REPLACE VIEW public.users AS
SELECT 
  id,
  email,
  created_at,
  updated_at
FROM auth.users;

-- Grant permissions on the view
GRANT SELECT ON public.users TO anon, authenticated;

-- Now run all your migration scripts in order:

-- 1. Core user tables
\i create_user_registrations_table.sql
\i create_subscriptions_table.sql
\i add_stripe_fields_to_subscriptions.sql

-- 2. Session and access tables
\i create_sessions_table.sql
\i create_module_access_table.sql
\i create_app_data_table.sql

-- 3. Communication tables
\i create_twilio_tables.sql
\i migrations/create_phone_system_tables.sql
\i migrations/create_email_tables.sql

-- 4. AI and transcription tables
\i create_transcriptions_table.sql
\i migrations/create_call_transcriptions_table.sql
\i migrations/create_call_intelligence_tables.sql

-- 5. Canvas agents tables
\i migrations/create_canvas_agents_tables.sql
\i migrations/add_agent_procedure_features.sql

-- 6. Usage tracking
\i create_usage_logs_table.sql

-- 7. Fix any type mismatches
\i fix_type_mismatches.sql

-- Create profiles table if it doesn't exist
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT,
  full_name TEXT,
  avatar_url TEXT,
  is_admin BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS on profiles
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Create policy for profiles
CREATE POLICY "Users can view own profile" ON public.profiles
  FOR SELECT USING (auth.uid() = id);

-- Create a trigger to automatically create a profile when a user signs up
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.profiles (id, email)
  VALUES (new.id, new.email);
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();