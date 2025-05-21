import axios from 'axios';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, '.env') });

const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:3000';

async function testCheckout() {
  console.log(`Testing checkout endpoint at ${BACKEND_URL}/api/checkout`);
  try {
    const response = await axios.post(`${BACKEND_URL}/api/checkout`, { email: 'test@example.com' });
    console.log('Checkout response:', response.data);
    console.log('Test completed - check server logs for Stripe errors.');
    return true;
  } catch (err) {
    console.error('Checkout test error:', err.response ? err.response.data : err.message);
    return false;
  }
}

// Run the test
testCheckout().then(success => {
  if (success) {
    console.log('✅ Stripe checkout test executed');
  } else {
    console.error('❌ Stripe checkout test failed');
  }
});
