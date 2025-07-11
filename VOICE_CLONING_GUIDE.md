# Voice Cloning Service Guide

This guide explains how to use the voice cloning service that integrates with ElevenLabs API to create custom voice profiles from YouTube and SoundCloud URLs.

## Prerequisites

1. **ElevenLabs API Key**: Add your API key to `.env`:
   ```
   ELEVENLABS_API_KEY=your_api_key_here
   ```

2. **Install yt-dlp**: Run the installation script:
   ```bash
   ./scripts/install-yt-dlp.sh
   ```
   Or install manually:
   ```bash
   pip install yt-dlp
   ```

3. **Install ffmpeg**: Required for audio processing
   - macOS: `brew install ffmpeg`
   - Ubuntu/Debian: `sudo apt-get install ffmpeg`
   - CentOS/RHEL: `sudo yum install ffmpeg`

4. **Run database migration**: Create the voices table:
   ```sql
   -- Run in Supabase SQL Editor
   -- File: migrations/create_voices_table.sql
   ```

## API Endpoints

### 1. Clone Voice from URL
```bash
POST /api/voice-cloning/clone-from-url
Authorization: Bearer <token>

{
  "url": "https://www.youtube.com/watch?v=...",
  "name": "My Custom Voice",
  "description": "Voice cloned from YouTube video",
  "labels": {
    "accent": "american",
    "gender": "male"
  }
}
```

### 2. Clone Voice from Files
```bash
POST /api/voice-cloning/clone-from-files
Authorization: Bearer <token>
Content-Type: multipart/form-data

audioFiles: [file1.mp3, file2.mp3]
name: "My Custom Voice"
description: "Voice created from audio samples"
labels: {"accent": "british", "gender": "female"}
```

### 3. List Voice Profiles
```bash
GET /api/voice-cloning/voices
Authorization: Bearer <token>
```

### 4. Get Voice Profile
```bash
GET /api/voice-cloning/voices/{voiceId}
Authorization: Bearer <token>
```

### 5. Update Voice Settings
```bash
PUT /api/voice-cloning/voices/{voiceId}/settings
Authorization: Bearer <token>

{
  "settings": {
    "stability": 0.5,
    "similarity_boost": 0.75,
    "style": 0.0,
    "use_speaker_boost": true
  }
}
```

### 6. Delete Voice Profile
```bash
DELETE /api/voice-cloning/voices/{voiceId}
Authorization: Bearer <token>
```

### 7. Extract Audio Info (Preview)
```bash
POST /api/voice-cloning/extract-audio
Authorization: Bearer <token>

{
  "url": "https://soundcloud.com/..."
}
```

## Usage Examples

### JavaScript/Node.js Example
```javascript
import axios from 'axios';

const API_BASE = 'http://localhost:3333/api/voice-cloning';
const AUTH_TOKEN = 'your_auth_token';

// Clone voice from YouTube
async function cloneFromYouTube() {
  try {
    const response = await axios.post(
      `${API_BASE}/clone-from-url`,
      {
        url: 'https://www.youtube.com/watch?v=example',
        name: 'Speaker Name',
        description: 'Professional speaker voice'
      },
      {
        headers: {
          'Authorization': `Bearer ${AUTH_TOKEN}`
        }
      }
    );
    
    console.log('Voice cloned:', response.data.voice);
  } catch (error) {
    console.error('Error:', error.response.data);
  }
}
```

### cURL Example
```bash
# Clone voice from SoundCloud
curl -X POST http://localhost:3333/api/voice-cloning/clone-from-url \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://soundcloud.com/artist/track",
    "name": "Artist Voice",
    "description": "Voice from SoundCloud track"
  }'
```

## Voice Settings

When creating or updating a voice, you can customize these settings:

- **stability** (0.0-1.0): Voice consistency. Lower = more variation
- **similarity_boost** (0.0-1.0): How closely to match original. Higher = more similar
- **style** (0.0-1.0): Style exaggeration. Higher = more expressive
- **use_speaker_boost**: Enhance speaker characteristics (true/false)

## Supported Platforms

- YouTube (youtube.com, youtu.be)
- SoundCloud (soundcloud.com, m.soundcloud.com)

## Error Handling

Common errors and solutions:

1. **"yt-dlp not found"**: Install yt-dlp using the installation script
2. **"Insufficient credits"**: Upgrade your ElevenLabs plan for voice cloning
3. **"File too large"**: Maximum file size is 50MB
4. **"Unsupported platform"**: Only YouTube and SoundCloud are supported

## Best Practices

1. **Audio Quality**: Use high-quality source audio for best results
2. **Audio Length**: Provide at least 1 minute of clear speech
3. **Single Speaker**: Ensure audio contains only one speaker
4. **Clean Audio**: Avoid background music or noise
5. **Cache Usage**: Voice profiles are cached for 1 hour to reduce API calls

## Testing

Run the test script to verify everything is working:

```bash
node test_voice_cloning.js
```

## Integration with TTS

Once a voice is cloned, use it with the ElevenLabs TTS service:

```javascript
import ElevenLabsTTS from './services/elevenLabsTTS.js';

const tts = new ElevenLabsTTS({
  voiceId: 'your_cloned_voice_id'
});

const audio = await tts.textToSpeech('Hello, this is my cloned voice!');
```

## Cleanup

The service automatically cleans up temporary files older than 24 hours. To manually clean:

```javascript
await voiceCloningService.cleanupTempFiles(24); // Clean files older than 24 hours
```