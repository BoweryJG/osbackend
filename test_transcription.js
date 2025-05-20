import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { transcribeAudio, analyzeTranscription } from './transcription_service.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables
dotenv.config({ path: path.resolve(__dirname, '.env') });

async function runTest() {
  const audioPath = process.argv[2] || path.resolve(__dirname, 'test_audio.mp3');

  if (!fs.existsSync(audioPath)) {
    console.error('❌ Audio file not found. Provide a path or place test_audio.mp3 in the project root.');
    return false;
  }

  try {
    console.log('=== Testing Transcription Service ===');
    console.log(`Transcribing file: ${audioPath}`);

    const transcription = await transcribeAudio(audioPath);
    console.log('\n✅ Transcription successful!');
    console.log(transcription.text);

    if (process.env.OPENROUTER_API_KEY) {
      console.log('\nAnalyzing transcription with OpenRouter...');
      const analysis = await analyzeTranscription(transcription.text);
      console.log('\n✅ Analysis successful!');
      console.log(analysis);
    } else {
      console.log('\n⚠️ OPENROUTER_API_KEY not set. Skipping analysis.');
    }

    return true;
  } catch (err) {
    console.error('❌ Error during transcription test:', err.message);
    return false;
  }
}

runTest().then(success => {
  if (success) {
    console.log('\n✅ Transcription test completed successfully!');
  } else {
    console.error('\n❌ Transcription test failed.');
    process.exit(1);
  }
});
