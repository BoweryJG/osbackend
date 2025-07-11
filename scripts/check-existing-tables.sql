-- Check which tables already exist and their structure
SELECT 
    table_name,
    column_name,
    data_type,
    is_nullable
FROM 
    information_schema.columns
WHERE 
    table_schema = 'public' 
    AND table_name IN ('user_subscriptions', 'activity_log', 'transcriptions', 'callback_requests', 'emergency_calls', 'voice_calls')
ORDER BY 
    table_name, 
    ordinal_position;