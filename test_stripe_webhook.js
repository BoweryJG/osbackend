import axios from 'axios';
import dotenv from 'dotenv';
import crypto from 'crypto';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, '.env') });

const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:3000';
const secret = process.env.STRIPE_WEBHOOK_SECRET || 'whsec_test';

function sign(payload, secret) {
  const header = Buffer.from(JSON.stringify({ t: Math.floor(Date.now()/1000), v1: crypto.createHmac('sha256', secret).update(payload).digest('hex') })).toString();
  return header;
}

async function testWebhook() {
  const event = { type: 'invoice.paid', data: { object: { id: 'sub_test', customer: 'cus_test', customer_email: 'test@example.com', subscription: 'sub_test' } } };
  const payload = JSON.stringify(event);
  const signature = sign(payload, secret);
  try {
    const response = await axios.post(`${BACKEND_URL}/stripe/webhook`, payload, {
      headers: {
        'Content-Type': 'application/json',
        'Stripe-Signature': signature
      }
    });
    console.log('Webhook response:', response.data);
    return true;
  } catch (err) {
    console.error('Webhook test error:', err.response ? err.response.data : err.message);
    return false;
  }
}

testWebhook().then(success => {
  if (success) {
    console.log('✅ Stripe webhook test executed');
  } else {
    console.error('❌ Stripe webhook test failed');
  }
});
