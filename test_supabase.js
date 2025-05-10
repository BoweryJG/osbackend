import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

// Get the directory name of the current module
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables from .env file
dotenv.config({ path: path.resolve(__dirname, '.env') });

async function testSupabaseConnection() {
  console.log('Testing Supabase connection...');
  
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_KEY) {
    console.error('Error: SUPABASE_URL or SUPABASE_KEY not found in environment variables');
    return;
  }
  
  console.log(`Connecting to Supabase at: ${process.env.SUPABASE_URL}`);
  
  try {
    const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);
    
    // Test connection with the fixed query
    const { data, error } = await supabase.from('user_subscriptions').select('*').limit(1);
    
    if (error) {
      console.error('Error connecting to Supabase:', error);
    } else {
      console.log('✅ Successfully connected to Supabase!');
      console.log('Sample data:', data);
    }
  } catch (err) {
    console.error('Exception connecting to Supabase:', err);
  }
}

// Run the test
testSupabaseConnection();
