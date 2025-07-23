import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

import WebSocket from 'ws';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Test call transcription by simulating a Twilio Media Stream
async function testCallTranscription() {
  console.log('🎤 Testing Call Transcription Service...\n');

  // Connect to the Twilio Media Stream WebSocket endpoint
  const ws = new WebSocket('ws://localhost:3001/api/media-stream');

  const testCallSid = `CA${Date.now()}test`;
  const testStreamSid = `MZ${Date.now()}test`;

  ws.on('open', () => {
    console.log('✅ Connected to Media Stream WebSocket');

    // Send start event
    const startMessage = {
      event: 'start',
      start: {
        streamSid: testStreamSid,
        callSid: testCallSid,
        accountSid: 'ACtest',
        tracks: ['inbound']
      }
    };

    ws.send(JSON.stringify(startMessage));
    console.log('📤 Sent start event for call:', testCallSid);

    // Send some test audio data
    // In a real scenario, this would be μ-law encoded audio from Twilio
    // For testing, we'll send some mock data
    let audioPacketCount = 0;
    const sendAudioInterval = setInterval(() => {
      if (audioPacketCount >= 10) {
        clearInterval(sendAudioInterval);
        
        // Send stop event
        const stopMessage = {
          event: 'stop',
          stop: {
            streamSid: testStreamSid,
            callSid: testCallSid
          }
        };
        
        ws.send(JSON.stringify(stopMessage));
        console.log('📤 Sent stop event');
        
        setTimeout(() => {
          ws.close();
          console.log('\n✅ Test completed!');
        }, 2000);
        
        return;
      }

      // Create mock μ-law audio data (in reality, this would be actual audio)
      // This is just random data for testing the pipeline
      const mockAudioBuffer = Buffer.alloc(320); // ~20ms of 8kHz audio
      for (let i = 0; i < mockAudioBuffer.length; i++) {
        mockAudioBuffer[i] = Math.floor(Math.random() * 256);
      }

      const mediaMessage = {
        event: 'media',
        media: {
          payload: mockAudioBuffer.toString('base64'),
          chunk: audioPacketCount.toString(),
          timestamp: Date.now().toString()
        }
      };

      ws.send(JSON.stringify(mediaMessage));
      audioPacketCount++;
      
      if (audioPacketCount % 5 === 0) {
        console.log(`📊 Sent ${audioPacketCount} audio packets...`);
      }
    }, 200); // Send audio every 200ms
  });

  ws.on('message', (data) => {
    console.log('📥 Received:', data.toString());
  });

  ws.on('error', (error) => {
    console.error('❌ WebSocket error:', error);
  });

  ws.on('close', () => {
    console.log('🔌 WebSocket connection closed');
  });
}

// Also test the Socket.IO connection for receiving transcriptions
async function testTranscriptionClient() {
  console.log('\n🎧 Testing Transcription Client...\n');

  const io = await import('socket.io-client');
  const socket = io.default('http://localhost:3001/call-transcription-ws', {
    path: '/agents-ws',
    auth: { token: 'test-token' },
    transports: ['websocket']
  });

  socket.on('connect', () => {
    console.log('✅ Connected to transcription namespace');
    
    // Subscribe to the test call
    const testCallSid = `CA${Date.now()}test`;
    socket.emit('subscribe:call', testCallSid);
    console.log('📡 Subscribed to call:', testCallSid);
  });

  socket.on('transcription:started', (data) => {
    console.log('🎙️ Transcription started:', data);
  });

  socket.on('transcription:update', (data) => {
    console.log('📝 Transcription update:', {
      text: data.latest,
      sentiment: data.sentiment,
      timestamp: data.timestamp
    });
  });

  socket.on('transcription:completed', (data) => {
    console.log('✅ Transcription completed:', data);
  });

  socket.on('transcription:error', (data) => {
    console.error('❌ Transcription error:', data);
  });

  socket.on('error', (error) => {
    console.error('❌ Socket error:', error);
  });

  socket.on('disconnect', () => {
    console.log('🔌 Socket disconnected');
  });

  // Keep the client running
  setTimeout(() => {
    socket.close();
    console.log('\n✅ Client test completed!');
  }, 30000);
}

// Run both tests
console.log('🚀 Starting Call Transcription Tests...\n');
console.log('Note: This test sends mock audio data to test the pipeline.');
console.log('In production, Twilio would send real μ-law encoded call audio.\n');

// Start the transcription client first to catch events
testTranscriptionClient();

// Wait a moment, then start the media stream test
setTimeout(() => {
  testCallTranscription();
}, 2000);