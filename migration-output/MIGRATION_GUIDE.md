# Agent Command Center Database Migrations Guide

## Overview
This guide will help you execute the database migrations for the Agent Command Center using the Supabase SQL Editor.

## Prerequisites
Before running the migrations, ensure you have:
1. Access to your Supabase Dashboard
2. SQL Editor permissions in Supabase
3. The project reference: `cbopynuvhcymbumjnvay`

## Migration Order
Run the migrations in this exact order to avoid dependency issues:

1. **00-prerequisite.sql** - Creates the `update_updated_at_column()` function
2. **00b-create_canvas_agents_tables.sql** - Creates the canvas AI agents tables (required by knowledge bank)
3. **01-create_voices_table.sql** - Creates tables for voice cloning functionality
4. **02-create_metrics_tables.sql** - Creates comprehensive metrics and analytics tables
5. **03-create_audio_clips_table.sql** - Creates tables for audio clip storage and sharing
6. **04-create_knowledge_bank_tables.sql** - Creates the knowledge bank system tables

## Step-by-Step Instructions

### 1. Access Supabase SQL Editor
1. Go to: https://app.supabase.com/project/cbopynuvhcymbumjnvay
2. Click on "SQL Editor" in the left sidebar
3. Click "New query" to create a new SQL query tab

### 2. Run Prerequisite Function
1. Open `00-prerequisite.sql`
2. Copy the entire contents
3. Paste into the SQL Editor
4. Click "Run" or press Cmd/Ctrl + Enter
5. Verify success message

### 3. Run Canvas AI Agents Tables (if needed)
1. Check if `canvas_ai_agents` table already exists by running:
   ```sql
   SELECT EXISTS (
     SELECT FROM information_schema.tables 
     WHERE table_schema = 'public' 
     AND table_name = 'canvas_ai_agents'
   );
   ```
2. If it returns `false`, run `00b-create_canvas_agents_tables.sql`

### 4. Run Main Migrations
For each remaining migration file:
1. Open the migration file
2. Copy the entire contents
3. Create a new query tab in SQL Editor
4. Paste the contents
5. Click "Run"
6. Check for any errors in the output
7. If successful, proceed to the next migration

### 5. Verify Installation
After all migrations are complete, verify by running:

```sql
-- Check all tables were created
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
AND table_name IN (
  'voices',
  'metrics',
  'metric_aggregates',
  'api_usage_logs',
  'metric_alerts',
  'dashboard_cache',
  'audio_clips',
  'knowledge_documents',
  'knowledge_embeddings',
  'specialization_tracks',
  'agent_knowledge_progress',
  'agent_specialization_progress',
  'knowledge_quizzes',
  'quiz_attempts',
  'custom_curricula',
  'curriculum_enrollment',
  'retention_tests'
)
ORDER BY table_name;
```

You should see all the tables listed.

## Troubleshooting

### Common Issues

1. **"relation does not exist" errors**
   - Make sure you're running migrations in the correct order
   - Verify the canvas_ai_agents table exists before running knowledge bank migration

2. **"permission denied" errors**
   - Ensure you're using a service role key or have proper database permissions
   - Contact your Supabase admin if needed

3. **"function already exists" errors**
   - This is usually safe to ignore
   - The migration uses `CREATE OR REPLACE` which should handle existing functions

4. **Extension errors**
   - If `CREATE EXTENSION vector` fails, the pgvector extension may need to be enabled in your Supabase dashboard under Database > Extensions

## Post-Migration Steps

1. **Test the tables**: Run simple SELECT queries to ensure tables are accessible
2. **Check RLS policies**: Verify Row Level Security is properly configured
3. **Test with your application**: Ensure your backend can connect and use the new tables
4. **Monitor performance**: Keep an eye on query performance, especially for the metrics tables

## Support
If you encounter issues:
1. Check the Supabase logs in the dashboard
2. Review the SQL for syntax errors
3. Ensure all dependencies are met
4. Contact your database administrator if problems persist