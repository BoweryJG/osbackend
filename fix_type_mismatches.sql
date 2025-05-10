-- Fix potential type mismatches between UUID and TEXT
-- This script is safe to run multiple times

-- For app_data table
DO $$
BEGIN
  -- Only attempt to drop if policy exists
  IF EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'app_data_user_policy'
  ) THEN
    DROP POLICY IF EXISTS app_data_user_policy ON app_data;
  END IF;
END
$$;

-- Recreate policy with proper type cast
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'app_data') THEN
    CREATE POLICY app_data_user_policy ON app_data
      USING (user_id = auth.uid()::text);
  END IF;
END
$$;

-- Ensure consistent types in user_subscriptions and module_access tables
DO $$
BEGIN
  -- If Supabase auth is used and user_subscriptions exists with a UUID user_id
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'user_subscriptions' 
    AND column_name = 'user_id' 
    AND data_type = 'uuid'
  ) THEN
    -- Add migration note
    RAISE NOTICE 'Consider migrating user_subscriptions.user_id from UUID to TEXT if needed.';
    -- Instructions for manual migration if needed would go here
  END IF;
END
$$;

-- Add message about checking data consistency
DO $$
BEGIN
  RAISE NOTICE 'Type mismatch fixes applied. Check data consistency and relationships between tables.';
END
$$;
