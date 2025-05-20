import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

dotenv.config();

let supabase = null;
let supabaseConnected = false;
const MAX_RETRIES = 5;
const RETRY_DELAY = 2000; // ms

async function connectToSupabase(retryCount = 0) {
  try {
    if (process.env.SUPABASE_URL && process.env.SUPABASE_KEY) {
      console.log(`Connecting to Supabase at: ${process.env.SUPABASE_URL} (Attempt ${retryCount + 1})`);
      supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);
      const { error } = await supabase.from('user_subscriptions').select('*').limit(1);
      if (error) throw error;
      console.log('Successfully connected to Supabase!');
      supabaseConnected = true;
      return supabase;
    }
    console.warn('Supabase credentials not found. Supabase features will be disabled.');
    return null;
  } catch (err) {
    console.error(`Error connecting to Supabase (Attempt ${retryCount + 1}):`, err);
    if (retryCount < MAX_RETRIES) {
      console.log(`Retrying connection in ${RETRY_DELAY / 1000} seconds...`);
      await new Promise(resolve => setTimeout(resolve, RETRY_DELAY));
      return connectToSupabase(retryCount + 1);
    }
    console.error(`Failed to connect to Supabase after ${MAX_RETRIES} attempts.`);
    return null;
  }
}

connectToSupabase().then(connected => {
  if (!connected) {
    setInterval(() => {
      if (!supabaseConnected) {
        console.log('Attempting to reconnect to Supabase...');
        connectToSupabase();
      }
    }, 30000);
  }
});

async function logActivity(task, result) {
  if (!supabase) {
    console.warn('Supabase not configured. Activity logging skipped.');
    return null;
  }
  try {
    const { data, error } = await supabase.from('activity_log').insert([{ task, result }]);
    if (error) {
      console.error('Error logging activity to Supabase:', error);
      return null;
    }
    return data;
  } catch (err) {
    console.error('Exception logging activity to Supabase:', err);
    return null;
  }
}

export { supabase, connectToSupabase, supabaseConnected, logActivity };
