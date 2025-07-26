import fetch from 'node-fetch';
import crypto from 'crypto';

async function testEndpoint() {
  const url = 'https://osbackend-zl1h.onrender.com/api/repconnect/agents/00ed4a18-12f9-4ab0-9c94-2915ad94a9b1/start-trial-voice-session';
  
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Origin': 'https://repconnect.repspheres.com',
      'User-Agent': 'TestBot/1.0'
    },
    body: JSON.stringify({})
  });
  
  const text = await response.text();
  console.log('Status:', response.status);
  console.log('Response:', text);
  
  try {
    const json = JSON.parse(text);
    console.log('Parsed:', JSON.stringify(json, null, 2));
  } catch (e) {
    console.log('Not JSON');
  }
}

testEndpoint();