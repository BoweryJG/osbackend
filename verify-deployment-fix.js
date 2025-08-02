#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log('=== DEPLOYMENT FIX VERIFICATION ===');
console.log(`Current time: ${new Date().toISOString()}`);
console.log();

// Check if the fixes are in place

// Check audioClipService.js
console.log('1. Checking audioClipService.js for lazy initialization...');
const audioClipService = fs.readFileSync(path.join(__dirname, 'services/audioClipService.js'), 'utf8');
if (audioClipService.includes('export const audioClipService = new Proxy')) {
  console.log('✅ audioClipService.js has lazy initialization');
} else {
  console.log('❌ audioClipService.js missing lazy initialization');
}

// Check voiceCloning routes
console.log('\n2. Checking voiceCloning.js routes...');
const voiceCloning = fs.readFileSync(path.join(__dirname, 'routes/voiceCloning.js'), 'utf8');
if (voiceCloning.includes('function getVoiceCloningService()')) {
  console.log('✅ voiceCloning.js has lazy initialization');
} else {
  console.log('❌ voiceCloning.js missing lazy initialization');
}

// Check dashboard routes
console.log('\n3. Checking dashboard.js routes...');
const dashboard = fs.readFileSync(path.join(__dirname, 'routes/dashboard.js'), 'utf8');
if (dashboard.includes('function getVoiceCloningService()')) {
  console.log('✅ dashboard.js has lazy initialization');
} else {
  console.log('❌ dashboard.js missing lazy initialization');
}

console.log('\n=== VERIFICATION COMPLETE ===');
console.log('\nIf all checks pass, the deployment should work.');
console.log('Make sure these environment variables are set in Render:');
console.log('- PORT=10000');
console.log('- ELEVENLABS_API_KEY');
console.log('- SENDGRID_API_KEY');