import io from 'socket.io-client';
import axios from 'axios';

const BACKEND_URL = 'https://osbackend-zl1h.onrender.com';

async function testCanvasAgents() {
  console.log('Testing Canvas Agents System...\n');

  // Test 1: Check if agents API is accessible
  console.log('1. Testing Agents API...');
  try {
    const response = await axios.get(`${BACKEND_URL}/api/agents`, {
      headers: {
        // Add auth header if needed
      }
    });
    console.log('✅ Agents API accessible:', response.data);
  } catch (error) {
    console.log('❌ Agents API error:', error.response?.status || error.message);
  }

  // Test 2: WebSocket connection
  console.log('\n2. Testing WebSocket connection...');
  const socket = io(`${BACKEND_URL}/agents-ws`, {
    transports: ['websocket'],
    reconnection: false
  });

  socket.on('connect', () => {
    console.log('✅ WebSocket connected!');
    console.log('Socket ID:', socket.id);
    
    // Test sending a message
    socket.emit('agent:message', {
      agentId: 'hunter',
      message: 'Hello, can you help me find leads?'
    });
  });

  socket.on('agent:response', (data) => {
    console.log('✅ Agent response received:', data);
  });

  socket.on('error', (error) => {
    console.log('❌ WebSocket error:', error);
  });

  socket.on('connect_error', (error) => {
    console.log('❌ Connection error:', error.message);
  });

  // Give it 5 seconds to connect
  setTimeout(() => {
    socket.close();
    console.log('\nTest complete.');
    process.exit(0);
  }, 5000);
}

// Run the test
testCanvasAgents();