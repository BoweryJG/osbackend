import path from 'path';
import { fileURLToPath } from 'url';
import readline from 'readline';

import twilio from 'twilio';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables
dotenv.config({ path: path.resolve(__dirname, '.env') });

async function testRealCall() {
  console.log('📞 Testing Real Call with Transcription...\n');

  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const fromNumber = process.env.TWILIO_PHONE_NUMBER;

  if (!accountSid || !authToken || !fromNumber) {
    console.error('❌ Missing Twilio credentials');
    return;
  }

  const client = twilio(accountSid, authToken);

  // Your phone number to receive the test call
  const toNumber = '+19172834051'; // Replace with your number

  try {
    console.log('🔄 Creating test call...');
    console.log(`From: ${fromNumber}`);
    console.log(`To: ${toNumber}\n`);

    const call = await client.calls.create({
      url: 'http://demo.twilio.com/docs/voice.xml', // Twilio demo that plays a message
      to: toNumber,
      from: fromNumber,
      record: true,
      statusCallback: 'https://osbackend.app.n8n.cloud/webhook/twilio-status',
      statusCallbackEvent: ['initiated', 'ringing', 'answered', 'completed'],
      // Stream the audio to our transcription service
      stream: {
        url: 'wss://osbackend.app.n8n.cloud/api/media-stream',
        track: 'both_tracks'
      }
    });

    console.log('✅ Call created successfully!');
    console.log(`Call SID: ${call.sid}`);
    console.log(`Status: ${call.status}`);
    console.log('\n📱 Please answer the phone when it rings!');
    console.log('🎤 The call will be transcribed in real-time.\n');

    // Monitor the call status
    let checkCount = 0;
    const checkInterval = setInterval(async () => {
      try {
        const updatedCall = await client.calls(call.sid).fetch();
        console.log(`📊 Call status: ${updatedCall.status}`);

        if (updatedCall.status === 'completed' || updatedCall.status === 'failed' || updatedCall.status === 'no-answer') {
          clearInterval(checkInterval);
          console.log('\n✅ Call test completed!');
          
          if (updatedCall.status === 'completed') {
            console.log('💬 Check the RepConnect interface to see the transcription!');
          }
        }

        checkCount++;
        if (checkCount > 60) { // Stop after 1 minute
          clearInterval(checkInterval);
          console.log('\n⏱️ Test timeout reached');
        }
      } catch (error) {
        console.error('Error checking call status:', error.message);
      }
    }, 1000);

  } catch (error) {
    console.error('❌ Error creating call:', error.message);
  }
}

// Instructions for manual testing
console.log('🧪 Manual Test Instructions:\n');
console.log('1. Make sure the backend server is running (npm start)');
console.log('2. Open RepConnect in your browser (http://localhost:3000)');
console.log('3. Log in and go to the Contacts page');
console.log('4. Click on a contact and press the Call button');
console.log('5. The call will be connected through Twilio');
console.log('6. Speak into the phone - you should see real-time transcription!');
console.log('7. The transcription will show sentiment analysis (positive/neutral/negative)\n');

console.log('Alternatively, this script will make a test call to demonstrate transcription.\n');

// Ask if they want to make a test call

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

rl.question('Do you want to make a test call now? (y/n): ', (answer) => {
  if (answer.toLowerCase() === 'y') {
    testRealCall();
  } else {
    console.log('\n👍 You can test manually using RepConnect!');
    process.exit(0);
  }
  rl.close();
});