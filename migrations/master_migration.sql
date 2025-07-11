-- Master Migration Script for OS Backend
-- This script runs all migrations in the correct order to handle dependencies

-- =================================================================
-- PHASE 1: Core Communication Infrastructure
-- =================================================================

-- Create all communication tables (phone, SMS, email)
-- This is the consolidated version that includes all communication features
\i create_communication_tables_consolidated.sql

-- =================================================================
-- PHASE 2: Canvas AI Agents
-- =================================================================

-- Create Canvas AI agent tables with all features
-- Using the complete migration that includes profiles table
\i canvas_agents_complete_migration.sql

-- =================================================================
-- PHASE 3: Call Intelligence Features
-- =================================================================

-- Note: The following migrations reference twilio_calls table which should
-- be created as part of your existing phone system. If twilio_calls doesn't
-- exist, you'll need to create it first or modify these migrations.

-- Create call transcription tables
-- WARNING: This migration expects twilio_calls table to exist
-- \i create_call_transcriptions_table.sql

-- Create call intelligence tables (summaries, streams, real-time transcriptions)
-- WARNING: This migration expects twilio_calls table to exist
-- \i create_call_intelligence_tables.sql

-- =================================================================
-- PHASE 4: Procedure Features for Agents
-- =================================================================

-- Add agent-specific features to procedure tables
-- WARNING: This migration expects dental_procedures and aesthetic_procedures tables to exist
-- If these tables don't exist in your database, comment out this line
-- \i add_agent_procedure_features.sql

-- =================================================================
-- DEPRECATED/DUPLICATE MIGRATIONS (DO NOT RUN)
-- =================================================================
-- The following files are superseded by the consolidated versions above:
-- - create_email_tables.sql (included in create_communication_tables_consolidated.sql)
-- - create_phone_system_tables.sql (included in create_communication_tables_consolidated.sql)
-- - create_canvas_agents_tables.sql (superseded by canvas_agents_complete_migration.sql)
-- - create_canvas_agents_tables_fixed.sql (superseded by canvas_agents_complete_migration.sql)
-- - create_canvas_agents_tables_simple.sql (superseded by canvas_agents_complete_migration.sql)

-- =================================================================
-- POST-MIGRATION VERIFICATION
-- =================================================================

-- Verify all tables were created successfully
DO $$
DECLARE
    expected_tables text[] := ARRAY[
        -- Communication tables
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
        -- Canvas AI Agent tables
        'canvas_ai_agents',
        'agent_conversations',
        'agent_feedback',
        'agent_interaction_logs',
        'profiles'
    ];
    missing_tables text[];
    table_name text;
BEGIN
    -- Check for missing tables
    missing_tables := ARRAY[]::text[];
    
    FOREACH table_name IN ARRAY expected_tables
    LOOP
        IF NOT EXISTS (
            SELECT 1 FROM information_schema.tables 
            WHERE table_schema = 'public' 
            AND table_name = table_name
        ) THEN
            missing_tables := array_append(missing_tables, table_name);
        END IF;
    END LOOP;
    
    -- Report results
    IF array_length(missing_tables, 1) > 0 THEN
        RAISE NOTICE 'WARNING: The following tables were not created: %', missing_tables;
    ELSE
        RAISE NOTICE 'SUCCESS: All expected tables were created successfully';
    END IF;
END $$;

-- =================================================================
-- MIGRATION NOTES
-- =================================================================
-- 1. This script assumes you're running on a fresh database or that
--    existing tables will be handled with IF NOT EXISTS clauses
--
-- 2. Some migrations are commented out because they depend on tables
--    that may not exist in your system:
--    - twilio_calls (required by call intelligence features)
--    - dental_procedures, aesthetic_procedures (required by agent features)
--
-- 3. To run this script:
--    psql -U your_username -d your_database -f master_migration.sql
--
-- 4. If you need to rollback, create a separate rollback script that
--    drops tables in reverse order to handle foreign key dependencies