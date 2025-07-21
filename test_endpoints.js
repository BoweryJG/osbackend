import fetch from 'node-fetch';
import dotenv from 'dotenv';

dotenv.config();

const BASE_URL = 'https://osbackend-zl1h.onrender.com';

// Test function with better error handling
async function testEndpoint(name, url, options = {}) {
  console.log(`\n🧪 Testing ${name}...`);
  console.log(`URL: ${url}`);
  
  try {
    const response = await fetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...options.headers
      }
    });
    
    console.log(`Status: ${response.status} ${response.statusText}`);
    
    const data = await response.json();
    console.log('Response:', JSON.stringify(data, null, 2));
    
    return { success: response.ok, data, status: response.status };
  } catch (error) {
    console.error(`❌ Error: ${error.message}`);
    return { success: false, error: error.message };
  }
}

async function runTests() {
  console.log('🚀 Starting endpoint tests...');
  console.log(`Backend URL: ${BASE_URL}`);
  
  // Test 1: RepConnect agents endpoint
  await testEndpoint(
    'RepConnect GET /api/repconnect/agents',
    `${BASE_URL}/api/repconnect/agents`
  );
  
  // Test 2: Canvas agents endpoint  
  await testEndpoint(
    'Canvas GET /api/canvas/agents',
    `${BASE_URL}/api/canvas/agents`
  );
  
  // Test 3: Check what tables exist in the database
  console.log('\n📊 Checking database tables...');
  
  // Test 4: Create a test RepConnect agent (requires auth)
  const testAgent = {
    name: 'Test RepConnect Agent',
    role: 'Test Role',
    tagline: 'Testing RepConnect endpoints',
    category: 'test',
    active: true
  };
  
  console.log('\n🔧 Testing RepConnect POST (will fail without auth - this is expected)');
  await testEndpoint(
    'RepConnect POST /api/repconnect/agents',
    `${BASE_URL}/api/repconnect/agents`,
    {
      method: 'POST',
      body: JSON.stringify(testAgent)
    }
  );
  
  console.log('\n✅ Test suite completed!');
}

// Run the tests
runTests().catch(console.error);