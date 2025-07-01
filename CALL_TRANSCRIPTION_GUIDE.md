# Call Transcription Service Guide

This guide explains how to use the real-time call transcription service in the osbackend project.

## Overview

The Call Transcription Service provides real-time transcription capabilities for Twilio calls using WebSocket connections. It integrates with:
- Twilio Media Streams for real-time audio processing
- OpenAI Whisper for speech-to-text conversion
- Socket.io for broadcasting transcription updates to connected clients
- Supabase for storing transcription data

## Architecture

### Components

1. **CallTranscriptionService** (`/services/callTranscriptionService.js`)
   - Manages active transcription sessions
   - Handles Twilio Media Stream WebSocket connections
   - Processes audio chunks and sends to OpenAI Whisper
   - Broadcasts updates via Socket.io

2. **REST API Routes** (`/routes/callTranscription.js`)
   - Start/stop transcription for calls
   - Retrieve transcription data
   - Query transcription history

3. **WebSocket Endpoints**
   - `/call-transcription-ws` - Socket.io namespace for client connections
   - `/api/media-stream` - WebSocket endpoint for Twilio Media Streams

## Database Schema

The service uses the `call_transcriptions` table:

```sql
call_transcriptions
- id (UUID, primary key)
- call_sid (VARCHAR, foreign key to twilio_calls)
- status (VARCHAR) - 'pending', 'active', 'completed', 'failed'
- transcription (TEXT) - Full transcription text
- partial_transcriptions (JSONB) - Array of partial transcription objects
- metadata (JSONB) - Additional metadata
- started_at, ended_at (TIMESTAMP)
- duration_seconds (INTEGER)
```

## API Endpoints

### REST API

#### Start Transcription
```http
POST /api/calls/:callSid/transcription/start
Authorization: Bearer <token>

Body:
{
  "metadata": {
    "customField": "value"
  }
}

Response:
{
  "success": true,
  "message": "Transcription started",
  "transcription": {
    "callSid": "CA...",
    "status": "active",
    "startTime": "2024-01-01T00:00:00Z"
  }
}
```

#### Get Transcription
```http
GET /api/calls/:callSid/transcription?includePartial=true
Authorization: Bearer <token>

Response:
{
  "success": true,
  "transcription": {
    "callSid": "CA...",
    "status": "active",
    "text": "Current transcription text...",
    "startTime": "2024-01-01T00:00:00Z",
    "partialTranscriptions": [...],
    "isLive": true
  }
}
```

#### Stop Transcription
```http
POST /api/calls/:callSid/transcription/stop
Authorization: Bearer <token>

Response:
{
  "success": true,
  "message": "Transcription stopped",
  "transcription": {
    "callSid": "CA...",
    "status": "completed",
    "endTime": "2024-01-01T00:05:00Z"
  }
}
```

#### Get Active Transcriptions (Admin Only)
```http
GET /api/transcriptions/active
Authorization: Bearer <admin-token>

Response:
{
  "success": true,
  "transcriptions": [...],
  "count": 5
}
```

#### Get Transcription History
```http
GET /api/transcriptions?limit=20&offset=0&status=completed
Authorization: Bearer <token>

Response:
{
  "success": true,
  "transcriptions": [...],
  "pagination": {
    "limit": 20,
    "offset": 0,
    "total": 150
  }
}
```

### WebSocket API

#### Client Connection (Socket.io)

```javascript
// Connect to the transcription namespace
const socket = io('/call-transcription-ws', {
  auth: {
    token: 'your-jwt-token'
  }
});

// Subscribe to a specific call
socket.emit('subscribe:call', 'CA...');

// Listen for transcription updates
socket.on('transcription:update', (data) => {
  console.log('New transcription:', data);
  // data = {
  //   callSid: 'CA...',
  //   transcription: 'Full text...',
  //   latest: 'Latest chunk...',
  //   timestamp: '2024-01-01T00:00:00Z'
  // }
});

// Listen for transcription start
socket.on('transcription:started', (data) => {
  console.log('Transcription started:', data);
});

// Listen for transcription completion
socket.on('transcription:completed', (data) => {
  console.log('Transcription completed:', data);
});

// Handle errors
socket.on('transcription:error', (data) => {
  console.error('Transcription error:', data);
});

// Unsubscribe from a call
socket.emit('unsubscribe:call', 'CA...');
```

## Twilio Configuration

To enable real-time transcription, configure your Twilio phone number or TwiML app to stream audio:

### TwiML Example
```xml
<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Start>
    <Stream url="wss://your-domain.com/api/media-stream" />
  </Start>
  <Say>This call is being transcribed.</Say>
  <!-- Your regular call flow here -->
</Response>
```

### Programmatic Setup
```javascript
const response = new twilio.twiml.VoiceResponse();
const start = response.start();
start.stream({
  url: 'wss://your-domain.com/api/media-stream'
});
response.say('This call is being transcribed.');
```

## Environment Variables

Required environment variables:

```env
# OpenAI or OpenRouter API key for Whisper
OPENAI_API_KEY=sk-...
# OR
OPENROUTER_API_KEY=sk-or-...

# Supabase configuration
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_KEY=your-service-key

# Twilio configuration
TWILIO_ACCOUNT_SID=AC...
TWILIO_AUTH_TOKEN=...
```

## Implementation Notes

### Audio Processing
- Twilio streams audio in μ-law format at 8kHz
- The service converts μ-law to PCM before transcription
- Audio is processed in 5-second chunks to balance latency and accuracy

### Scalability Considerations
- Each active transcription maintains an in-memory session
- Consider implementing Redis for session storage in production
- Audio processing is CPU-intensive; consider worker processes for large scale

### Security
- All REST endpoints require authentication
- WebSocket connections validate JWT tokens
- Call ownership is verified before allowing transcription access
- Admin role required for viewing all active transcriptions

## Example Client Implementation

```javascript
// Example React component for real-time transcription display
import { useEffect, useState } from 'react';
import io from 'socket.io-client';

function CallTranscription({ callSid, authToken }) {
  const [transcription, setTranscription] = useState('');
  const [status, setStatus] = useState('inactive');
  
  useEffect(() => {
    const socket = io('/call-transcription-ws', {
      auth: { token: authToken }
    });
    
    socket.emit('subscribe:call', callSid);
    
    socket.on('transcription:current', (data) => {
      setTranscription(data.transcription);
      setStatus(data.status);
    });
    
    socket.on('transcription:update', (data) => {
      setTranscription(data.transcription);
    });
    
    socket.on('transcription:completed', (data) => {
      setStatus('completed');
    });
    
    return () => {
      socket.emit('unsubscribe:call', callSid);
      socket.disconnect();
    };
  }, [callSid, authToken]);
  
  return (
    <div>
      <h3>Call Transcription ({status})</h3>
      <div>{transcription}</div>
    </div>
  );
}
```

## Troubleshooting

### Common Issues

1. **No transcription appearing**
   - Check OpenAI/OpenRouter API key is configured
   - Verify Twilio Media Stream URL is correct
   - Check WebSocket connection in browser console

2. **WebSocket connection fails**
   - Ensure JWT token is valid
   - Check CORS configuration
   - Verify WebSocket path is correct

3. **Audio quality issues**
   - Twilio streams at 8kHz which may affect accuracy
   - Consider implementing noise reduction
   - Adjust transcription chunk size

### Debug Logging

Enable debug logging by setting:
```env
DEBUG=call-transcription:*
```

## Future Enhancements

1. **Real-time translation** - Translate transcriptions to other languages
2. **Speaker diarization** - Identify different speakers in the call
3. **Sentiment analysis** - Analyze emotional tone in real-time
4. **Keyword detection** - Alert on specific keywords or phrases
5. **Audio recording** - Store audio alongside transcriptions
6. **Batch processing** - Process multiple calls simultaneously