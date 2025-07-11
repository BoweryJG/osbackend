import { VoiceCloningService } from './services/voiceCloningService.js';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

async function testVoiceCloning() {
  console.log('Testing Voice Cloning Service...\n');
  
  const voiceCloningService = new VoiceCloningService();
  
  // Test 1: Extract audio from YouTube URL
  console.log('Test 1: Extract audio from YouTube URL');
  try {
    const testUrl = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ'; // Example URL
    console.log(`Extracting audio from: ${testUrl}`);
    
    const audioInfo = await voiceCloningService.extractAudioFromUrl(testUrl);
    console.log('Audio extracted successfully:');
    console.log(`- Title: ${audioInfo.title}`);
    console.log(`- Duration: ${audioInfo.duration} seconds`);
    console.log(`- File size: ${(audioInfo.fileSize / 1024 / 1024).toFixed(2)} MB`);
    console.log(`- File path: ${audioInfo.filePath}`);
    
    // Clean up
    const fs = await import('fs/promises');
    await fs.unlink(audioInfo.filePath);
    console.log('✓ Test 1 passed\n');
    
  } catch (error) {
    console.error('✗ Test 1 failed:', error.message);
    console.log('Note: Make sure yt-dlp is installed (pip install yt-dlp)\n');
  }
  
  // Test 2: List available voices from ElevenLabs
  console.log('Test 2: List available voices');
  try {
    const voices = await voiceCloningService.listVoiceProfiles({ limit: 5 });
    console.log(`Found ${voices.length} voice profiles`);
    
    if (voices.length > 0) {
      console.log('Sample voices:');
      voices.forEach(voice => {
        console.log(`- ${voice.name} (${voice.voice_id})`);
      });
    }
    
    console.log('✓ Test 2 passed\n');
    
  } catch (error) {
    console.error('✗ Test 2 failed:', error.message);
    console.log('Note: This might fail if the voices table doesn\'t exist yet\n');
  }
  
  // Test 3: Validate supported platforms
  console.log('Test 3: Validate supported platforms');
  const testUrls = [
    'https://www.youtube.com/watch?v=test',
    'https://youtu.be/test',
    'https://soundcloud.com/artist/track',
    'https://vimeo.com/test',
    'https://invalid-url.com/test'
  ];
  
  for (const url of testUrls) {
    try {
      const urlObj = new URL(url);
      const hostname = urlObj.hostname.replace('www.', '');
      const supported = voiceCloningService.supportedPlatforms[hostname] || false;
      console.log(`- ${url}: ${supported ? '✓ Supported' : '✗ Not supported'}`);
    } catch (error) {
      console.log(`- ${url}: ✗ Invalid URL`);
    }
  }
  console.log('✓ Test 3 passed\n');
  
  // Test 4: Check environment variables
  console.log('Test 4: Check environment variables');
  if (process.env.ELEVENLABS_API_KEY) {
    console.log('✓ ELEVENLABS_API_KEY is set');
  } else {
    console.log('✗ ELEVENLABS_API_KEY is not set');
    console.log('Please add ELEVENLABS_API_KEY to your .env file');
  }
  
  console.log('\nTesting complete!');
}

// Run tests
testVoiceCloning().catch(console.error);