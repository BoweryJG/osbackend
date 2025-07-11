import axios from 'axios';

const BACKEND_URL = 'https://osbackend-zl1h.onrender.com';

async function checkAllServices() {
  console.log('🔍 Checking All Services Status\n');
  
  const checks = [
    {
      name: 'Health Check',
      url: '/health',
      method: 'GET'
    },
    {
      name: 'Database Health',
      url: '/health/database',
      method: 'GET'
    },
    {
      name: 'API Health',
      url: '/api/health',
      method: 'GET'
    },
    {
      name: 'Canvas Agents',
      url: '/api/canvas/agents',
      method: 'GET',
      requiresAuth: true
    },
    {
      name: 'Twilio Voice Webhook',
      url: '/twilio/voice',
      method: 'POST',
      data: { CallSid: 'test' },
      expectedStatus: 403 // Should be protected
    },
    {
      name: 'Twilio SMS Webhook',
      url: '/twilio/sms',
      method: 'POST',
      data: { MessageSid: 'test' },
      expectedStatus: 403 // Should be protected
    },
    {
      name: 'Email Service',
      url: '/api/email/test',
      method: 'GET',
      requiresAuth: true
    },
    {
      name: 'Transcription Service',
      url: '/api/transcribe/status',
      method: 'GET'
    }
  ];

  for (const check of checks) {
    try {
      const config = {
        method: check.method,
        url: `${BACKEND_URL}${check.url}`,
        data: check.data,
        validateStatus: () => true // Don't throw on any status
      };

      if (check.requiresAuth) {
        config.headers = {
          'Authorization': 'Bearer test-token'
        };
      }

      const response = await axios(config);
      const status = response.status;
      const expected = check.expectedStatus || 200;
      
      if (status === expected) {
        console.log(`✅ ${check.name}: ${status} (Expected)`);
      } else if (status === 404) {
        console.log(`❌ ${check.name}: Not found (404)`);
      } else if (status === 401 || status === 403) {
        console.log(`🔒 ${check.name}: Protected (${status})`);
      } else if (status >= 200 && status < 300) {
        console.log(`✅ ${check.name}: ${status} OK`);
      } else {
        console.log(`⚠️  ${check.name}: ${status}`);
      }
      
      if (response.data && check.name.includes('Health')) {
        console.log(`   Status: ${response.data.status || 'unknown'}`);
      }
    } catch (error) {
      console.log(`❌ ${check.name}: ${error.message}`);
    }
  }

  console.log('\n📊 WebSocket Endpoints:');
  console.log('- Canvas Agents: wss://osbackend-zl1h.onrender.com/agents-ws');
  console.log('- Call Transcription: wss://osbackend-zl1h.onrender.com/call-transcription-ws');
  console.log('- Harvey AI: wss://osbackend-zl1h.onrender.com/harvey-ws');
  console.log('- Twilio Media: wss://osbackend-zl1h.onrender.com/api/media-stream');
  
  console.log('\n🔧 Twilio Webhook URLs to configure:');
  console.log('- Voice URL: https://osbackend-zl1h.onrender.com/twilio/voice');
  console.log('- SMS URL: https://osbackend-zl1h.onrender.com/twilio/sms');
  console.log('- Status Callback: https://osbackend-zl1h.onrender.com/twilio/status');
}

checkAllServices().catch(console.error);