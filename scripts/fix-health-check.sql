-- Fix for health check expecting 'users' table
-- This creates a simple view that won't conflict with your existing schema

-- Create a users view that the health check can query
-- This uses your existing user_subscriptions table
CREATE OR REPLACE VIEW public.users AS
SELECT 
  user_id as id,
  email,
  created_at,
  updated_at
FROM public.user_subscriptions;

-- Grant permissions on the view
GRANT SELECT ON public.users TO anon, authenticated;

-- This view will satisfy the health check without breaking your existing schema