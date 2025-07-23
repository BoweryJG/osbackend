import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

import express from 'express';
import dotenv from 'dotenv';

import { ElevenLabsTTS } from './services/elevenLabsTTS.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables
dotenv.config();

const app = express();
const port = 3002;

// Initialize ElevenLabs
let tts;
try {
  tts = new ElevenLabsTTS({
    voiceId: 'nicole', // Friendly female voice
    modelId: 'eleven_turbo_v2'
  });
  console.log('ElevenLabs TTS initialized successfully');
} catch (error) {
  console.error('Failed to initialize ElevenLabs:', error);
  process.exit(1);
}

// Test endpoint to generate speech
app.get('/test-voice/:voice', async (req, res) => {
  const voiceId = req.params.voice;
  const text = req.query.text || "Hello! This is a test of the ElevenLabs text-to-speech system. How does this voice sound?";
  
  try {
    // Update voice
    tts.voiceId = tts.voices[voiceId] || voiceId;
    
    // Generate speech
    console.log(`Generating speech with voice: ${voiceId}`);
    const audioData = await tts.textToSpeech(text);
    
    // Send as audio response
    res.set({
      'Content-Type': 'audio/mpeg',
      'Content-Length': audioData.length
    });
    res.send(audioData);
    
  } catch (error) {
    console.error('Error generating speech:', error);
    res.status(500).json({ error: error.message });
  }
});

// List available voices
app.get('/voices', async (req, res) => {
  try {
    const voices = await tts.getVoices();
    res.json({
      presetVoices: Object.keys(tts.voices),
      availableVoices: voices
    });
  } catch (error) {
    console.error('Error fetching voices:', error);
    res.status(500).json({ error: error.message });
  }
});

// Home page with voice tester
app.get('/', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>ElevenLabs Voice Tester</title>
      <style>
        body { font-family: Arial, sans-serif; padding: 20px; max-width: 800px; margin: 0 auto; }
        .voice-button { margin: 5px; padding: 10px 20px; cursor: pointer; }
        #custom-text { width: 100%; padding: 10px; margin: 20px 0; }
        .status { margin: 20px 0; padding: 10px; background: #f0f0f0; }
      </style>
    </head>
    <body>
      <h1>ElevenLabs Voice Tester</h1>
      
      <div>
        <h2>Available Voices:</h2>
        <button class="voice-button" onclick="playVoice('rachel')">Rachel (Professional Female)</button>
        <button class="voice-button" onclick="playVoice('domi')">Domi (Warm Female)</button>
        <button class="voice-button" onclick="playVoice('bella')">Bella (Natural Female)</button>
        <button class="voice-button" onclick="playVoice('antoni')" style="background: #ff6b6b; color: white;">Antoni (Harvey - Professional Male)</button>
        <button class="voice-button" onclick="playVoice('elli')">Elli (Clear Female)</button>
        <button class="voice-button" onclick="playVoice('nicole')">Nicole (Friendly Female)</button>
      </div>
      
      <div style="margin-top: 20px;">
        <h3>Test Harvey-style phrases:</h3>
        <button class="voice-button" onclick="playHarveyPhrase()">Play Random Harvey Quote</button>
      </div>
      
      <div>
        <h3>Custom Text:</h3>
        <textarea id="custom-text" rows="4">Hello! This is a test of the ElevenLabs text-to-speech system. How does this voice sound?</textarea>
      </div>
      
      <div class="status" id="status">Click a voice to test</div>
      
      <audio id="audio-player" controls style="width: 100%; margin-top: 20px;"></audio>
      
      <script>
        const harveyQuotes = [
          "I don't have time for pleasantries. Show me results.",
          "Winners focus on winning. Losers focus on winners. Which are you?",
          "You want to be a shark? Stop swimming with the minnows.",
          "That was painful to watch. And I don't feel pain easily.",
          "Now that's what I call closing. You almost impressed me.",
          "Your voice is shaking. Winners don't shake, they make others shake.",
          "Never accept the first 'no'. It's just a test.",
          "ABC - Always Be Closing. Did you forget the basics?"
        ];
        
        async function playVoice(voiceId) {
          const status = document.getElementById('status');
          const audio = document.getElementById('audio-player');
          const text = document.getElementById('custom-text').value;
          
          status.textContent = \`Loading \${voiceId} voice...\`;
          
          try {
            const response = await fetch(\`/test-voice/\${voiceId}?text=\${encodeURIComponent(text)}\`);
            if (!response.ok) throw new Error('Failed to generate speech');
            
            const blob = await response.blob();
            const url = URL.createObjectURL(blob);
            audio.src = url;
            audio.play();
            
            status.textContent = \`Playing \${voiceId} voice\`;
          } catch (error) {
            status.textContent = \`Error: \${error.message}\`;
          }
        }
        
        async function playHarveyPhrase() {
          const randomQuote = harveyQuotes[Math.floor(Math.random() * harveyQuotes.length)];
          document.getElementById('custom-text').value = randomQuote;
          await playVoice('antoni');
        }
      </script>
    </body>
    </html>
  `);
});

app.listen(port, () => {
  console.log(`ElevenLabs test server running at http://localhost:${port}`);
  console.log(`Available voices: ${Object.keys(tts.voices).join(', ')}`);
});