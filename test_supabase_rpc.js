import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://cbopynuvhcymbumjnvay.supabase.co';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_SERVICE_ROLE_KEY) {
  console.error('❌ SUPABASE_SERVICE_ROLE_KEY not set');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

async function testRPC() {
  console.log('Testing RPC function...\n');
  
  try {
    // Test the RPC function
    const { data, error } = await supabase
      .rpc('get_remaining_trial_seconds', { 
        p_client_identifier: 'test-client-123' 
      });
    
    if (error) {
      console.error('❌ RPC Error:', error);
      console.error('Error details:', JSON.stringify(error, null, 2));
    } else {
      console.log('✅ RPC Success! Remaining seconds:', data);
    }
    
    // Test inserting a guest session
    console.log('\nTesting guest session insert...');
    const { data: session, error: insertError } = await supabase
      .from('guest_voice_sessions')
      .insert({
        session_id: `test_${Date.now()}`,
        agent_id: '00ed4a18-12f9-4ab0-9c94-2915ad94a9b1',
        client_identifier: 'test-client-123',
        max_duration_seconds: 300,
        status: 'active'
      })
      .select()
      .single();
    
    if (insertError) {
      console.error('❌ Insert Error:', insertError);
      console.error('Error details:', JSON.stringify(insertError, null, 2));
    } else {
      console.log('✅ Insert Success! Session:', session);
    }
    
  } catch (error) {
    console.error('❌ Unexpected error:', error);
  }
}

testRPC();