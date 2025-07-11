import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();

const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:3000';

// Test authentication token (you'll need to replace this with a valid token)
const AUTH_TOKEN = process.env.TEST_AUTH_TOKEN || 'your-test-token-here';

const axiosInstance = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Authorization': `Bearer ${AUTH_TOKEN}`,
    'Content-Type': 'application/json'
  }
});

// Color codes for console output
const colors = {
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  reset: '\x1b[0m'
};

async function testEndpoint(name, method, path, data = null) {
  console.log(`\n${colors.blue}Testing: ${name}${colors.reset}`);
  console.log(`${method} ${path}`);
  
  try {
    const config = {
      method,
      url: path
    };
    
    if (data) {
      config.data = data;
    }
    
    const response = await axiosInstance(config);
    
    console.log(`${colors.green}✓ Success${colors.reset}`);
    console.log(`Status: ${response.status}`);
    console.log(`Response keys: ${Object.keys(response.data).join(', ')}`);
    
    if (response.data.data) {
      const dataKeys = Object.keys(response.data.data);
      console.log(`Data contains: ${dataKeys.join(', ')}`);
      
      // Show sample data for arrays
      dataKeys.forEach(key => {
        const value = response.data.data[key];
        if (Array.isArray(value)) {
          console.log(`  ${key}: ${value.length} items`);
        } else if (typeof value === 'object' && value !== null) {
          console.log(`  ${key}: ${Object.keys(value).length} properties`);
        }
      });
    }
    
    return { success: true, data: response.data };
  } catch (error) {
    console.log(`${colors.red}✗ Failed${colors.reset}`);
    
    if (error.response) {
      console.log(`Status: ${error.response.status}`);
      console.log(`Error: ${JSON.stringify(error.response.data, null, 2)}`);
    } else {
      console.log(`Error: ${error.message}`);
    }
    
    return { success: false, error };
  }
}

async function runTests() {
  console.log(`${colors.yellow}Starting Dashboard API Tests${colors.reset}`);
  console.log(`API Base URL: ${API_BASE_URL}`);
  console.log(`Auth Token: ${AUTH_TOKEN ? 'Set' : 'Not set'}`);
  
  if (!AUTH_TOKEN || AUTH_TOKEN === 'your-test-token-here') {
    console.log(`\n${colors.red}ERROR: Please set a valid AUTH_TOKEN${colors.reset}`);
    console.log('You can get a token by authenticating through the app or using the auth endpoints');
    return;
  }
  
  const results = [];
  
  // Test dashboard overview
  results.push(await testEndpoint(
    'Dashboard Overview',
    'GET',
    '/api/dashboard/overview'
  ));
  
  // Test agents listing
  results.push(await testEndpoint(
    'List Agents',
    'GET',
    '/api/dashboard/agents?page=1&limit=10'
  ));
  
  // Test voice profiles
  results.push(await testEndpoint(
    'Voice Profiles',
    'GET',
    '/api/dashboard/voice-profiles?limit=20'
  ));
  
  // Test personality templates
  results.push(await testEndpoint(
    'Personality Templates',
    'GET',
    '/api/dashboard/personality-templates'
  ));
  
  // Test quick clips
  results.push(await testEndpoint(
    'Quick Clips',
    'GET',
    '/api/dashboard/quick-clips?limit=10'
  ));
  
  // Test training status
  results.push(await testEndpoint(
    'Training Status',
    'GET',
    '/api/dashboard/training-status'
  ));
  
  // If we have an agent ID from the agents test, test detailed metrics
  const agentsResult = results.find(r => r.data?.data?.agents?.length > 0);
  if (agentsResult && agentsResult.data.data.agents[0]) {
    const agentId = agentsResult.data.data.agents[0].id;
    results.push(await testEndpoint(
      'Agent Detailed Metrics',
      'GET',
      `/api/dashboard/metrics/${agentId}?period=day`
    ));
  }
  
  // Test metrics refresh (requires professional tier)
  results.push(await testEndpoint(
    'Refresh Metrics',
    'POST',
    '/api/dashboard/refresh-metrics'
  ));
  
  // Test export endpoint
  results.push(await testEndpoint(
    'Export Dashboard Data',
    'GET',
    '/api/dashboard/export?format=json&dataTypes=metrics'
  ));
  
  // Summary
  console.log(`\n${colors.yellow}Test Summary${colors.reset}`);
  console.log('─'.repeat(50));
  
  const successful = results.filter(r => r.success).length;
  const failed = results.filter(r => !r.success).length;
  
  console.log(`Total tests: ${results.length}`);
  console.log(`${colors.green}Successful: ${successful}${colors.reset}`);
  console.log(`${colors.red}Failed: ${failed}${colors.reset}`);
  
  if (failed > 0) {
    console.log(`\n${colors.red}Some tests failed. Please check the errors above.${colors.reset}`);
  } else {
    console.log(`\n${colors.green}All tests passed!${colors.reset}`);
  }
}

// Run the tests
runTests().catch(error => {
  console.error(`\n${colors.red}Test runner error:${colors.reset}`, error);
  process.exit(1);
});