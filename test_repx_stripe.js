import axios from 'axios';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, '.env') });

const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:3000';

async function testRepXPricing() {
  console.log('🔍 Testing RepX pricing endpoint...');
  try {
    const response = await axios.get(`${BACKEND_URL}/api/stripe/pricing`);
    console.log('✅ Pricing response:', JSON.stringify(response.data, null, 2));
    
    // Validate the response structure
    const { data } = response.data;
    if (!data.pricing || !data.tiers || !data.billingCycles) {
      throw new Error('Invalid pricing response structure');
    }
    
    // Check that all tiers are present
    const expectedTiers = ['repx1', 'repx2', 'repx3', 'repx4', 'repx5'];
    for (const tier of expectedTiers) {
      if (!data.pricing[tier]) {
        throw new Error(`Missing tier: ${tier}`);
      }
      if (!data.pricing[tier].monthly || !data.pricing[tier].annual) {
        throw new Error(`Missing billing cycles for tier: ${tier}`);
      }
    }
    
    console.log('✅ Pricing structure validation passed');
    return true;
  } catch (err) {
    console.error('❌ Pricing test error:', err.response ? err.response.data : err.message);
    return false;
  }
}

async function testRepXCheckout() {
  console.log('🔍 Testing RepX checkout session creation...');
  try {
    const testData = {
      tier: 'repx2',
      billingCycle: 'monthly',
      customerEmail: 'test@example.com',
      successUrl: 'https://crm.repspheres.com/subscription/success',
      cancelUrl: 'https://crm.repspheres.com/subscription/cancel'
    };
    
    console.log('Sending test data:', testData);
    
    const response = await axios.post(`${BACKEND_URL}/api/stripe/create-checkout-session`, testData);
    console.log('✅ Checkout response:', JSON.stringify(response.data, null, 2));
    
    // Validate the response structure
    const { data } = response.data;
    if (!data.sessionId || !data.url) {
      throw new Error('Invalid checkout response structure');
    }
    
    if (!data.url.startsWith('https://checkout.stripe.com/')) {
      throw new Error('Invalid checkout URL format');
    }
    
    console.log('✅ Checkout session validation passed');
    console.log('📝 Checkout URL:', data.url);
    return true;
  } catch (err) {
    console.error('❌ Checkout test error:', err.response ? err.response.data : err.message);
    return false;
  }
}

async function testSubscriptionLookup() {
  console.log('🔍 Testing subscription lookup...');
  try {
    const response = await axios.post(`${BACKEND_URL}/api/stripe/subscription`, {
      customer_email: 'test@example.com'
    });
    
    console.log('✅ Subscription lookup response:', JSON.stringify(response.data, null, 2));
    return true;
  } catch (err) {
    // 404 is expected if customer doesn't exist
    if (err.response && err.response.status === 404) {
      console.log('✅ Subscription lookup correctly returns 404 for non-existent customer');
      return true;
    }
    console.error('❌ Subscription lookup test error:', err.response ? err.response.data : err.message);
    return false;
  }
}

async function runAllTests() {
  console.log('🚀 Starting RepX Stripe API tests...');
  console.log(`Backend URL: ${BACKEND_URL}`);
  console.log('=====================================');
  
  const tests = [
    { name: 'RepX Pricing', fn: testRepXPricing },
    { name: 'RepX Checkout', fn: testRepXCheckout },
    { name: 'Subscription Lookup', fn: testSubscriptionLookup }
  ];
  
  let passed = 0;
  let failed = 0;
  
  for (const test of tests) {
    console.log(`\n📋 Running: ${test.name}`);
    try {
      const result = await test.fn();
      if (result) {
        passed++;
        console.log(`✅ ${test.name} PASSED`);
      } else {
        failed++;
        console.log(`❌ ${test.name} FAILED`);
      }
    } catch (error) {
      failed++;
      console.log(`❌ ${test.name} FAILED:`, error.message);
    }
  }
  
  console.log('\n=====================================');
  console.log(`📊 Test Results: ${passed} passed, ${failed} failed`);
  
  if (failed > 0) {
    console.log('❌ Some tests failed. Check the errors above.');
    process.exit(1);
  } else {
    console.log('🎉 All RepX Stripe tests passed!');
    process.exit(0);
  }
}

// Run the tests
runAllTests().catch(error => {
  console.error('💥 Test suite crashed:', error);
  process.exit(1);
});