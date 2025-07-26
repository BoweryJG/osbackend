import https from 'https';

const options = {
  hostname: 'osbackend-zl1h.onrender.com',
  path: '/api/repconnect/agents/00ed4a18-12f9-4ab0-9c94-2915ad94a9b1/start-trial-voice-session',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Origin': 'https://repconnect.repspheres.com',
    'User-Agent': 'TestClient/1.0'
  }
};

const req = https.request(options, (res) => {
  console.log(`Status: ${res.statusCode}`);
  console.log(`Headers:`, res.headers);
  
  let data = '';
  res.on('data', (chunk) => {
    data += chunk;
  });
  
  res.on('end', () => {
    console.log('Response:', data);
    try {
      const parsed = JSON.parse(data);
      if (parsed.error) {
        console.log('\nError details:');
        console.log('- Message:', parsed.error.message);
        console.log('- Request ID:', parsed.error.requestId);
      }
    } catch (e) {
      // Not JSON
    }
  });
});

req.on('error', (error) => {
  console.error('Request error:', error);
});

req.write('{}');
req.end();