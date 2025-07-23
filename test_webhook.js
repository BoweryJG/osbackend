import { fileURLToPath } from 'url';
import path from 'path';

import axios from 'axios';
import dotenv from 'dotenv';

// Get the directory name of the current module
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables from .env file
dotenv.config({ path: path.resolve(__dirname, '.env') });

// Backend URL - use either localhost or your deployed URL
const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:3000';

async function testWebhook() {
  console.log(`Testing webhook endpoint at ${BACKEND_URL}/webhook`);
  
  try {
    // Test a simple webhook request
    const response = await axios.post(`${BACKEND_URL}/webhook`, {
      data: {
        fileUrl: 'https://example.com/test-audio.mp3',
        prompt: 'This is a test webhook request'
      }
    }, {
      headers: {
        'Content-Type': 'application/json'
      }
    });
    
    console.log('Webhook response:', response.data);
    console.log('Test passed! The webhook endpoint is working correctly.');
    return true;
  } catch (error) {
    console.error('Error testing webhook:');
    if (error.response) {
      console.error(`Status: ${error.response.status}`);
      console.error('Response:', error.response.data);
    } else {
      console.error(error.message);
    }
    console.log('Test failed! The webhook endpoint is not working correctly.');
    return false;
  }
}

async function testUsageEndpoint() {
  console.log(`Testing usage endpoint at ${BACKEND_URL}/user/usage`);
  
  try {
    // Test the usage endpoint
    const response = await axios.get(`${BACKEND_URL}/user/usage`);
    
    console.log('Usage response:', response.data);
    console.log('Test passed! The usage endpoint is working correctly.');
    return true;
  } catch (error) {
    console.error('Error testing usage endpoint:');
    if (error.response) {
      console.error(`Status: ${error.response.status}`);
      console.error('Response:', error.response.data);
    } else {
      console.error(error.message);
    }
    console.log('Test failed! The usage endpoint is not working correctly.');
    return false;
  }
}

// Run the tests
async function runTests() {
  console.log('Starting tests...');
  
  const webhookResult = await testWebhook();
  const usageResult = await testUsageEndpoint();
  
  if (webhookResult && usageResult) {
    console.log('All tests passed! Your backend is ready to connect to the frontend.');
  } else {
    console.log('Some tests failed. Please check the logs for details.');
  }
}

runTests();
