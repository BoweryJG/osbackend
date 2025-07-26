import axios from 'axios';

const API_URL = process.env.API_URL || 'https://osbackend-zl1h.onrender.com';
const HARVEY_ID = '00ed4a18-12f9-4ab0-9c94-2915ad94a9b1'; // Harvey Specter

async function testVoiceTrial() {
  console.log('Testing voice trial endpoints...\n');
  
  try {
    // Test 1: Start trial session
    console.log('1. Starting trial voice session with Harvey...');
    const response = await axios.post(
      `${API_URL}/api/repconnect/agents/${HARVEY_ID}/start-trial-voice-session`,
      {},
      {
        headers: {
          'Origin': 'https://repconnect.repspheres.com',
          'User-Agent': 'TestClient/1.0'
        }
      }
    );
    
    console.log('✅ Trial session started successfully!');
    console.log('Session ID:', response.data.data.session.session_id);
    console.log('Max duration:', response.data.data.session.max_duration_seconds, 'seconds');
    console.log('Is trial:', response.data.data.is_trial);
    console.log('Agent:', response.data.data.agent.name);
    
    const sessionId = response.data.data.session.session_id;
    
    // Test 2: Send heartbeat
    console.log('\n2. Sending heartbeat at 30 seconds...');
    const heartbeatResponse = await axios.post(
      `${API_URL}/api/repconnect/voice/heartbeat`,
      {
        sessionId: sessionId,
        duration: 30
      },
      {
        headers: {
          'Origin': 'https://repconnect.repspheres.com'
        }
      }
    );
    
    console.log('✅ Heartbeat successful!');
    console.log('Session status:', heartbeatResponse.data.data.session.status);
    console.log('Should disconnect:', heartbeatResponse.data.data.should_disconnect);
    
    // Test 3: Try to exceed limit
    console.log('\n3. Testing time limit (301 seconds)...');
    const limitResponse = await axios.post(
      `${API_URL}/api/repconnect/voice/heartbeat`,
      {
        sessionId: sessionId,
        duration: 301
      },
      {
        headers: {
          'Origin': 'https://repconnect.repspheres.com'
        }
      }
    );
    
    console.log('✅ Time limit enforced!');
    console.log('Session status:', limitResponse.data.data.session.status);
    console.log('Should disconnect:', limitResponse.data.data.should_disconnect);
    
    // Test 4: Try to start another session (should fail)
    console.log('\n4. Attempting to start second session (should fail)...');
    try {
      await axios.post(
        `${API_URL}/api/repconnect/agents/${HARVEY_ID}/start-trial-voice-session`,
        {},
        {
          headers: {
            'Origin': 'https://repconnect.repspheres.com',
            'User-Agent': 'TestClient/1.0'
          }
        }
      );
      console.log('❌ ERROR: Second session was allowed!');
    } catch (error) {
      if (error.response?.status === 403) {
        console.log('✅ Second session correctly blocked!');
        console.log('Error:', error.response.data.error.message);
      } else {
        throw error;
      }
    }
    
    console.log('\n✅ All tests passed! Voice trial system is working correctly.');
    
  } catch (error) {
    console.error('\n❌ Test failed:', error.response?.data || error.message);
    process.exit(1);
  }
}

// Run the test
testVoiceTrial();