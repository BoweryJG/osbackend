# Audio Clip Service

A comprehensive service for generating, optimizing, and sharing short audio clips using ElevenLabs TTS, with SMS delivery via Twilio and built-in analytics.

## Features

- **Quick Audio Generation**: Generate audio clips up to 30 seconds using ElevenLabs TTS
- **Multi-Device Optimization**: Automatically optimize audio for mobile, web, and SMS delivery
- **SMS Integration**: Send audio clips via SMS using Twilio
- **Shareable URLs**: Generate unique, temporary URLs for sharing audio clips
- **HTML5 Player**: Beautiful, responsive audio player page for shared clips
- **Analytics Tracking**: Track plays, unique listeners, devices, and geographic data
- **Auto-Cleanup**: Automatic cleanup of expired clips (24-hour default expiry)
- **Multiple Audio Formats**: Support for MP3, WAV, OGG, and M4A formats
- **Embed Support**: Generate iframe embed codes for websites

## Installation

1. Install required dependencies:
```bash
npm install
```

2. Set up environment variables:
```env
ELEVENLABS_API_KEY=your_elevenlabs_api_key
TWILIO_ACCOUNT_SID=your_twilio_account_sid
TWILIO_AUTH_TOKEN=your_twilio_auth_token
TWILIO_PHONE_NUMBER=your_twilio_phone_number
SUPABASE_URL=your_supabase_url (optional)
SUPABASE_KEY=your_supabase_key (optional)
PUBLIC_URL=https://yourdomain.com
```

3. Run database migration (if using Supabase):
```bash
psql -h your_host -U your_user -d your_database -f migrations/create_audio_clips_table.sql
```

## Usage

### Basic Usage

```javascript
import { AudioClipService } from './services/audioClipService.js';

// Initialize service
const audioClipService = new AudioClipService({
  voiceId: 'nicole',      // ElevenLabs voice ID
  maxDuration: 30,        // Maximum clip duration in seconds
  clipExpiryHours: 24     // Clip expiry time
});

// Generate audio clip
const result = await audioClipService.generateClip('Hello, this is a test message!', {
  voiceId: 'nicole',
  targetDevice: 'mobile'  // Optimize for mobile
});

console.log(result.shareUrl); // https://yourdomain.com/audio-clips/uuid
```

### Express Integration

```javascript
import express from 'express';
const app = express();

// Set up audio clip routes
audioClipService.setupRoutes(app);

// Audio clips will be available at:
// GET /audio-clips/:clipId - Audio player page
// GET /audio-clips/:clipId/audio - Raw audio file
// POST /audio-clips/:clipId/analytics - Track events
```

### SMS Delivery

```javascript
// Send audio clip via SMS
const smsResult = await audioClipService.sendClipViaSMS(
  clipId,
  '+1234567890',
  'Listen to this important message:'
);
```

### Analytics

```javascript
// Track custom events
await audioClipService.trackAnalytics(clipId, {
  event: 'play',
  userAgent: req.headers['user-agent'],
  sessionId: req.sessionID
});

// Get analytics summary
const analytics = await audioClipService.getAnalytics(clipId);
console.log(analytics);
// {
//   plays: 42,
//   uniqueListeners: 28,
//   devices: { mobile: 20, web: 15, tablet: 7 },
//   locations: { 'US': 30, 'UK': 8, 'CA': 4 }
// }
```

### Embedding

```javascript
// Get embed code
const embedCode = audioClipService.getEmbedCode(clipId, {
  width: 400,
  height: 200,
  autoplay: true
});
```

## API Reference

### Constructor Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| voiceId | string | 'nicole' | ElevenLabs voice ID |
| modelId | string | 'eleven_turbo_v2' | ElevenLabs model |
| maxDuration | number | 30 | Maximum clip duration in seconds |
| clipExpiryHours | number | 24 | Hours before clip expires |
| tempDir | string | './temp/audio-clips' | Temporary storage directory |

### Methods

#### generateClip(text, options)
Generate an audio clip from text.

**Parameters:**
- `text` (string): Text to convert to speech
- `options` (object):
  - `voiceId` (string): Override default voice
  - `voiceSettings` (object): ElevenLabs voice settings
  - `targetDevice` (string): 'mobile', 'web', 'sms', or 'all'

**Returns:** Object with clipId, shareUrl, formats, and expiresAt

#### sendClipViaSMS(clipId, phoneNumber, message)
Send audio clip via SMS using Twilio.

**Parameters:**
- `clipId` (string): ID of the clip to send
- `phoneNumber` (string): Recipient phone number
- `message` (string): Optional message text

**Returns:** Object with success status and message SID

#### trackAnalytics(clipId, eventData)
Track analytics events for a clip.

**Parameters:**
- `clipId` (string): ID of the clip
- `eventData` (object): Event data including type, userAgent, etc.

#### getAnalytics(clipId)
Get analytics summary for a clip.

**Parameters:**
- `clipId` (string): ID of the clip

**Returns:** Analytics object with plays, devices, locations, etc.

## Audio Optimization Profiles

The service includes three optimization profiles:

### Mobile Profile
- Codec: AAC
- Bitrate: 64k
- Sample Rate: 22050 Hz
- Channels: Mono

### Web Profile
- Codec: MP3
- Bitrate: 128k
- Sample Rate: 44100 Hz
- Channels: Stereo

### SMS Profile
- Codec: MP3
- Bitrate: 32k
- Sample Rate: 16000 Hz
- Channels: Mono

## Database Schema

If using Supabase, the service stores clip metadata in the `audio_clips` table:

```sql
CREATE TABLE audio_clips (
    id UUID PRIMARY KEY,
    text TEXT NOT NULL,
    voice VARCHAR(50) NOT NULL,
    formats JSONB NOT NULL,
    share_url TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    analytics JSONB,
    metadata JSONB
);
```

## Testing

Run the test server:

```bash
node test_audio_clip_service.js
```

Test endpoints:
- `POST /test/generate-clip` - Generate a test clip
- `POST /test/send-sms` - Send clip via SMS
- `GET /test/analytics/:clipId` - Get analytics

## Best Practices

1. **Text Length**: Keep messages under 150 words for optimal duration
2. **Voice Selection**: Choose appropriate voices for your use case
3. **Cleanup**: The service automatically cleans up expired clips
4. **Analytics**: Use analytics to track engagement and optimize content
5. **Security**: Clips expire after 24 hours by default for security
6. **Performance**: Use the cache effectively to reduce API calls

## Error Handling

The service includes comprehensive error handling:

```javascript
try {
  const clip = await audioClipService.generateClip(text);
} catch (error) {
  if (error.message.includes('Text too long')) {
    // Handle duration limit
  } else if (error.message.includes('not found')) {
    // Handle missing clip
  } else {
    // Handle other errors
  }
}
```

## Limitations

- Maximum clip duration: 30 seconds (configurable)
- Clips expire after 24 hours (configurable)
- Requires active ElevenLabs and Twilio accounts
- Audio files are stored temporarily on disk

## Future Enhancements

- [ ] Support for multiple languages
- [ ] Voice cloning integration
- [ ] Real-time streaming generation
- [ ] Advanced audio effects
- [ ] Webhook notifications
- [ ] S3/cloud storage integration
- [ ] Batch clip generation
- [ ] A/B testing for voices