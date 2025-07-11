-- Diagnostic script to find user_id column issues
-- Run this in Supabase SQL Editor to identify the problem

-- Check which tables exist and which have user_id columns
WITH table_info AS (
  SELECT 
    t.table_name,
    CASE 
      WHEN c.column_name IS NOT NULL THEN 'YES'
      ELSE 'NO'
    END as has_user_id_column
  FROM information_schema.tables t
  LEFT JOIN information_schema.columns c 
    ON t.table_name = c.table_name 
    AND t.table_schema = c.table_schema 
    AND c.column_name = 'user_id'
  WHERE t.table_schema = 'public'
    AND t.table_type = 'BASE TABLE'
    AND t.table_name IN (
      'phone_numbers',
      'call_logs',
      'call_recordings',
      'sms_messages',
      'sms_conversations',
      'email_templates',
      'email_campaigns',
      'email_logs',
      'communication_usage_records',
      'communication_config',
      'canvas_ai_agents',
      'agent_conversations',
      'agent_feedback',
      'agent_interaction_logs',
      'profiles',
      'users',
      'user_subscriptions',
      'twilio_calls'
    )
)
SELECT * FROM table_info ORDER BY table_name;

-- Check existing RLS policies
SELECT 
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual,
  with_check
FROM pg_policies
WHERE schemaname = 'public'
ORDER BY tablename, policyname;