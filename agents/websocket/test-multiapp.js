#!/usr/bin/env node

import { io } from 'socket.io-client';

// Test configuration
const SERVER_URL = 'http://localhost:3001'; // Adjust port as needed
const WEBSOCKET_PATH = '/agents-ws';

// Test function for a specific app
async function testApp(appName, testName) {
  return new Promise((resolve, reject) => {
    console.log(`\n=== Testing ${testName} ===`);
    
    const socket = io(SERVER_URL, {
      path: WEBSOCKET_PATH,
      auth: {
        appName: appName,
        token: 'demo-token' // For demo purposes
      }
    });

    let connected = false;
    let timeout;

    socket.on('connect', () => {
      connected = true;
      console.log(`✅ ${testName}: Connected successfully`);
      console.log(`   App Name: ${appName}`);
      console.log(`   Socket ID: ${socket.id}`);
      
      // Test agent listing
      socket.emit('agent:list');
    });

    socket.on('agent:list', (agents) => {
      console.log(`✅ ${testName}: Received agent list`);
      console.log(`   Number of agents: ${agents.length}`);
      if (agents.length > 0) {
        console.log(`   First agent: ${agents[0].name} (ID: ${agents[0].id})`);
      }
      
      // Clean up and resolve
      clearTimeout(timeout);
      socket.disconnect();
      resolve({
        success: true,
        appName,
        agentCount: agents.length
      });
    });

    socket.on('error', (error) => {
      console.log(`❌ ${testName}: Error - ${error.message || error}`);
      clearTimeout(timeout);
      socket.disconnect();
      resolve({
        success: false,
        appName,
        error: error.message || error
      });
    });

    socket.on('connect_error', (error) => {
      console.log(`❌ ${testName}: Connection error - ${error.message}`);
      clearTimeout(timeout);
      resolve({
        success: false,
        appName,
        error: error.message
      });
    });

    socket.on('disconnect', () => {
      if (connected) {
        console.log(`🔌 ${testName}: Disconnected`);
      }
    });

    // Timeout after 10 seconds
    timeout = setTimeout(() => {
      console.log(`⏰ ${testName}: Timeout`);
      socket.disconnect();
      resolve({
        success: false,
        appName,
        error: 'Timeout'
      });
    }, 10000);
  });
}

// Main test function
async function runTests() {
  console.log('🚀 Starting WebSocket Multi-App Functionality Test');
  console.log(`📡 Server: ${SERVER_URL}${WEBSOCKET_PATH}`);
  
  const results = [];

  // Test Canvas app
  const canvasResult = await testApp('canvas', 'Canvas App');
  results.push(canvasResult);

  // Wait a bit between tests
  await new Promise(resolve => setTimeout(resolve, 1000));

  // Test RepConnect app
  const repconnectResult = await testApp('repconnect', 'RepConnect App');
  results.push(repconnectResult);

  // Wait a bit between tests
  await new Promise(resolve => setTimeout(resolve, 1000));

  // Test default app (should default to canvas)
  const defaultResult = await testApp(undefined, 'Default App');
  results.push(defaultResult);

  // Print summary
  console.log('\n' + '='.repeat(50));
  console.log('📊 TEST SUMMARY');
  console.log('='.repeat(50));
  
  let successCount = 0;
  results.forEach(result => {
    const status = result.success ? '✅ PASS' : '❌ FAIL';
    const appName = result.appName || 'default (canvas)';
    console.log(`${status} ${appName}`);
    if (result.success) {
      successCount++;
      console.log(`    Agents available: ${result.agentCount}`);
    } else {
      console.log(`    Error: ${result.error}`);
    }
  });
  
  console.log(`\n📈 Results: ${successCount}/${results.length} tests passed`);
  
  if (successCount === results.length) {
    console.log('🎉 All tests passed! Multi-app functionality is working correctly.');
  } else {
    console.log('⚠️  Some tests failed. Check the server logs for more details.');
  }

  process.exit(successCount === results.length ? 0 : 1);
}

// Run the tests
runTests().catch(error => {
  console.error('💥 Test runner error:', error);
  process.exit(1);
});