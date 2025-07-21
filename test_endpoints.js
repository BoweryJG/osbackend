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
  console.log('🚀 Starting comprehensive endpoint tests...');
  console.log(`Backend URL: ${BASE_URL}`);
  
  // Test 1: RepConnect agents endpoint
  const repconnectResult = await testEndpoint(
    'RepConnect GET /api/repconnect/agents',
    `${BASE_URL}/api/repconnect/agents`
  );
  
  if (repconnectResult.success) {
    const agents = repconnectResult.data.agents || [];
    console.log(`\n📊 RepConnect Agent Summary:`);
    console.log(`Total agents: ${agents.length}`);
    console.log(`Voice enabled: ${agents.filter(a => a.voice_enabled).length}`);
    console.log(`Categories: ${[...new Set(agents.map(a => a.agent_category))].join(', ')}`);
    
    // Check for Harvey
    const harvey = agents.find(a => a.name === 'Harvey Specter');
    if (harvey) {
      console.log(`\n🔥 Harvey Specter found:`);
      console.log(`- Category: ${harvey.agent_category}`);
      console.log(`- Voice: ${harvey.voice_name}`);
      console.log(`- Whisper support: ${harvey.whisper_supported}`);
    }
  }
  
  // Test 2: Canvas agents endpoint  
  const canvasResult = await testEndpoint(
    'Canvas GET /api/canvas/agents',
    `${BASE_URL}/api/canvas/agents`
  );
  
  if (canvasResult.success) {
    const agents = canvasResult.data.agents || [];
    console.log(`\n📊 Canvas Agent Summary:`);
    console.log(`Total agents: ${agents.length}`);
    console.log(`Active agents: ${agents.filter(a => a.is_active).length}`);
  }
  
  // Test 3: RepConnect voice-enabled agents
  await testEndpoint(
    'RepConnect GET /api/repconnect/agents/voice-enabled',
    `${BASE_URL}/api/repconnect/agents/voice-enabled`
  );
  
  // Test 4: Harvey Specter specific endpoint
  await testEndpoint(
    'RepConnect GET /api/repconnect/agents/harvey',
    `${BASE_URL}/api/repconnect/agents/harvey`
  );
  
  // Test 5: Agent categories
  const categoriesResult = await testEndpoint(
    'RepConnect GET /api/repconnect/agents/categories',
    `${BASE_URL}/api/repconnect/agents/categories`
  );
  
  if (categoriesResult.success) {
    console.log('\n📋 Available Categories:');
    categoriesResult.data.categories.forEach(cat => {
      console.log(`- ${cat.label}: ${cat.count} agents`);
    });
  }
  
  // Test 6: Validate agent data structure
  if (repconnectResult.success) {
    const sampleAgent = repconnectResult.data.agents[0];
    if (sampleAgent) {
      console.log('\n🔍 Validating agent data structure:');
      const requiredFields = ['id', 'name', 'voice_id', 'voice_enabled', 'agent_category'];
      const missingFields = requiredFields.filter(field => !(field in sampleAgent));
      
      if (missingFields.length === 0) {
        console.log('✅ All required fields present');
      } else {
        console.log(`❌ Missing fields: ${missingFields.join(', ')}`);
      }
    }
  }
  
  console.log('\n✅ Test suite completed!');
}

// Run the tests
runTests().catch(console.error);