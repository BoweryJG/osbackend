# Phone System Setup Guide

## Overview

The phone system is now properly organized:
- **OSBackend** - Contains the phone infrastructure APIs (this repository)
- **RepConnect1** - AI calling app that uses the phone system
- **RepSpheres** - Parent platform that includes OSBackend

## Architecture

```
RepSpheres Ecosystem
    ├── GlobalRepSpheres (Frontend)
    ├── OSBackend (Backend + Phone APIs)
    │   └── /services/phone/ - Phone system implementation
    └── RepConnect1 (AI Calling App)
        └── Uses OSBackend phone APIs
```

## Phone System Features

1. **Phone Number Management**
   - Search and provision numbers
   - VoIP.ms and Twilio support
   - Number assignment to users

2. **Call Management**
   - Initiate outbound calls
   - Track call history
   - Recording and transcription
   - AI call summaries

3. **SMS Management**
   - Send/receive SMS
   - Conversation threading
   - Auto-responses

4. **Usage Tracking**
   - Real-time usage monitoring
   - Cost tracking
   - Billing integration

## Database

Phone system tables are in RepConnect1's Supabase (cbopynuvhcymbumjnvay):
- `phone_numbers` - Provisioned phone numbers
- `call_logs` - Call history and recordings
- `sms_messages` - SMS messages
- `sms_conversations` - SMS threads
- `phone_usage_records` - Usage tracking
- `phone_system_config` - User configurations

## API Endpoints

All phone APIs are available at `/api/phone/*`:

### Phone Numbers
- `GET /api/phone/phone-numbers` - List user's numbers
- `POST /api/phone/phone-numbers/search` - Search available numbers
- `POST /api/phone/phone-numbers/provision` - Provision a number

### Calls
- `POST /api/phone/calls/initiate` - Start a call
- `GET /api/phone/calls/:id` - Get call details
- `GET /api/phone/calls/:id/recording` - Get recording

### SMS
- `POST /api/phone/sms/send` - Send SMS
- `GET /api/phone/sms/conversations` - Get conversations

### Usage
- `GET /api/phone/usage/summary` - Usage summary
- `GET /api/phone/usage/details` - Detailed usage

### Webhooks
- `POST /api/phone/webhooks/twilio/voice` - Twilio voice webhook
- `POST /api/phone/webhooks/twilio/sms` - Twilio SMS webhook
- `POST /api/phone/webhooks/voipms/sms` - VoIP.ms webhook

## Environment Variables

Add to OSBackend `.env`:
```env
# VoIP.ms Configuration
VOIPMS_USERNAME=your_username
VOIPMS_API_PASSWORD=your_api_password

# Twilio Configuration
TWILIO_ACCOUNT_SID=your_account_sid
TWILIO_AUTH_TOKEN=your_auth_token

# Stripe (for billing)
STRIPE_SECRET_KEY=your_stripe_key

# RepConnect1 Supabase
SUPABASE_URL=https://cbopynuvhcymbumjnvay.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your_service_key
```

## RepConnect1 Integration

RepConnect1 uses the phone service through:
1. Direct Supabase queries for data
2. OSBackend APIs for actions (calls, SMS)
3. Real-time subscriptions for incoming calls/SMS

Example usage in RepConnect1:
```typescript
import { phoneService } from './services/phoneService';

// Get user's phone numbers
const numbers = await phoneService.getPhoneNumbers();

// Make a call
await phoneService.initiateCall('+1234567890', '+0987654321');

// Send SMS
await phoneService.sendSMS('+1234567890', '+0987654321', 'Hello!');
```

## Setup Steps

1. **Configure OSBackend**
   - Add environment variables
   - Deploy to Render/hosting

2. **Update RepConnect1**
   - Set `REACT_APP_OSBACKEND_URL` in environment
   - Import and use phoneService

3. **Configure Webhooks**
   - Twilio: Set webhook URLs to `https://osbackend.onrender.com/api/phone/webhooks/twilio/*`
   - VoIP.ms: Set SMS webhook to `https://osbackend.onrender.com/api/phone/webhooks/voipms/sms`

4. **Test Integration**
   - Provision a phone number
   - Make a test call
   - Send a test SMS

## Cost Structure

- VoIP.ms numbers: $0.85/month
- Calls: ~$0.009/minute
- SMS: ~$0.0075/text
- Typical client cost: $15-20/month
- Your price to client: $25-50/month
- Profit margin: $10-35/month per client