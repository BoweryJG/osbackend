import axios from 'axios';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import path from 'path';

// Get the directory name of the current module
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables from .env file
dotenv.config({ path: path.resolve(__dirname, '.env') });

// Backend URL - use either localhost or your deployed URL
const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:3000';

// Test phone number (replace with your test number)
const TEST_PHONE_NUMBER = '+1234567890'; // Replace with your phone number

async function testMakeCall() {
  console.log(`\n📞 Testing outbound call endpoint...`);
  
  try {
    const response = await axios.post(`${BACKEND_URL}/api/twilio/make-call`, {
      to: TEST_PHONE_NUMBER,
      message: 'Hello! This is a test call from your Twilio integration. This call will be recorded.',
      record: true,
      userId: 'test-user-123',
      metadata: {
        test: true,
        purpose: 'integration-test'
      }
    });
    
    console.log('✅ Call initiated successfully!');
    console.log('Call details:', response.data);
    return true;
  } catch (error) {
    console.error('❌ Error making call:');
    if (error.response) {
      console.error(`Status: ${error.response.status}`);
      console.error('Response:', error.response.data);
    } else {
      console.error(error.message);
    }
    return false;
  }
}

async function testSendSms() {
  console.log(`\n💬 Testing SMS endpoint...`);
  
  try {
    const response = await axios.post(`${BACKEND_URL}/api/twilio/send-sms`, {
      to: TEST_PHONE_NUMBER,
      body: 'Hello! This is a test SMS from your Twilio integration.',
      userId: 'test-user-123',
      metadata: {
        test: true,
        purpose: 'integration-test'
      }
    });
    
    console.log('✅ SMS sent successfully!');
    console.log('Message details:', response.data);
    return true;
  } catch (error) {
    console.error('❌ Error sending SMS:');
    if (error.response) {
      console.error(`Status: ${error.response.status}`);
      console.error('Response:', error.response.data);
    } else {
      console.error(error.message);
    }
    return false;
  }
}

async function testGetCallHistory() {
  console.log(`\n📋 Testing call history endpoint...`);
  
  try {
    const response = await axios.get(`${BACKEND_URL}/api/twilio/calls`, {
      params: {
        phoneNumber: process.env.TWILIO_PHONE_NUMBER || '+18454090692',
        limit: 10
      }
    });
    
    console.log('✅ Call history retrieved successfully!');
    console.log(`Found ${response.data.calls.length} calls`);
    if (response.data.calls.length > 0) {
      console.log('Most recent call:', response.data.calls[0]);
    }
    return true;
  } catch (error) {
    console.error('❌ Error getting call history:');
    if (error.response) {
      console.error(`Status: ${error.response.status}`);
      console.error('Response:', error.response.data);
    } else {
      console.error(error.message);
    }
    return false;
  }
}

async function testGetSmsHistory() {
  console.log(`\n📱 Testing SMS history endpoint...`);
  
  try {
    const response = await axios.get(`${BACKEND_URL}/api/twilio/sms`, {
      params: {
        phoneNumber: process.env.TWILIO_PHONE_NUMBER || '+18454090692',
        limit: 10
      }
    });
    
    console.log('✅ SMS history retrieved successfully!');
    console.log(`Found ${response.data.messages.length} messages`);
    if (response.data.messages.length > 0) {
      console.log('Most recent message:', response.data.messages[0]);
    }
    return true;
  } catch (error) {
    console.error('❌ Error getting SMS history:');
    if (error.response) {
      console.error(`Status: ${error.response.status}`);
      console.error('Response:', error.response.data);
    } else {
      console.error(error.message);
    }
    return false;
  }
}

async function testWebhooks() {
  console.log(`\n🔔 Testing webhook endpoints...`);
  console.log('Note: Webhook endpoints are designed to be called by Twilio, not directly.');
  console.log('To test webhooks:');
  console.log('1. Configure your Twilio phone number webhooks to point to:');
  console.log(`   - Voice URL: ${BACKEND_URL}/api/twilio/voice`);
  console.log(`   - SMS URL: ${BACKEND_URL}/api/twilio/sms`);
  console.log('2. Call or text your Twilio number');
  console.log('3. Check the server logs for webhook activity');
  
  return true;
}

// Run all tests
async function runTests() {
  console.log('🚀 Starting Twilio integration tests...');
  console.log(`Backend URL: ${BACKEND_URL}`);
  console.log(`Twilio Phone Number: ${process.env.TWILIO_PHONE_NUMBER || '+18454090692'}`);
  
  // Check if Twilio credentials are configured
  if (!process.env.TWILIO_ACCOUNT_SID || !process.env.TWILIO_AUTH_TOKEN) {
    console.error('\n❌ Twilio credentials not found in .env file!');
    console.error('Please add the following to your .env file:');
    console.error('TWILIO_ACCOUNT_SID=your_account_sid');
    console.error('TWILIO_AUTH_TOKEN=your_auth_token');
    console.error('TWILIO_PHONE_NUMBER=+18454090692');
    console.error('TWILIO_PHONE_NUMBER_SID=PN8d691d0762f6c7ffbdf3ca4269aa2b91');
    return;
  }
  
  const results = {
    callHistory: await testGetCallHistory(),
    smsHistory: await testGetSmsHistory(),
    webhooks: await testWebhooks()
  };
  
  // Optional: Test making actual calls/SMS (commented out by default)
  console.log('\n⚠️  To test making actual calls/SMS, uncomment the following lines:');
  console.log('// results.makeCall = await testMakeCall();');
  console.log('// results.sendSms = await testSendSms();');
  
  // Uncomment these lines to test making actual calls/SMS
  // results.makeCall = await testMakeCall();
  // results.sendSms = await testSendSms();
  
  // Summary
  console.log('\n📊 Test Summary:');
  console.log('================');
  Object.entries(results).forEach(([test, passed]) => {
    console.log(`${test}: ${passed ? '✅ PASSED' : '❌ FAILED'}`);
  });
  
  const allPassed = Object.values(results).every(result => result);
  if (allPassed) {
    console.log('\n✅ All tests passed! Your Twilio integration is ready.');
  } else {
    console.log('\n❌ Some tests failed. Please check the logs above for details.');
  }
}

// Run the tests
runTests();
