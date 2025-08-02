import WebSocket from 'ws';

console.log('Testing WebSocket connection to osbackend...');

const ws = new WebSocket('wss://osbackend-zl1h.onrender.com/ws');

ws.on('open', () => {
  console.log('✅ WebSocket connected successfully!');
  
  // Test sending a message
  ws.send(JSON.stringify({
    type: 'heartbeat',
    payload: { timestamp: new Date().toISOString() }
  }));
  
  setTimeout(() => {
    ws.close();
    console.log('✅ WebSocket test completed');
    process.exit(0);
  }, 2000);
});

ws.on('message', (data) => {
  console.log('Received:', data.toString());
});

ws.on('error', (error) => {
  console.error('❌ WebSocket error:', error.message);
  process.exit(1);
});

ws.on('close', () => {
  console.log('WebSocket closed');
});

setTimeout(() => {
  console.error('❌ WebSocket connection timeout');
  process.exit(1);
}, 10000);