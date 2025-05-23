# Twilio Integration Guide

This guide explains how to set up and use the Twilio integration in your backend.

## Overview

The Twilio integration provides the following features:
- **Voice Calls**: Handle incoming/outgoing calls with automatic recording
- **SMS Messages**: Send and receive SMS messages
- **Call Recording**: Automatic transcription and analysis of call recordings
- **History Tracking**: Store and retrieve call/SMS history
- **Webhook Support**: Handle Twilio callbacks for real-time updates

## Setup Instructions

### 1. Environment Variables

Add the following to your `.env` file:

```env
# Twilio Configuration
TWILIO_ACCOUNT_SID=your_twilio_account_sid
TWILIO_AUTH_TOKEN=your_twilio_auth_token
TWILIO_PHONE_NUMBER=+18454090692
TWILIO_PHONE_NUMBER_SID=PN8d691d0762f6c7ffbdf3ca4269aa2b91
```

To get your Twilio credentials:
1. Log in to your [Twilio Console](https://console.twilio.com)
2. Find your Account SID and Auth Token on the dashboard
3. Your phone number SID is already provided: `PN8d691d0762f6c7ffbdf3ca4269aa2b91`

### 2. Database Setup

Run the SQL scripts to create the necessary tables. **Important**: Run them in this order:

```bash
# 1. First create the transcriptions table (required dependency)
psql -h your-supabase-host -U postgres -d postgres -f create_transcriptions_table.sql

# 2. Then create the Twilio tables
psql -h your-supabase-host -U postgres -d postgres -f create_twilio_tables.sql
```

Or run the SQL manually in your Supabase SQL editor in this order:
1. `create_transcriptions_table.sql` - Required for storing call transcriptions
2. `create_twilio_tables.sql` - Twilio-specific tables

### 3. Configure Twilio Webhooks

In your Twilio Console, configure your phone number's webhooks:

1. Go to Phone Numbers > Manage > Active Numbers
2. Click on your phone number (+18454090692)
3. Configure the webhooks:
   - **Voice & Fax**:
     - When a call comes in: `https://osbackend-zl1h.onrender.com/api/twilio/voice` (HTTP POST)
     - Call status callback: `https://osbackend-zl1h.onrender.com/api/twilio/status` (HTTP POST)
   - **Messaging**:
     - When a message comes in: `https://osbackend-zl1h.onrender.com/api/twilio/sms` (HTTP POST)

### 4. Deploy Changes

Since your backend is on Render, the changes will deploy automatically when you push to your repository.

## API Endpoints

### Voice Endpoints

#### Make an Outbound Call
```http
POST /api/twilio/make-call
Content-Type: application/json

{
  "to": "+1234567890",
  "message": "Hello, this is a test call",
  "record": true,
  "userId": "user-123",
  "metadata": {
    "campaign": "sales-outreach"
  }
}
```

#### Get Call History
```http
GET /api/twilio/calls?phoneNumber=+18454090692&limit=50
```

### SMS Endpoints

#### Send SMS
```http
POST /api/twilio/send-sms
Content-Type: application/json

{
  "to": "+1234567890",
  "body": "Hello from RepSpheres!",
  "userId": "user-123",
  "metadata": {
    "campaign": "follow-up"
  }
}
```

#### Get SMS History
```http
GET /api/twilio/sms?phoneNumber=+18454090692&limit=50
```

### Webhook Endpoints (Called by Twilio)

- `POST /api/twilio/voice` - Handles incoming voice calls
- `POST /api/twilio/sms` - Handles incoming SMS messages
- `POST /api/twilio/status` - Receives call status updates
- `POST /api/twilio/recording` - Handles recording completion
- `POST /api/twilio/recording-status` - Processes recording status updates

## Features

### Automatic Call Recording & Transcription

When a call is recorded:
1. The recording is automatically downloaded
2. Transcribed using OpenAI Whisper
3. Analyzed using your configured LLM
4. Stored in the `transcriptions` table with the analysis

### SMS Auto-Response

Incoming SMS messages receive an automatic response. You can customize this in the `/api/twilio/sms` endpoint.

### Call Flow

For incoming calls:
1. Caller hears a greeting message
2. Call is recorded after the beep
3. Recording is processed and transcribed
4. Analysis is generated and stored

## Testing

### Run Integration Tests

```bash
# Test the integration (without making actual calls)
npm run test:twilio

# For production testing
BACKEND_URL=https://osbackend-zl1h.onrender.com node test_twilio.js
```

### Manual Testing

1. **Test Incoming Call**: Call +1 (845) 409-0692
2. **Test Incoming SMS**: Send a text to +1 (845) 409-0692
3. **Test Outbound**: Use the API endpoints or uncomment test functions

## Database Schema

### twilio_calls
- Stores all call records (incoming/outgoing)
- Links to transcriptions when recordings are processed
- Tracks call duration, status, and metadata

### twilio_sms
- Stores all SMS messages (incoming/outgoing)
- Tracks message status and delivery information

### twilio_recordings
- Links recordings to calls
- Tracks processing status
- References transcription records

## Monitoring

### Check Logs

Monitor your Render logs for:
- Incoming webhook requests
- Recording processing status
- Transcription completion
- Any errors or issues

### Database Queries

```sql
-- Recent calls
SELECT * FROM twilio_calls 
ORDER BY created_at DESC 
LIMIT 10;

-- Calls with transcriptions
SELECT c.*, t.transcription, t.analysis 
FROM twilio_calls c
JOIN transcriptions t ON c.transcription_id = t.id
ORDER BY c.created_at DESC;

-- SMS history
SELECT * FROM twilio_sms 
ORDER BY created_at DESC 
LIMIT 10;
```

## Troubleshooting

### Common Issues

1. **Webhooks not working**
   - Verify webhook URLs in Twilio console
   - Check Render logs for incoming requests
   - Ensure TWILIO_AUTH_TOKEN is set correctly

2. **Recordings not processing**
   - Check OpenAI API key is configured
   - Verify Supabase connection
   - Look for errors in Render logs

3. **Database errors**
   - Ensure tables are created
   - Check Supabase connection string
   - Verify table permissions

### Debug Mode

For local development, webhooks won't have signature validation. Use ngrok to test webhooks locally:

```bash
# Install ngrok
npm install -g ngrok

# Start your local server
npm start

# In another terminal, expose your local server
ngrok http 3000

# Use the ngrok URL for Twilio webhooks
```

## Security Notes

1. **Webhook Validation**: Production webhooks validate Twilio signatures
2. **Phone Number Privacy**: Store only necessary phone data
3. **Recording Storage**: Recordings are processed and not stored long-term
4. **Access Control**: Implement user-based access to call/SMS history

## Next Steps

1. **Custom Greeting**: Modify the voice response in `generateVoiceResponse()`
2. **SMS Bot**: Implement intelligent SMS responses based on message content
3. **Call Routing**: Add IVR menus or call forwarding
4. **Analytics**: Build dashboards for call/SMS metrics
5. **Notifications**: Send alerts for important calls or messages

## Support

For issues or questions:
1. Check Render logs for errors
2. Verify Twilio webhook configuration
3. Test with the provided test script
4. Check database for recorded data
