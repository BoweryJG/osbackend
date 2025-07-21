#!/usr/bin/env node

import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Get Supabase configuration
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('❌ Missing SUPABASE_URL or SUPABASE_KEY environment variables');
  process.exit(1);
}

// Extract project ref from URL
const projectRef = SUPABASE_URL.match(/https:\/\/([^.]+)\.supabase\.co/)?.[1];
if (!projectRef) {
  console.error('❌ Could not extract project reference from SUPABASE_URL');
  process.exit(1);
}

console.log(`📊 Project Reference: ${projectRef}`);
console.log(`🔗 Supabase URL: ${SUPABASE_URL}`);

// Migration files in order
const migrations = [
  'create_voices_table.sql',
  'create_metrics_tables.sql',
  'create_audio_clips_table.sql',
  'create_knowledge_bank_tables.sql'
];

async function getMigrationSql(fileName) {
  const filePath = path.join(__dirname, 'migrations', fileName);
  return await fs.readFile(filePath, 'utf8');
}

async function runMigrations() {
  console.log('\n🚀 Starting Agent Command Center database migrations...\n');
  console.log('⚠️  Important: This script prepares the migrations for you to run manually.\n');

  // First, let's create the prerequisite function
  const prereqFunction = `
-- Create the update_updated_at_column function if it doesn't exist
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
`;

  console.log('📝 Step 1: Create prerequisite function');
  console.log('─'.repeat(50));
  console.log('Run this in your Supabase SQL Editor first:\n');
  console.log(prereqFunction);
  console.log('─'.repeat(50));
  console.log('\n📝 Step 2: Run the following migrations in order:\n');

  // Process each migration
  for (let i = 0; i < migrations.length; i++) {
    const fileName = migrations[i];
    const sql = await getMigrationSql(fileName);
    
    console.log(`\n${i + 1}. ${fileName}`);
    console.log('─'.repeat(50));
    
    // For the knowledge bank migration, we need to check if unified_agents table exists
    if (fileName === 'create_knowledge_bank_tables.sql') {
      console.log('⚠️  Note: This migration references unified_agents and profiles tables.');
      console.log('   Make sure these tables exist before running this migration.');
      console.log('   You may need to run create_canvas_agents_tables.sql first.\n');
    }
    
    console.log(`Copy and paste this into Supabase SQL Editor:`);
    console.log('─'.repeat(50));
    
    // Show first 20 lines of the migration for preview
    const lines = sql.split('\n');
    const preview = lines.slice(0, 20).join('\n');
    console.log(preview);
    if (lines.length > 20) {
      console.log(`\n... (${lines.length - 20} more lines) ...\n`);
    }
    console.log('─'.repeat(50));
  }

  console.log('\n📋 Instructions:');
  console.log('1. Go to your Supabase Dashboard: https://app.supabase.com/project/' + projectRef);
  console.log('2. Click on "SQL Editor" in the left sidebar');
  console.log('3. Create a new query');
  console.log('4. Run the prerequisite function first');
  console.log('5. Then run each migration in order');
  console.log('6. Check for any errors and resolve them before proceeding to the next migration\n');

  // Save migrations to files for easy access
  console.log('💾 Saving migration files for easy access...');
  
  const outputDir = path.join(__dirname, 'migration-output');
  await fs.mkdir(outputDir, { recursive: true });
  
  // Save prerequisite
  await fs.writeFile(
    path.join(outputDir, '00-prerequisite.sql'),
    prereqFunction
  );
  
  // Save each migration
  for (let i = 0; i < migrations.length; i++) {
    const fileName = migrations[i];
    const sql = await getMigrationSql(fileName);
    const outputFile = `${String(i + 1).padStart(2, '0')}-${fileName}`;
    await fs.writeFile(
      path.join(outputDir, outputFile),
      sql
    );
  }
  
  console.log(`\n✅ Migration files saved to: ${outputDir}`);
  console.log('   You can find all the SQL files there for easy copying.\n');
}

// Run the script
runMigrations().catch(console.error);