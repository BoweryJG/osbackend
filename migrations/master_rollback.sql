-- Master Rollback Script for OS Backend
-- This script drops all tables created by the master migration in reverse order
-- to properly handle foreign key dependencies

-- =================================================================
-- SAFETY CHECK
-- =================================================================
-- Uncomment the following line to enable the rollback
-- SET client_min_messages TO WARNING;

DO $$
BEGIN
    RAISE NOTICE 'ROLLBACK SCRIPT: This will drop all tables created by the master migration.';
    RAISE NOTICE 'To proceed, comment out the RAISE EXCEPTION line below.';
    RAISE EXCEPTION 'Rollback safety check - comment this line to proceed with rollback';
END $$;

-- =================================================================
-- PHASE 1: Drop Agent-Related Features
-- =================================================================

-- Drop agent procedure features (if they exist)
DO $$
BEGIN
    -- Remove columns added to dental_procedures
    IF EXISTS (SELECT 1 FROM information_schema.columns 
               WHERE table_name = 'dental_procedures' 
               AND column_name = 'is_featured') THEN
        ALTER TABLE dental_procedures 
        DROP COLUMN IF EXISTS is_featured,
        DROP COLUMN IF EXISTS agent_knowledge,
        DROP COLUMN IF EXISTS common_objections,
        DROP COLUMN IF EXISTS key_selling_points,
        DROP COLUMN IF EXISTS competitive_advantages,
        DROP COLUMN IF EXISTS sales_strategy,
        DROP COLUMN IF EXISTS roi_timeline,
        DROP COLUMN IF EXISTS target_demographics;
    END IF;
    
    -- Remove columns added to aesthetic_procedures
    IF EXISTS (SELECT 1 FROM information_schema.columns 
               WHERE table_name = 'aesthetic_procedures' 
               AND column_name = 'is_featured') THEN
        ALTER TABLE aesthetic_procedures 
        DROP COLUMN IF EXISTS is_featured,
        DROP COLUMN IF EXISTS agent_knowledge,
        DROP COLUMN IF EXISTS common_objections,
        DROP COLUMN IF EXISTS key_selling_points,
        DROP COLUMN IF EXISTS competitive_advantages,
        DROP COLUMN IF EXISTS sales_strategy,
        DROP COLUMN IF EXISTS roi_timeline,
        DROP COLUMN IF EXISTS target_demographics;
    END IF;
END $$;

-- Drop indexes
DROP INDEX IF EXISTS idx_dental_procedures_featured;
DROP INDEX IF EXISTS idx_aesthetic_procedures_featured;

-- =================================================================
-- PHASE 2: Drop Call Intelligence Tables
-- =================================================================

-- Drop foreign key constraints first
ALTER TABLE call_summaries DROP CONSTRAINT IF EXISTS fk_call_summaries_call;
ALTER TABLE call_streams DROP CONSTRAINT IF EXISTS fk_call_streams_call;
ALTER TABLE real_time_transcriptions DROP CONSTRAINT IF EXISTS fk_real_time_transcriptions_call;
ALTER TABLE call_transcriptions DROP CONSTRAINT IF EXISTS fk_call_transcriptions_call;

-- Remove columns added to twilio_calls (if table exists)
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables 
               WHERE table_name = 'twilio_calls') THEN
        ALTER TABLE twilio_calls 
        DROP COLUMN IF EXISTS real_time_transcript,
        DROP COLUMN IF EXISTS summary_id,
        DROP COLUMN IF EXISTS stream_sid;
    END IF;
END $$;

-- Drop call intelligence tables
DROP TABLE IF EXISTS real_time_transcriptions CASCADE;
DROP TABLE IF EXISTS call_streams CASCADE;
DROP TABLE IF EXISTS call_summaries CASCADE;
DROP TABLE IF EXISTS call_transcriptions CASCADE;

-- =================================================================
-- PHASE 3: Drop Canvas AI Agent Tables
-- =================================================================

-- Drop agent-related policies first
DROP POLICY IF EXISTS "Users can view their own interaction logs" ON agent_interaction_logs;
DROP POLICY IF EXISTS "Users can insert their own interaction logs" ON agent_interaction_logs;
DROP POLICY IF EXISTS "Users can view their own feedback" ON agent_feedback;
DROP POLICY IF EXISTS "Users can insert their own feedback" ON agent_feedback;
DROP POLICY IF EXISTS "Users can update their own feedback" ON agent_feedback;
DROP POLICY IF EXISTS "Users can view their own conversations" ON agent_conversations;
DROP POLICY IF EXISTS "Users can insert their own conversations" ON agent_conversations;
DROP POLICY IF EXISTS "Users can update their own conversations" ON agent_conversations;
DROP POLICY IF EXISTS "Everyone can view active agents" ON canvas_ai_agents;
DROP POLICY IF EXISTS "Authenticated users can view profiles" ON profiles;
DROP POLICY IF EXISTS "Users can update their own profile" ON profiles;

-- Drop agent-related functions
DROP FUNCTION IF EXISTS handle_new_user() CASCADE;
DROP FUNCTION IF EXISTS get_conversation_summary(UUID) CASCADE;
DROP FUNCTION IF EXISTS update_conversation_summary() CASCADE;
DROP FUNCTION IF EXISTS calculate_agent_metrics(UUID) CASCADE;

-- Drop agent-related triggers
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP TRIGGER IF EXISTS update_conversation_summary_trigger ON agent_interaction_logs;

-- Drop agent tables in reverse dependency order
DROP TABLE IF EXISTS agent_interaction_logs CASCADE;
DROP TABLE IF EXISTS agent_feedback CASCADE;
DROP TABLE IF EXISTS agent_conversations CASCADE;
DROP TABLE IF EXISTS canvas_ai_agents CASCADE;
DROP TABLE IF EXISTS profiles CASCADE;

-- =================================================================
-- PHASE 4: Drop Communication Tables
-- =================================================================

-- Drop communication policies
DROP POLICY IF EXISTS "Users can view their phone config" ON communication_config;
DROP POLICY IF EXISTS "Users can update their phone config" ON communication_config;
DROP POLICY IF EXISTS "Users can view their usage records" ON communication_usage_records;
DROP POLICY IF EXISTS "Users can view their templates" ON email_templates;
DROP POLICY IF EXISTS "Users can manage their templates" ON email_templates;
DROP POLICY IF EXISTS "Users can view their campaigns" ON email_campaigns;
DROP POLICY IF EXISTS "Users can manage their campaigns" ON email_campaigns;
DROP POLICY IF EXISTS "Users can view their email logs" ON email_logs;
DROP POLICY IF EXISTS "Users can view their conversations" ON sms_conversations;
DROP POLICY IF EXISTS "Users can view their SMS messages" ON sms_messages;
DROP POLICY IF EXISTS "Users can view call recordings" ON call_recordings;
DROP POLICY IF EXISTS "Users can view their call logs" ON call_logs;
DROP POLICY IF EXISTS "Users can view assigned phone numbers" ON phone_numbers;

-- Drop communication functions
DROP FUNCTION IF EXISTS update_sms_conversation() CASCADE;
DROP FUNCTION IF EXISTS get_phone_number_usage(UUID, TIMESTAMP, TIMESTAMP) CASCADE;

-- Drop communication triggers
DROP TRIGGER IF EXISTS update_sms_conversation_trigger ON sms_messages;

-- Drop communication tables in reverse dependency order
DROP TABLE IF EXISTS communication_config CASCADE;
DROP TABLE IF EXISTS communication_usage_records CASCADE;
DROP TABLE IF EXISTS email_logs CASCADE;
DROP TABLE IF EXISTS email_campaigns CASCADE;
DROP TABLE IF EXISTS email_templates CASCADE;
DROP TABLE IF EXISTS sms_messages CASCADE;
DROP TABLE IF EXISTS sms_conversations CASCADE;
DROP TABLE IF EXISTS call_recordings CASCADE;
DROP TABLE IF EXISTS call_logs CASCADE;
DROP TABLE IF EXISTS phone_numbers CASCADE;

-- Drop indexes
DROP INDEX IF EXISTS idx_call_logs_phone_number;
DROP INDEX IF EXISTS idx_call_logs_created_at;
DROP INDEX IF EXISTS idx_call_logs_direction;
DROP INDEX IF EXISTS idx_sms_messages_phone_number;
DROP INDEX IF EXISTS idx_sms_messages_created_at;
DROP INDEX IF EXISTS idx_sms_conversations_phone_number;
DROP INDEX IF EXISTS idx_sms_conversations_participant;
DROP INDEX IF EXISTS idx_email_logs_recipient;
DROP INDEX IF EXISTS idx_email_logs_status;
DROP INDEX IF EXISTS idx_email_logs_campaign;
DROP INDEX IF EXISTS idx_call_recordings_call_log_id;
DROP INDEX IF EXISTS idx_usage_date;
DROP INDEX IF EXISTS idx_usage_phone_number;

-- =================================================================
-- VERIFICATION
-- =================================================================

DO $$
DECLARE
    remaining_tables text[];
    table_name text;
    expected_to_be_dropped text[] := ARRAY[
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
        'call_summaries',
        'call_streams',
        'real_time_transcriptions',
        'call_transcriptions'
    ];
BEGIN
    remaining_tables := ARRAY[]::text[];
    
    FOREACH table_name IN ARRAY expected_to_be_dropped
    LOOP
        IF EXISTS (
            SELECT 1 FROM information_schema.tables 
            WHERE table_schema = 'public' 
            AND table_name = table_name
        ) THEN
            remaining_tables := array_append(remaining_tables, table_name);
        END IF;
    END LOOP;
    
    IF array_length(remaining_tables, 1) > 0 THEN
        RAISE WARNING 'The following tables were NOT dropped: %', remaining_tables;
    ELSE
        RAISE NOTICE 'SUCCESS: All tables were dropped successfully';
    END IF;
END $$;

-- =================================================================
-- ROLLBACK NOTES
-- =================================================================
-- 1. This script drops tables in reverse order to handle foreign keys
-- 2. It includes safety checks to prevent accidental execution
-- 3. To execute: psql -U your_username -d your_database -f master_rollback.sql
-- 4. Make sure to backup your database before running this script