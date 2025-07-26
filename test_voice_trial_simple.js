import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';

const SUPABASE_URL = 'https://cbopynuvhcymbumjnvay.supabase.co';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_SERVICE_ROLE_KEY) {
  console.error('❌ SUPABASE_SERVICE_ROLE_KEY not set');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

async function testVoiceTrial() {
  console.log('Testing voice trial system directly with Supabase...\n');
  
  const agentId = '00ed4a18-12f9-4ab0-9c94-2915ad94a9b1'; // Harvey
  const clientIdentifier = crypto
    .createHash('sha256')
    .update('test-ip:test-agent')
    .digest('hex');
  
  try {
    // Test 1: Check remaining trial time
    console.log('1. Checking remaining trial time...');
    const { data: remainingSeconds, error: checkError } = await supabase
      .rpc('get_remaining_trial_seconds', { p_client_identifier: clientIdentifier });
    
    if (checkError) {
      console.error('❌ Error checking trial time:', checkError);
      return;
    }
    
    console.log('✅ Remaining trial seconds:', remainingSeconds);
    
    // Test 2: Create a trial session
    console.log('\n2. Creating trial session...');
    const sessionId = `trial_${Date.now()}_${Math.random().toString(36).substring(7)}`;
    
    const { data: session, error: createError } = await supabase
      .from('guest_voice_sessions')
      .insert({
        session_id: sessionId,
        agent_id: agentId,
        client_identifier: clientIdentifier,
        max_duration_seconds: 300,
        status: 'active'
      })
      .select()
      .single();
    
    if (createError) {
      console.error('❌ Error creating session:', createError);
      return;
    }
    
    console.log('✅ Session created:', session.id);
    
    // Test 3: Update session duration
    console.log('\n3. Updating session duration...');
    const { data: updateResult, error: updateError } = await supabase
      .rpc('update_guest_session_duration', { 
        p_session_id: sessionId, 
        p_duration: 30 
      });
    
    if (updateError) {
      console.error('❌ Error updating duration:', updateError);
      return;
    }
    
    console.log('✅ Session updated:', updateResult);
    
    console.log('\n✅ All tests passed! Voice trial system is working.');
    
  } catch (error) {
    console.error('❌ Test failed:', error);
  }
}

testVoiceTrial();