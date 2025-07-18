import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';
import OpenAI from 'openai';
import fs from 'fs';

// Get the directory name of the current module
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables from .env file
dotenv.config({ path: path.resolve(__dirname, '.env') });

// Create temp directory if it doesn't exist
const tempDir = path.join(__dirname, 'temp');
if (!fs.existsSync(tempDir)) {
  fs.mkdirSync(tempDir, { recursive: true });
  console.log('Created temp directory for file uploads');
}

// Function to check if environment variables are set
function checkEnvironmentVariables() {
  console.log('=== Checking Environment Variables ===');
  
  const requiredVars = [
    'SUPABASE_URL',
    'SUPABASE_KEY',
    'SUPABASE_STORAGE_BUCKET'
  ];
  
  const openAIVars = [
    'OPENAI_API_KEY'
  ];
  
  let allVarsPresent = true;
  let openAIPresent = false;
  
  console.log('Checking required variables:');
  for (const varName of requiredVars) {
    if (!process.env[varName]) {
      console.error(`❌ Missing required environment variable: ${varName}`);
      allVarsPresent = false;
    } else {
      // Mask the API keys for security
      const value = varName.includes('KEY') || varName.includes('SECRET') 
        ? `${process.env[varName].substring(0, 4)}...${process.env[varName].substring(process.env[varName].length - 4)}`
        : process.env[varName];
      console.log(`✅ ${varName} is set: ${value}`);
    }
  }
  
  console.log('\nChecking transcription API keys (OpenAI or OpenRouter):');
  for (const varName of openAIVars) {
    if (process.env[varName]) {
      const value = `${process.env[varName].substring(0, 4)}...${process.env[varName].substring(process.env[varName].length - 4)}`;
      console.log(`✅ ${varName} is set: ${value}`);
      openAIPresent = true;
    } else {
      console.log(`ℹ️ ${varName} not set`);
    }
  }
  
  console.log('\nChecking OpenRouter variables (for analysis):');
  for (const varName of openRouterVars) {
    if (!process.env[varName]) {
      console.error(`❌ Missing OpenRouter variable: ${varName}`);
      openRouterPresent = false;
    } else {
      // Mask the API keys for security
      const value = varName.includes('KEY') || varName.includes('SECRET') 
        ? `${process.env[varName].substring(0, 4)}...${process.env[varName].substring(process.env[varName].length - 4)}`
        : process.env[varName];
      console.log(`✅ ${varName} is set: ${value}`);
    }
  }
  
  if (!openAIPresent) {
    console.warn('\n⚠️ No API key configured for Whisper transcription');
  }
  
  if (!openRouterPresent) {
    console.warn('\n⚠️ OpenRouter variables missing - analysis functionality will not work');
  }
  
  return allVarsPresent && (openAIPresent || openRouterPresent);
}

// Function to test Supabase connection
async function testSupabaseConnection() {
  console.log('\n=== Testing Supabase Connection ===');
  
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_KEY) {
    console.error('❌ Supabase credentials not found. Cannot test connection.');
    return false;
  }
  
  try {
    console.log(`Connecting to Supabase at: ${process.env.SUPABASE_URL}`);
    
    // Create a new Supabase client
    const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);
    
    // Test the connection by checking if the transcriptions table exists
    console.log('Checking if transcriptions table exists...');
    const { error } = await supabase.from('transcriptions').select('id').limit(1);
    
    if (error) {
      if (error.code === 'PGRST116') {
        console.error('❌ Transcriptions table not found. You may need to run the SQL script to create it.');
        console.log('Run the following command to create the table:');
        console.log('psql -U postgres -d your_database_name -f create_transcriptions_table.sql');
        return false;
      } else {
        console.error('❌ Error connecting to Supabase:', error);
        return false;
      }
    }
    
    // Test storage bucket
    console.log('Checking storage bucket...');
    const bucketName = process.env.SUPABASE_STORAGE_BUCKET || 'audio_recordings';
    const { data: buckets, error: bucketError } = await supabase.storage.listBuckets();
    
    if (bucketError) {
      console.error('❌ Error checking storage buckets:', bucketError);
      return false;
    }
    
    const bucketExists = buckets.some(bucket => bucket.name === bucketName);
    if (!bucketExists) {
      console.log(`⚠️ Storage bucket '${bucketName}' does not exist. It will be created when needed.`);
    } else {
      console.log(`✅ Storage bucket '${bucketName}' exists`);
    }
    
    console.log('✅ Successfully connected to Supabase!');
    return true;
  } catch (err) {
    console.error('❌ Error testing Supabase connection:', err);
    return false;
  }
}

// Function to test OpenAI connection
async function testOpenAIConnection() {
  console.log('\n=== Testing OpenAI Connection (for Transcription) ===');
  
  const openAiApiKey = process.env.OPENAI_API_KEY || process.env.OPENROUTER_API_KEY;

  if (!openAiApiKey) {
    console.error('❌ No OpenAI or OpenRouter API key found. Cannot test transcription connection.');
    return false;
  }
  
  try {
    console.log('Initializing OpenAI client...');
    
    // Initialize OpenAI client
    const openAiOptions = { apiKey: openAiApiKey };
    if (!process.env.OPENAI_API_KEY && process.env.OPENROUTER_API_KEY) {
      openAiOptions.baseURL = 'https://openrouter.ai/api/v1';
      openAiOptions.defaultHeaders = {
        'HTTP-Referer': process.env.FRONTEND_URL || 'https://repspheres.com',
        'X-Title': 'Transcription Service'
      };
    }

    const openai = new OpenAI(openAiOptions);
    
    // Test the connection with a simple models list request
    console.log('Testing OpenAI API connection...');
    const models = await openai.models.list();
    
    if (models && models.data && models.data.length > 0) {
      console.log(`✅ Successfully connected to OpenAI API!`);
      console.log(`Found ${models.data.length} models available.`);
      
      // Check if Whisper model is available
      const whisperAvailable = models.data.some(model => model.id.includes('whisper'));
      if (whisperAvailable) {
        console.log('✅ Whisper model is available for transcription');
      } else {
        console.log('⚠️ Could not find Whisper model in the available models list.');
        console.log('This might be because the models list doesn\'t include Whisper, but it could still work.');
      }
      
      return true;
    } else {
      console.error('❌ Unexpected response from OpenAI API');
      return false;
    }
  } catch (err) {
    console.error('❌ Error testing OpenAI connection:', err);
    if (err.response) {
      console.error('Response status:', err.response.status);
      console.error('Response data:', err.response.data);
    }
    return false;
  }
}

// Function to test OpenRouter connection
async function testOpenRouterConnection() {
  console.log('\n=== Testing OpenRouter Connection (for Analysis) ===');
  
  if (!process.env.OPENROUTER_API_KEY) {
    console.error('❌ OpenRouter API key not found. Cannot test connection.');
    return false;
  }
  
  try {
    console.log('Testing OpenRouter API connection...');
    
    // Make a simple request to the OpenRouter API
    const response = await fetch('https://openrouter.ai/api/v1/models', {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
        'HTTP-Referer': process.env.FRONTEND_URL || 'https://repspheres.com',
        'X-Title': 'Transcription Service'
      }
    });
    
    if (!response.ok) {
      const errorData = await response.json();
      console.error('❌ Error from OpenRouter API:', errorData);
      return false;
    }
    
    const data = await response.json();
    
    if (data && Array.isArray(data)) {
      console.log(`✅ Successfully connected to OpenRouter API!`);
      console.log(`Found ${data.length} models available.`);
      
      // Check if the specified model is available
      const modelName = process.env.OPENROUTER_MODEL || 'openai/gpt-3.5-turbo';
      const modelAvailable = data.some(model => model.id === modelName);
      
      if (modelAvailable) {
        console.log(`✅ Specified model '${modelName}' is available`);
      } else {
        console.log(`⚠️ Specified model '${modelName}' not found in available models.`);
        console.log('Available models:');
        data.slice(0, 5).forEach(model => {
          console.log(`- ${model.id}`);
        });
        if (data.length > 5) {
          console.log(`... and ${data.length - 5} more`);
        }
      }
      
      return true;
    } else {
      console.error('❌ Unexpected response from OpenRouter API');
      return false;
    }
  } catch (err) {
    console.error('❌ Error testing OpenRouter connection:', err);
    return false;
  }
}

// Main function to run all checks
async function runDiagnostics() {
  console.log('=== Running Environment Diagnostics ===');
  console.log(`Current working directory: ${__dirname}`);
  console.log(`Node.js version: ${process.version}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`Server time: ${new Date().toISOString()}`);
  
  // Check environment variables
  const envVarsOk = checkEnvironmentVariables();
  
  // Test connections
  const supabaseOk = await testSupabaseConnection();
  const openAiConfigured = !!(process.env.OPENAI_API_KEY || process.env.OPENROUTER_API_KEY);
  const openaiOk = openAiConfigured ? await testOpenAIConnection() : false;
  const openrouterOk = process.env.OPENROUTER_API_KEY ? await testOpenRouterConnection() : false;
  
  // Summary
  console.log('\n=== Diagnostics Summary ===');
  console.log(`Environment Variables: ${envVarsOk ? '✅ OK' : '❌ Issues Found'}`);
  console.log(`Supabase Connection: ${supabaseOk ? '✅ OK' : '❌ Issues Found'}`);
  const whisperConfigured = openAiConfigured;
  console.log(`Whisper Connection: ${openaiOk ? '✅ OK' : whisperConfigured ? '❌ Issues Found' : '⚠️ Not Configured'}`);
  console.log(`OpenRouter Connection (Analysis): ${openrouterOk ? '✅ OK' : process.env.OPENROUTER_API_KEY ? '❌ Issues Found' : '⚠️ Not Configured'}`);
  
  // Check if at least one of OpenAI or OpenRouter is working
  const hasWorkingAI = openaiOk || openrouterOk;
  
  if (envVarsOk && supabaseOk && hasWorkingAI) {
    console.log('\n✅ Environment is correctly set up for the transcription service!');
    
    if (!openaiOk && openAiConfigured) {
      console.log('\n⚠️ Whisper connection failed - transcription functionality may not work');
    } else if (!openaiOk) {
      console.log('\n⚠️ Whisper service not configured - transcription functionality will not work');
    }
    
    if (!openrouterOk && process.env.OPENROUTER_API_KEY) {
      console.log('\n⚠️ OpenRouter connection failed - analysis functionality may not work');
    } else if (!openrouterOk) {
      console.log('\n⚠️ OpenRouter not configured - analysis functionality will not work');
    }
    
    console.log('\nYou can now run the transcription service with:');
    console.log('npm start');
    console.log('\nTo test the transcription service with a sample audio file:');
    console.log('npm run test:transcription /path/to/audio/file.mp3');
  } else {
    console.log('\n❌ Some checks failed. Please fix the issues above before running the transcription service.');
    
    if (!envVarsOk) {
      console.log('\nMake sure your .env file contains all required variables:');
      console.log(`
# Supabase Configuration (Required)
SUPABASE_URL=your_supabase_project_url
SUPABASE_KEY=your_supabase_anon_or_service_key
SUPABASE_STORAGE_BUCKET=audio_recordings

# Whisper Configuration (OpenAI or OpenRouter)
OPENAI_API_KEY=your_openai_api_key # or use OPENROUTER_API_KEY for Whisper

# OpenRouter Configuration (for analysis and optional Whisper)
OPENROUTER_API_KEY=your_openrouter_api_key
OPENROUTER_MODEL=openai/gpt-3.5-turbo
      `);
    }
    
    if (!supabaseOk) {
      console.log('\nFor Supabase issues:');
      console.log('1. Check that your Supabase URL and key are correct');
      console.log('2. Make sure the transcriptions table exists (run create_transcriptions_table.sql)');
      console.log('3. Verify that your Supabase project is active and accessible');
    }
    
    if (!openaiOk && openAiConfigured) {
      console.log('\nFor Whisper API issues:');
      console.log('1. Verify your API key is correct (OPENAI_API_KEY or OPENROUTER_API_KEY)');
      console.log('2. Ensure your account has billing enabled or sufficient credits');
      console.log('3. Confirm that Whisper access is permitted by your provider');
    }
    
    if (!openrouterOk && process.env.OPENROUTER_API_KEY) {
      console.log('\nFor OpenRouter issues:');
      console.log('1. Check that your OpenRouter API key is correct and active');
      console.log('2. Verify that your OpenRouter account has billing set up if required');
      console.log('3. Check if the specified model is available through your OpenRouter account');
    }
  }
}

// Run the diagnostics
runDiagnostics().catch(err => {
  console.error('Error running diagnostics:', err);
  process.exit(1);
});
