import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

// Get the directory name of the current module
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables from .env file
dotenv.config({ path: path.resolve(__dirname, '.env') });

async function testSupabaseConnection() {
  const logOutput = [];
  const log = (message) => {
    console.log(message);
    logOutput.push(message);
  };
  
  log('Testing Supabase connection...');
  
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_KEY) {
    log('Error: SUPABASE_URL or SUPABASE_KEY not found in environment variables');
    return logOutput;
  }
  
  log(`Connecting to Supabase at: ${process.env.SUPABASE_URL}`);
  
  try {
    const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);
    
    // Test connection with the fixed query
    const { data, error } = await supabase.from('user_subscriptions').select('*').limit(1);
    
    if (error) {
      log('Error connecting to Supabase:');
      log(JSON.stringify(error, null, 2));
    } else {
      log('✅ Successfully connected to Supabase!');
      log('Sample data:');
      log(JSON.stringify(data, null, 2));
    }
  } catch (err) {
    log('Exception connecting to Supabase:');
    log(err.toString());
    if (err.stack) {
      log(err.stack);
    }
  }
  
  // Write logs to file
  fs.writeFileSync('server.log', logOutput.join('\n'));
  return logOutput;
}

// Run the test
testSupabaseConnection();
