import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

import axios from 'axios';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const BACKEND_URL = process.env.PORT ? `http://localhost:${process.env.PORT}` : 'http://localhost:3001';

async function testWhisperAudioGeneration() {
  console.log('🎯 Testing Whisper Audio Generation...\n');

  try {
    // Test 1: Get sample configuration
    console.log('📋 Fetching sample configuration...');
    const configResponse = await axios.get(`${BACKEND_URL}/api/whisper-audio/samples`);
    console.log('Available categories:', Object.keys(configResponse.data));
    console.log('Total samples:', Object.values(configResponse.data).flat().length);
    console.log('');

    // Test 2: Generate single audio file
    console.log('🎵 Testing single audio generation...');
    const singleResponse = await axios.post(`${BACKEND_URL}/api/whisper-audio/generate-single`, {
      category: 'openingHooks',
      sampleId: 'hook1'
    }, {
      responseType: 'arraybuffer'
    });
    
    console.log('Single audio generated successfully');
    console.log('Size:', singleResponse.data.byteLength, 'bytes');
    console.log('Voice used:', singleResponse.headers['x-voice-used']);
    console.log('');

    // Save the test file
    const testDir = path.join(__dirname, 'test-audio');
    await fs.mkdir(testDir, { recursive: true });
    await fs.writeFile(
      path.join(testDir, 'test-single.mp3'),
      Buffer.from(singleResponse.data)
    );
    console.log('Test file saved to:', path.join(testDir, 'test-single.mp3'));
    console.log('');

    // Test 3: Generate category
    console.log('📂 Testing category generation...');
    const categoryResponse = await axios.post(`${BACKEND_URL}/api/whisper-audio/generate-category`, {
      category: 'motivational'
    });
    
    console.log('Category generation results:');
    console.log('Generated:', categoryResponse.data.generated);
    console.log('Failed:', categoryResponse.data.failed);
    
    // Save category files
    for (const result of categoryResponse.data.results) {
      if (!result.error) {
        const audioBuffer = Buffer.from(result.audioData, 'base64');
        await fs.writeFile(
          path.join(testDir, `motivational_${result.id}.mp3`),
          audioBuffer
        );
      }
    }
    console.log('');

    // Test 4: Generate all (this will take a while)
    console.log('🚀 Generating ALL audio files...');
    console.log('This will take a minute or two...\n');
    
    const allResponse = await axios.post(`${BACKEND_URL}/api/whisper-audio/generate-all`);
    
    console.log('✅ Generation Complete!');
    console.log('Summary:', allResponse.data.summary);
    console.log('\nResults by category:');
    
    for (const [category, results] of Object.entries(allResponse.data.results)) {
      const successful = results.filter(r => !r.error).length;
      const failed = results.filter(r => r.error).length;
      console.log(`  ${category}: ${successful} successful, ${failed} failed`);
    }

    // Create a manifest file with all URLs
    const manifest = {
      generated: new Date().toISOString(),
      baseUrl: `${BACKEND_URL}/audio/whisper`,
      categories: {}
    };

    for (const [category, results] of Object.entries(allResponse.data.results)) {
      manifest.categories[category] = results
        .filter(r => !r.error)
        .map(r => ({
          id: r.id,
          text: r.text,
          voice: r.voice,
          url: r.url,
          filename: r.filename
        }));
    }

    await fs.writeFile(
      path.join(__dirname, 'whisper-audio-manifest.json'),
      JSON.stringify(manifest, null, 2)
    );
    console.log('\n📄 Manifest saved to whisper-audio-manifest.json');

  } catch (error) {
    console.error('❌ Error:', error.response?.data || error.message);
    if (error.response?.status === 404) {
      console.error('\nMake sure the backend server is running and the whisper audio routes are properly registered.');
    }
  }
}

// Run the test
testWhisperAudioGeneration();