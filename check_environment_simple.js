import path from 'path';
import { fileURLToPath } from 'url';

import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, '.env') });

console.log('=== Simple Environment Check ===');
console.log(`✅ OPENAI_API_KEY: ${process.env.OPENAI_API_KEY ? 'Set' : 'Missing'}`);
console.log(`✅ ANTHROPIC_API_KEY: ${process.env.ANTHROPIC_API_KEY ? 'Set' : 'Missing'}`);
console.log(`✅ SUPABASE_URL: ${process.env.SUPABASE_URL ? 'Set' : 'Missing'}`);
console.log(`✅ SUPABASE_KEY: ${process.env.SUPABASE_KEY ? 'Set' : 'Missing'}`);
console.log(`✅ ELEVENLABS_API_KEY: ${process.env.ELEVENLABS_API_KEY ? 'Set' : 'Missing'}`);

console.log('\n=== Server Syntax Check ===');
console.log('Checking if the server starts without errors...');