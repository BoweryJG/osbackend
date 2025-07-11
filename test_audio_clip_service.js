import dotenv from 'dotenv';
import express from 'express';
import { AudioClipService } from './services/audioClipService.js';

// Load environment variables
dotenv.config();

// Initialize Express app for testing
const app = express();
app.use(express.json());

// Initialize audio clip service
const audioClipService = new AudioClipService({
  voiceId: 'nicole', // Friendly voice
  clipExpiryHours: 24,
  maxDuration: 30
});

// Set up routes
audioClipService.setupRoutes(app);

// Test endpoints
app.post('/test/generate-clip', async (req, res) => {
  try {
    const { text, voiceId } = req.body;
    
    if (!text) {
      return res.status(400).json({ error: 'Text is required' });
    }
    
    console.log('Generating audio clip for:', text);
    
    const result = await audioClipService.generateClip(text, {
      voiceId: voiceId || 'nicole',
      targetDevice: 'all'
    });
    
    res.json({
      success: true,
      ...result
    });
    
  } catch (error) {
    console.error('Error generating clip:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/test/send-sms', async (req, res) => {
  try {
    const { clipId, phoneNumber, message } = req.body;
    
    if (!clipId || !phoneNumber) {
      return res.status(400).json({ error: 'clipId and phoneNumber are required' });
    }
    
    console.log('Sending audio clip via SMS:', { clipId, phoneNumber });
    
    const result = await audioClipService.sendClipViaSMS(clipId, phoneNumber, message);
    
    res.json({
      success: true,
      ...result
    });
    
  } catch (error) {
    console.error('Error sending SMS:', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/test/analytics/:clipId', async (req, res) => {
  try {
    const analytics = await audioClipService.getAnalytics(req.params.clipId);
    res.json(analytics);
  } catch (error) {
    console.error('Error fetching analytics:', error);
    res.status(404).json({ error: error.message });
  }
});

// Example usage
async function runTests() {
  console.log('Testing Audio Clip Service...\n');
  
  // Test 1: Generate a simple clip
  try {
    console.log('Test 1: Generating simple audio clip...');
    const clip = await audioClipService.generateClip(
      'Hello! This is a test audio message from RepSpheres.',
      { voiceId: 'nicole' }
    );
    console.log('✅ Clip generated:', clip);
    console.log(`   Share URL: ${clip.shareUrl}`);
    console.log(`   Expires at: ${clip.expiresAt}\n`);
    
    // Test 2: Generate a longer clip
    console.log('Test 2: Generating longer audio clip...');
    const longClip = await audioClipService.generateClip(
      'Welcome to RepSpheres audio messaging service. This is a longer message to test our audio generation capabilities. We can create personalized audio messages that can be shared via SMS or embedded in web pages.',
      { voiceId: 'antoni' } // Professional male voice
    );
    console.log('✅ Long clip generated:', longClip.clipId);
    
    // Test 3: Get shareable link with parameters
    console.log('\nTest 3: Generating shareable links...');
    const shareLink = audioClipService.generateShareableLink(clip.clipId, {
      autoplay: true,
      theme: 'dark'
    });
    console.log('✅ Share link with params:', shareLink);
    
    // Test 4: Get embed code
    console.log('\nTest 4: Getting embed code...');
    const embedCode = audioClipService.getEmbedCode(clip.clipId, {
      width: 500,
      height: 250
    });
    console.log('✅ Embed code:', embedCode);
    
    // Test 5: Estimate duration
    console.log('\nTest 5: Testing duration estimation...');
    const testText = 'This is a test message with approximately twenty words to check if our duration estimation is working correctly.';
    const estimatedDuration = audioClipService.estimateAudioDuration(testText);
    console.log(`✅ Estimated duration for "${testText.substring(0, 50)}...": ${estimatedDuration} seconds`);
    
    // Test 6: Analytics
    console.log('\nTest 6: Tracking analytics...');
    await audioClipService.trackAnalytics(clip.clipId, {
      event: 'play',
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 14_0 like Mac OS X)',
      sessionId: 'test-session-123'
    });
    
    const analytics = await audioClipService.getAnalytics(clip.clipId);
    console.log('✅ Analytics:', analytics);
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
  }
}

// Start the test server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Audio Clip Service test server running on port ${PORT}`);
  console.log(`\nTest endpoints:`);
  console.log(`- POST http://localhost:${PORT}/test/generate-clip`);
  console.log(`- POST http://localhost:${PORT}/test/send-sms`);
  console.log(`- GET  http://localhost:${PORT}/test/analytics/:clipId`);
  console.log(`\nAudio clip player: http://localhost:${PORT}/audio-clips/:clipId`);
  console.log('\n---\n');
  
  // Run automated tests
  runTests();
});

// Example curl commands
console.log('\nExample curl commands:\n');
console.log('# Generate audio clip:');
console.log(`curl -X POST http://localhost:${PORT}/test/generate-clip \\
  -H "Content-Type: application/json" \\
  -d '{"text": "Hello from RepSpheres!", "voiceId": "nicole"}'`);

console.log('\n# Send clip via SMS:');
console.log(`curl -X POST http://localhost:${PORT}/test/send-sms \\
  -H "Content-Type: application/json" \\
  -d '{"clipId": "YOUR_CLIP_ID", "phoneNumber": "+1234567890", "message": "Check out this audio message!"}'`);

console.log('\n# Get analytics:');
console.log(`curl http://localhost:${PORT}/test/analytics/YOUR_CLIP_ID`);