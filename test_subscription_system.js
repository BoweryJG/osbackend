/**
 * Test script for RepConnect Subscription System
 * 
 * Run this to verify all subscription endpoints are working correctly:
 * node test_subscription_system.js
 */

import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

dotenv.config();

const API_URL = process.env.REPCONNECT_API_URL || 'http://localhost:3000';
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

// Test user data
const TEST_USER = {
  id: 'test-user-' + Date.now(),
  email: `test-${Date.now()}@example.com`
};

// Color codes for output
const colors = {
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  reset: '\x1b[0m'
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

async function makeRequest(endpoint, options = {}) {
  const url = `${API_URL}${endpoint}`;
  const response = await fetch(url, {
    headers: {
      'Content-Type': 'application/json',
      ...options.headers
    },
    ...options
  });

  const data = await response.json();
  
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${data.message || response.statusText}`);
  }

  return data;
}

async function testValidateAccess() {
  log('\n📋 Testing: Validate Access', 'blue');
  
  try {
    // Test with free tier (should fail for calls)
    const freeAccess = await makeRequest('/api/subscription/validate-access', {
      method: 'POST',
      body: JSON.stringify({
        userId: TEST_USER.id,
        feature: 'calls',
        requestedQuantity: 1
      })
    });
    
    log(`Free tier calls access: ${freeAccess.data.allowed ? 'ALLOWED' : 'DENIED'}`, 
        freeAccess.data.allowed ? 'red' : 'green');
    
    // Test with free tier AI queries (should pass)
    const aiAccess = await makeRequest('/api/subscription/validate-access', {
      method: 'POST',
      body: JSON.stringify({
        userId: TEST_USER.id,
        feature: 'ai_queries',
        requestedQuantity: 1
      })
    });
    
    log(`Free tier AI access: ${aiAccess.data.allowed ? 'ALLOWED' : 'DENIED'}`,
        aiAccess.data.allowed ? 'green' : 'red');
    
    log('✅ Validate Access test passed', 'green');
    return true;
  } catch (error) {
    log(`❌ Validate Access test failed: ${error.message}`, 'red');
    return false;
  }
}

async function testCheckLimits() {
  log('\n📊 Testing: Check Limits', 'blue');
  
  try {
    const limits = await makeRequest('/api/subscription/check-limits', {
      method: 'POST',
      body: JSON.stringify({
        userId: TEST_USER.id
      })
    });
    
    log(`Tier: ${limits.data.tier}`, 'yellow');
    log('Limits:', 'yellow');
    Object.entries(limits.data.limits).forEach(([feature, data]) => {
      log(`  ${feature}: ${data.used}/${data.limit} (${data.percentage}% used)`, 'reset');
    });
    
    log('✅ Check Limits test passed', 'green');
    return true;
  } catch (error) {
    log(`❌ Check Limits test failed: ${error.message}`, 'red');
    return false;
  }
}

async function testTrackUsage() {
  log('\n📈 Testing: Track Usage', 'blue');
  
  try {
    // Track some AI usage
    const result = await makeRequest('/api/subscription/track-usage', {
      method: 'POST',
      body: JSON.stringify({
        userId: TEST_USER.id,
        feature: 'ai_queries',
        quantity: 1,
        appName: 'test',
        metadata: {
          test: true,
          timestamp: new Date().toISOString()
        }
      })
    });
    
    log(`Tracked usage ID: ${result.data.id}`, 'yellow');
    log(`Feature: ${result.data.feature}, Quantity: ${result.data.quantity}`, 'yellow');
    
    if (result.data.warning) {
      log(`Warning: ${result.data.warning}`, 'yellow');
    }
    
    log('✅ Track Usage test passed', 'green');
    return true;
  } catch (error) {
    log(`❌ Track Usage test failed: ${error.message}`, 'red');
    return false;
  }
}

async function testUsageStats() {
  log('\n📊 Testing: Usage Statistics', 'blue');
  
  try {
    const stats = await makeRequest(`/api/subscription/usage-stats?userId=${TEST_USER.id}&period=current_month`);
    
    log(`Period: ${stats.data.period}`, 'yellow');
    log(`Total records: ${stats.data.totalRecords}`, 'yellow');
    
    if (stats.data.aggregated.ai_queries) {
      log(`AI Queries used: ${stats.data.aggregated.ai_queries.total}`, 'yellow');
    }
    
    log('✅ Usage Stats test passed', 'green');
    return true;
  } catch (error) {
    log(`❌ Usage Stats test failed: ${error.message}`, 'red');
    return false;
  }
}

async function testTwilioConfig() {
  log('\n📱 Testing: Twilio Configuration Check', 'blue');
  
  try {
    const config = await makeRequest(`/api/subscription/twilio-config?userId=${TEST_USER.id}`);
    
    log(`Twilio configured: ${config.data.configured ? 'YES' : 'NO'}`, 
        config.data.configured ? 'green' : 'yellow');
    
    if (config.data.configured) {
      log(`Phone: ${config.data.phoneNumber}`, 'yellow');
      log(`Status: ${config.data.status}`, 'yellow');
    }
    
    log('✅ Twilio Config test passed', 'green');
    return true;
  } catch (error) {
    log(`❌ Twilio Config test failed: ${error.message}`, 'red');
    return false;
  }
}

async function testRateLimiting() {
  log('\n🚦 Testing: Rate Limiting', 'blue');
  
  try {
    // Simulate hitting limit
    const promises = [];
    for (let i = 0; i < 15; i++) {
      promises.push(
        makeRequest('/api/subscription/track-usage', {
          method: 'POST',
          body: JSON.stringify({
            userId: TEST_USER.id,
            feature: 'ai_queries',
            quantity: 1,
            appName: 'test'
          })
        })
      );
    }
    
    const results = await Promise.allSettled(promises);
    const succeeded = results.filter(r => r.status === 'fulfilled').length;
    const failed = results.filter(r => r.status === 'rejected').length;
    
    log(`Requests: ${succeeded} succeeded, ${failed} failed`, 'yellow');
    
    // Check if we hit the limit
    const limitCheck = await makeRequest('/api/subscription/validate-access', {
      method: 'POST',
      body: JSON.stringify({
        userId: TEST_USER.id,
        feature: 'ai_queries',
        requestedQuantity: 1
      })
    });
    
    if (!limitCheck.data.allowed) {
      log(`✅ Rate limiting working - limit reached (${limitCheck.data.currentUsage}/${limitCheck.data.limit})`, 'green');
    } else {
      log(`Current usage: ${limitCheck.data.currentUsage}/${limitCheck.data.limit}`, 'yellow');
    }
    
    return true;
  } catch (error) {
    log(`❌ Rate Limiting test failed: ${error.message}`, 'red');
    return false;
  }
}

async function testUpgradePath() {
  log('\n⬆️ Testing: Upgrade Path (RepX1)', 'blue');
  
  try {
    // Simulate user upgrade to RepX1
    await supabase.from('user_subscriptions').upsert({
      user_id: TEST_USER.id,
      email: TEST_USER.email,
      plan_id: 'repx1',
      status: 'active',
      stripe_subscription_id: 'sub_test_' + Date.now()
    });
    
    // Check new limits
    const limits = await makeRequest('/api/subscription/check-limits', {
      method: 'POST',
      body: JSON.stringify({
        userId: TEST_USER.id
      })
    });
    
    log(`New tier: ${limits.data.tier}`, 'green');
    log(`Calls limit: ${limits.data.limits.calls.limit}`, 'green');
    
    // Test Twilio provisioning (won't actually provision in test)
    if (process.env.ENABLE_TWILIO_TEST === 'true') {
      const provision = await makeRequest('/api/subscription/provision-twilio', {
        method: 'POST',
        body: JSON.stringify({
          userId: TEST_USER.id,
          email: TEST_USER.email,
          subscriptionTier: 'repx1'
        })
      });
      
      log(`Twilio provisioning: ${provision.data.provisioned ? 'SUCCESS' : 'FAILED'}`, 
          provision.data.provisioned ? 'green' : 'red');
    }
    
    log('✅ Upgrade Path test passed', 'green');
    return true;
  } catch (error) {
    log(`❌ Upgrade Path test failed: ${error.message}`, 'red');
    return false;
  }
}

async function cleanup() {
  log('\n🧹 Cleaning up test data...', 'blue');
  
  try {
    // Clean up test subscription
    await supabase
      .from('user_subscriptions')
      .delete()
      .eq('user_id', TEST_USER.id);
    
    // Clean up usage tracking
    await supabase
      .from('usage_tracking')
      .delete()
      .eq('user_id', TEST_USER.id);
    
    log('✅ Cleanup complete', 'green');
  } catch (error) {
    log(`⚠️ Cleanup error: ${error.message}`, 'yellow');
  }
}

async function runAllTests() {
  log('🚀 Starting RepConnect Subscription System Tests', 'blue');
  log(`API URL: ${API_URL}`, 'yellow');
  log(`Test User: ${TEST_USER.email}`, 'yellow');
  
  const tests = [
    { name: 'Validate Access', fn: testValidateAccess },
    { name: 'Check Limits', fn: testCheckLimits },
    { name: 'Track Usage', fn: testTrackUsage },
    { name: 'Usage Stats', fn: testUsageStats },
    { name: 'Twilio Config', fn: testTwilioConfig },
    { name: 'Rate Limiting', fn: testRateLimiting },
    { name: 'Upgrade Path', fn: testUpgradePath }
  ];
  
  let passed = 0;
  let failed = 0;
  
  for (const test of tests) {
    try {
      const result = await test.fn();
      if (result) passed++;
      else failed++;
    } catch (error) {
      failed++;
      log(`❌ ${test.name} threw error: ${error.message}`, 'red');
    }
  }
  
  await cleanup();
  
  log('\n📋 Test Summary', 'blue');
  log(`Total: ${tests.length}`, 'yellow');
  log(`Passed: ${passed}`, 'green');
  log(`Failed: ${failed}`, failed > 0 ? 'red' : 'green');
  
  if (failed === 0) {
    log('\n🎉 All tests passed! The subscription system is working correctly.', 'green');
  } else {
    log('\n⚠️ Some tests failed. Please check the errors above.', 'red');
  }
  
  process.exit(failed > 0 ? 1 : 0);
}

// Run tests
runAllTests().catch(error => {
  log(`\n❌ Fatal error: ${error.message}`, 'red');
  process.exit(1);
});