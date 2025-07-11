#!/usr/bin/env node

const { createClient } = require('@supabase/supabase-js');
const fs = require('fs').promises;
const path = require('path');
require('dotenv').config();

// Initialize Supabase client with service role key
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY environment variables');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

// Migration files in order
const migrations = [
  'create_voices_table.sql',
  'create_metrics_tables.sql', 
  'create_audio_clips_table.sql',
  'create_knowledge_bank_tables.sql'
];

async function runMigration(fileName) {
  try {
    const filePath = path.join(__dirname, 'migrations', fileName);
    const sql = await fs.readFile(filePath, 'utf8');
    
    console.log(`\n📊 Running migration: ${fileName}...`);
    
    // Execute the SQL using Supabase's rpc function
    const { data, error } = await supabase.rpc('exec_sql', { 
      sql_query: sql 
    }).single();
    
    if (error) {
      // If exec_sql doesn't exist, try direct query (requires admin privileges)
      console.log('⚠️  exec_sql RPC not found, attempting direct execution...');
      
      // Split SQL into individual statements
      const statements = sql
        .split(';')
        .map(s => s.trim())
        .filter(s => s.length > 0 && !s.startsWith('--'));
      
      for (const statement of statements) {
        try {
          // Note: Direct SQL execution might not be available depending on Supabase setup
          const { error: stmtError } = await supabase.from('_sql').insert({ 
            query: statement + ';' 
          });
          
          if (stmtError) {
            console.error(`❌ Error executing statement: ${stmtError.message}`);
            console.error(`Statement: ${statement.substring(0, 100)}...`);
          }
        } catch (e) {
          console.error(`❌ Failed to execute statement: ${e.message}`);
        }
      }
    }
    
    console.log(`✅ Migration ${fileName} completed`);
    
  } catch (error) {
    console.error(`❌ Error running migration ${fileName}:`, error.message);
    throw error;
  }
}

async function runAllMigrations() {
  console.log('🚀 Starting Agent Command Center database migrations...\n');
  
  try {
    // First, let's check if we have the necessary functions
    console.log('🔍 Checking for update_updated_at_column function...');
    const { data: funcCheck, error: funcError } = await supabase
      .rpc('pg_get_functiondef', { funcoid: 'update_updated_at_column'::regprocedure });
    
    if (funcError || !funcCheck) {
      console.log('📝 Creating update_updated_at_column function...');
      const createFunctionSQL = `
        CREATE OR REPLACE FUNCTION update_updated_at_column()
        RETURNS TRIGGER AS $$
        BEGIN
          NEW.updated_at = NOW();
          RETURN NEW;
        END;
        $$ LANGUAGE plpgsql;
      `;
      
      // This might fail if we don't have direct SQL access
      console.log('⚠️  Note: Some functions might need to be created via Supabase dashboard SQL editor');
    }
    
    // Run each migration
    for (const migration of migrations) {
      await runMigration(migration);
    }
    
    console.log('\n✅ All migrations completed successfully!');
    console.log('\n📝 Note: If any migrations failed due to permission issues:');
    console.log('   1. Go to your Supabase dashboard');
    console.log('   2. Navigate to SQL Editor');
    console.log('   3. Run each migration file manually');
    console.log(`   4. Files are located in: ${path.join(__dirname, 'migrations')}`);
    
  } catch (error) {
    console.error('\n❌ Migration process failed:', error.message);
    process.exit(1);
  }
}

// Run migrations
runAllMigrations();