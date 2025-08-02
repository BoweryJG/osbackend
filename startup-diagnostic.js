// Enhanced startup diagnostic to debug deployment failure
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables
dotenv.config();

console.log('=== ENHANCED STARTUP DIAGNOSTICS ===');
console.log(`Time: ${new Date().toISOString()}`);
console.log(`Node version: ${process.version}`);
console.log(`Working directory: ${process.cwd()}`);
console.log();

// 1. Check ALL critical environment variables
console.log('=== ENVIRONMENT VARIABLES CHECK ===');
const criticalVars = [
  'PORT',
  'ELEVENLABS_API_KEY', 
  'SENDGRID_API_KEY',
  'SUPABASE_URL',
  'SUPABASE_SERVICE_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
  'SUPABASE_KEY',
  'ANTHROPIC_API_KEY',
  'JWT_SECRET',
  'TWILIO_ACCOUNT_SID',
  'TWILIO_AUTH_TOKEN'
];

criticalVars.forEach(varName => {
  const value = process.env[varName];
  if (value) {
    // Show first 4 chars for keys, full value for non-sensitive vars
    const display = varName.includes('KEY') || varName.includes('SECRET') || varName.includes('TOKEN') 
      ? `${value.substring(0, 4)}...${value.substring(value.length - 4)}` 
      : value;
    console.log(`✅ ${varName}: ${display}`);
  } else {
    console.log(`❌ ${varName}: NOT SET`);
  }
});

console.log();
console.log('=== TESTING SERVICE INITIALIZATION ===');

// 2. Test Supabase initialization
try {
  console.log('Testing Supabase connection...');
  const { createClient } = await import('@supabase/supabase-js');
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY;
  
  if (supabaseUrl && supabaseKey) {
    const supabase = createClient(supabaseUrl, supabaseKey);
    console.log('✅ Supabase client created successfully');
    
    // Try a simple query
    const { data, error } = await supabase.from('unified_agents').select('count').limit(1);
    if (error) {
      console.log(`⚠️  Supabase query failed: ${error.message}`);
    } else {
      console.log('✅ Supabase connection verified');
    }
  } else {
    console.log('❌ Supabase credentials missing');
  }
} catch (error) {
  console.error('❌ Supabase initialization failed:', error.message);
}

// 3. Test Anthropic initialization
try {
  console.log('\nTesting Anthropic initialization...');
  const { default: Anthropic } = await import('@anthropic-ai/sdk');
  
  if (process.env.ANTHROPIC_API_KEY) {
    const anthropic = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY
    });
    console.log('✅ Anthropic client created successfully');
  } else {
    console.log('❌ Anthropic API key missing');
  }
} catch (error) {
  console.error('❌ Anthropic initialization failed:', error.message);
}

// 4. Test ElevenLabs service initialization
console.log('\n=== TESTING ELEVENLABS SERVICE ===');
try {
  console.log('Attempting to import ElevenLabsTTS...');
  const { ElevenLabsTTS } = await import('./services/elevenLabsTTS.js');
  console.log('✅ ElevenLabsTTS imported successfully');
  
  console.log('Attempting to create ElevenLabsTTS instance...');
  const tts = new ElevenLabsTTS();
  console.log('✅ ElevenLabsTTS instance created successfully');
} catch (error) {
  console.error('❌ ElevenLabsTTS initialization failed:', error.message);
  console.error('   Stack trace:', error.stack);
}

// 5. Test VoiceCloningService initialization
console.log('\n=== TESTING VOICE CLONING SERVICE ===');
try {
  console.log('Attempting to import VoiceCloningService...');
  const { default: VoiceCloningService } = await import('./services/voiceCloningService.js');
  console.log('✅ VoiceCloningService imported successfully');
  
  console.log('Attempting to create VoiceCloningService instance...');
  const voiceCloning = new VoiceCloningService();
  console.log('✅ VoiceCloningService instance created successfully');
} catch (error) {
  console.error('❌ VoiceCloningService initialization failed:', error.message);
  console.error('   Stack trace:', error.stack);
}

// 6. Test problematic route imports
console.log('\n=== TESTING ROUTE IMPORTS ===');

// Test voice cloning routes
try {
  console.log('Testing voice cloning routes import...');
  const voiceCloningRoutes = await import('./routes/voiceCloning.js');
  console.log('✅ Voice cloning routes imported successfully');
} catch (error) {
  console.error('❌ Voice cloning routes import failed:', error.message);
  console.error('   Stack trace:', error.stack);
}

// Test dashboard routes
try {
  console.log('\nTesting dashboard routes import...');
  const dashboardRoutes = await import('./routes/dashboard.js');
  console.log('✅ Dashboard routes imported successfully');
} catch (error) {
  console.error('❌ Dashboard routes import failed:', error.message);
  console.error('   Stack trace:', error.stack);
}

// 7. Test if we can reach this point
console.log('\n=== DIAGNOSTIC COMPLETE ===');
console.log('If you see this message, the basic initialization is working.');
console.log('The crash must be happening later in the startup sequence.');

// Exit cleanly
process.exit(0);