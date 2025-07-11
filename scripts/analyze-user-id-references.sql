-- Script to analyze user_id column references across all tables and policies
-- This will help identify mismatches between table definitions and RLS policies

-- 1. Check which tables have user_id columns
SELECT 
    table_name,
    column_name,
    data_type
FROM information_schema.columns
WHERE column_name = 'user_id'
    AND table_schema = 'public'
ORDER BY table_name;

-- 2. Check all RLS policies that reference user_id
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
WHERE (qual::text LIKE '%user_id%' OR with_check::text LIKE '%user_id%')
    AND schemaname = 'public'
ORDER BY tablename, policyname;

-- 3. Specifically check call_recordings table structure
SELECT 
    column_name,
    data_type,
    is_nullable,
    column_default
FROM information_schema.columns
WHERE table_name = 'call_recordings'
    AND table_schema = 'public'
ORDER BY ordinal_position;

-- 4. Check if twilio_calls table exists and has user_id column
SELECT 
    'twilio_calls table exists' as status,
    EXISTS (
        SELECT 1 FROM information_schema.tables 
        WHERE table_name = 'twilio_calls' 
        AND table_schema = 'public'
    ) as exists,
    EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'twilio_calls' 
        AND column_name = 'user_id'
        AND table_schema = 'public'
    ) as has_user_id_column;

-- 5. Check all policies on call_recordings table
SELECT 
    policyname,
    permissive,
    roles,
    cmd,
    qual,
    with_check
FROM pg_policies
WHERE tablename = 'call_recordings'
    AND schemaname = 'public';

-- 6. Check if there are any functions that might be referencing user_id incorrectly
SELECT 
    proname as function_name,
    prosrc as function_source
FROM pg_proc
WHERE prosrc LIKE '%call_recordings%' 
    AND prosrc LIKE '%user_id%'
    AND pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public');