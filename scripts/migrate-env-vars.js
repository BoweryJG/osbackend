#!/usr/bin/env node

/**
 * Migration script to help users transition from SUPABASE_KEY to SUPABASE_SERVICE_ROLE_KEY
 * This script checks for old environment variable names and provides guidance
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log('🔄 Checking environment variables...\n');

// Check if using old SUPABASE_KEY
if (process.env.SUPABASE_KEY && !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  console.log('⚠️  Found SUPABASE_KEY but not SUPABASE_SERVICE_ROLE_KEY');
  console.log('📝 The backend now uses SUPABASE_SERVICE_ROLE_KEY for better security.');
  console.log('\n👉 Please update your environment variables:');
  console.log('   - Rename SUPABASE_KEY to SUPABASE_SERVICE_ROLE_KEY');
  console.log('   - Make sure you\'re using the service role key (not the anon key)');
  console.log('   - The service role key can be found in Supabase Dashboard > Settings > API\n');
}

// Check if .env file exists
const envPath = path.join(__dirname, '..', '.env');
if (fs.existsSync(envPath)) {
  console.log('📄 Found .env file. Checking contents...');
  
  const envContent = fs.readFileSync(envPath, 'utf8');
  
  if (envContent.includes('SUPABASE_KEY=') && !envContent.includes('SUPABASE_SERVICE_ROLE_KEY=')) {
    console.log('\n⚠️  Your .env file uses SUPABASE_KEY');
    console.log('📝 Would you like to update it automatically? (backup will be created)');
    
    // In a real migration, you'd prompt for confirmation here
    // For now, we'll just show what needs to be done
    console.log('\n👉 To update manually:');
    console.log('   1. Replace SUPABASE_KEY= with SUPABASE_SERVICE_ROLE_KEY=');
    console.log('   2. Make sure the value is your service role key (not anon key)');
  }
}

// Check current configuration
console.log('\n✅ Current configuration:');
console.log(`   SUPABASE_URL: ${process.env.SUPABASE_URL ? '✓ Set' : '✗ Not set'}`);
console.log(`   SUPABASE_SERVICE_ROLE_KEY: ${process.env.SUPABASE_SERVICE_ROLE_KEY ? '✓ Set' : '✗ Not set'}`);
console.log(`   SUPABASE_KEY (deprecated): ${process.env.SUPABASE_KEY ? '⚠️ Set (please migrate)' : '✓ Not set'}`);

// Show example
console.log('\n📋 Example .env configuration:');
console.log('SUPABASE_URL=https://your-project.supabase.co');
console.log('SUPABASE_SERVICE_ROLE_KEY=eyJ...your-service-role-key-here...');

console.log('\n✨ Done checking environment variables!');