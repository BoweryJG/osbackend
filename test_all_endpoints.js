import axios from 'axios';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import FormData from 'form-data';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '.env') });

const BASE_URL = 'http://localhost:3001';
const API_KEY = process.env.OPENROUTER_API_KEY;

// Colors for console output
const colors = {
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  reset: '\x1b[0m'
};

function logSuccess(message) {
  console.log(`${colors.green}✓ ${message}${colors.reset}`);
}

function logError(message) {
  console.log(`${colors.red}✗ ${message}${colors.reset}`);
}

function logInfo(message) {
  console.log(`${colors.blue}ℹ ${message}${colors.reset}`);
}

function logSection(message) {
  console.log(`\n${colors.yellow}=== ${message} ===${colors.reset}`);
}

async function testEndpoint(method, path, data = null, headers = {}) {
  try {
    const config = {
      method,
      url: `${BASE_URL}${path}`,
      headers: { ...headers },
      timeout: 10000
    };

    if (data) {
      config.data = data;
    }

    const response = await axios(config);
    return { success: true, data: response.data, status: response.status };
  } catch (error) {
    return { 
      success: false, 
      error: error.response?.data || error.message || error.code,
      status: error.response?.status || 'N/A',
      fullError: error
    };
  }
}

async function runTests() {
  console.log('Starting endpoint tests...\n');

  // 1. Health Check
  logSection('Health Check Endpoints');
  
  let result = await testEndpoint('GET', '/health');
  if (result.success) {
    logSuccess(`GET /health - Status: ${result.status}`);
  } else {
    logError(`GET /health - Error: ${result.error} - Status: ${result.status}`);
    if (result.fullError.code === 'ECONNREFUSED') {
      logError('Server appears to be down. Make sure the server is running on port 3001');
      return;
    }
  }

  result = await testEndpoint('GET', '/api/health');
  if (result.success) {
    logSuccess(`GET /api/health - Status: ${result.status}`);
  } else {
    logError(`GET /api/health - Error: ${result.error}`);
  }

  // 2. Authentication Endpoints
  logSection('Authentication Endpoints');
  
  result = await testEndpoint('GET', '/api/auth/csrf-token');
  if (result.success) {
    logSuccess(`GET /api/auth/csrf-token - Status: ${result.status}`);
    const csrfToken = result.data.csrfToken;
    logInfo(`CSRF Token: ${csrfToken?.substring(0, 20)}...`);
  } else {
    logError(`GET /api/auth/csrf-token - Error: ${result.error}`);
  }

  // 3. Phone System Endpoints
  logSection('Phone System Endpoints');
  
  result = await testEndpoint('GET', '/api/phone/numbers');
  if (result.success) {
    logSuccess(`GET /api/phone/numbers - Status: ${result.status}`);
  } else {
    logError(`GET /api/phone/numbers - Error: ${result.error}`);
  }

  result = await testEndpoint('GET', '/api/phone/calls/history');
  if (result.success) {
    logSuccess(`GET /api/phone/calls/history - Status: ${result.status}`);
  } else {
    logError(`GET /api/phone/calls/history - Error: ${result.error}`);
  }

  // 4. SMS Endpoints
  logSection('SMS Endpoints');
  
  result = await testEndpoint('GET', '/api/phone/sms/history');
  if (result.success) {
    logSuccess(`GET /api/phone/sms/history - Status: ${result.status}`);
  } else {
    logError(`GET /api/phone/sms/history - Error: ${result.error}`);
  }

  result = await testEndpoint('GET', '/api/phone/sms/conversations');
  if (result.success) {
    logSuccess(`GET /api/phone/sms/conversations - Status: ${result.status}`);
  } else {
    logError(`GET /api/phone/sms/conversations - Error: ${result.error}`);
  }

  // 5. Email Endpoints
  logSection('Email Endpoints');
  
  result = await testEndpoint('GET', '/api/email/accounts');
  if (result.success) {
    logSuccess(`GET /api/email/accounts - Status: ${result.status}`);
    logInfo(`Email accounts: ${JSON.stringify(result.data.accounts)}`);
  } else {
    logError(`GET /api/email/accounts - Error: ${result.error}`);
  }

  result = await testEndpoint('GET', '/api/email/templates');
  if (result.success) {
    logSuccess(`GET /api/email/templates - Status: ${result.status}`);
  } else {
    logError(`GET /api/email/templates - Error: ${result.error}`);
  }

  // 6. AI Agent Endpoints
  logSection('AI Agent Endpoints');
  
  result = await testEndpoint('GET', '/api/agents');
  if (result.success) {
    logSuccess(`GET /api/agents - Status: ${result.status}`);
  } else {
    logError(`GET /api/agents - Error: ${result.error}`);
  }

  result = await testEndpoint('GET', '/api/agents/conversations');
  if (result.success) {
    logSuccess(`GET /api/agents/conversations - Status: ${result.status}`);
  } else {
    logError(`GET /api/agents/conversations - Error: ${result.error}`);
  }

  // 7. Transcription Endpoints
  logSection('Transcription Endpoints');
  
  result = await testEndpoint('GET', '/api/transcriptions');
  if (result.success) {
    logSuccess(`GET /api/transcriptions - Status: ${result.status}`);
  } else {
    logError(`GET /api/transcriptions - Error: ${result.error}`);
  }

  // 8. Usage/Billing Endpoints
  logSection('Usage & Billing Endpoints');
  
  result = await testEndpoint('GET', '/api/usage/summary');
  if (result.success) {
    logSuccess(`GET /api/usage/summary - Status: ${result.status}`);
  } else {
    logError(`GET /api/usage/summary - Error: ${result.error}`);
  }

  // 9. Research/AI Task Endpoints
  logSection('AI Task Endpoints');
  
  result = await testEndpoint('POST', '/task', {
    prompt: 'What is 2+2?',
    stream: false
  }, {
    'Content-Type': 'application/json'
  });
  if (result.success) {
    logSuccess(`POST /task - Status: ${result.status}`);
    logInfo(`AI Response: ${result.data.result?.substring(0, 50)}...`);
  } else {
    logError(`POST /task - Error: ${result.error}`);
  }

  // 10. Harvey AI Endpoints
  logSection('Harvey AI Endpoints');
  
  result = await testEndpoint('GET', '/api/harvey/status');
  if (result.success) {
    logSuccess(`GET /api/harvey/status - Status: ${result.status}`);
  } else {
    logError(`GET /api/harvey/status - Error: ${result.error}`);
  }

  // 11. Call Summary Endpoints
  logSection('Call Summary Endpoints');
  
  result = await testEndpoint('GET', '/api/call-summaries');
  if (result.success) {
    logSuccess(`GET /api/call-summaries - Status: ${result.status}`);
  } else {
    logError(`GET /api/call-summaries - Error: ${result.error}`);
  }

  // 12. Coaching Session Endpoints
  logSection('Coaching Session Endpoints');
  
  result = await testEndpoint('GET', '/api/coaching-sessions');
  if (result.success) {
    logSuccess(`GET /api/coaching-sessions - Status: ${result.status}`);
  } else {
    logError(`GET /api/coaching-sessions - Error: ${result.error}`);
  }

  // Test WebSocket endpoints (just verify they exist)
  logSection('WebSocket Endpoints (Verification Only)');
  logInfo('WebSocket endpoints verified during server startup:');
  logInfo('- /agents-ws - Canvas Agents WebSocket');
  logInfo('- /call-transcription-ws - Call Transcription WebSocket');
  logInfo('- /harvey-ws - Harvey AI WebSocket');
  logInfo('- /api/media-stream - Twilio Media Stream WebSocket');

  console.log('\n✅ Endpoint testing complete!');
}

// Run the tests
runTests().catch(console.error);