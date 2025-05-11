# Transcription Service Guide

This guide explains how to use the transcription and analysis service integrated into the backend.

## Overview

The service uses:
- **OpenAI Whisper API** for audio transcription
- **OpenRouter API** for transcription analysis

The service allows you to:
- Upload audio files for transcription
- Automatically analyze transcriptions for insights
- Get transcriptions for a specific user
- Get details of a specific transcription
- Delete transcriptions

## API Endpoints

### Upload and Transcribe Audio

**Endpoint:** `POST /api/transcribe`  
**Content-Type:** `multipart/form-data`

**Parameters:**
- `audio` (file): The audio file to transcribe
- `userId` (string): The ID of the user

**Example Request:**
```bash
curl -X POST \
  -H "x-user-id: your-user-id" \
  -F "audio=@/path/to/audio/file.mp3" \
  http://localhost:3000/api/transcribe
```

**Example Response:**
```json
{
  "success": true,
  "message": "Audio file processed successfully",
  "transcription": {
    "id": "uuid-here",
    "user_id": "your-user-id",
    "filename": "original-filename.mp3",
    "file_url": "https://your-supabase-url/storage/v1/object/public/audio_recordings/path/to/file.mp3",
    "transcription": "This is the transcribed text...",
    "duration_seconds": 120,
    "analysis": "# Key Points\n\n...",
    "created_at": "2025-05-10T22:42:59.123Z",
    "updated_at": "2025-05-10T22:43:15.456Z",
    "status": "completed",
    "error": null
  }
}
```

### Get User Transcriptions

**Endpoint:** `GET /api/transcriptions`

**Parameters:**
- `userId` (query string or header): The ID of the user

**Example Request:**
```bash
curl -X GET \
  -H "x-user-id: your-user-id" \
  http://localhost:3000/api/transcriptions
```

**Example Response:**
```json
{
  "success": true,
  "transcriptions": [
    {
      "id": "uuid-here",
      "user_id": "your-user-id",
      "filename": "original-filename.mp3",
      "file_url": "https://your-supabase-url/storage/v1/object/public/audio_recordings/path/to/file.mp3",
      "transcription": "This is the transcribed text...",
      "duration_seconds": 120,
      "analysis": "# Key Points\n\n...",
      "created_at": "2025-05-10T22:42:59.123Z",
      "updated_at": "2025-05-10T22:43:15.456Z",
      "status": "completed",
      "error": null
    },
    // More transcriptions...
  ]
}
```

### Get Transcription by ID

**Endpoint:** `GET /api/transcriptions/:id`

**Parameters:**
- `id` (path parameter): The ID of the transcription
- `userId` (query string or header): The ID of the user

**Example Request:**
```bash
curl -X GET \
  -H "x-user-id: your-user-id" \
  http://localhost:3000/api/transcriptions/uuid-here
```

**Example Response:**
```json
{
  "success": true,
  "transcription": {
    "id": "uuid-here",
    "user_id": "your-user-id",
    "filename": "original-filename.mp3",
    "file_url": "https://your-supabase-url/storage/v1/object/public/audio_recordings/path/to/file.mp3",
    "transcription": "This is the transcribed text...",
    "duration_seconds": 120,
    "analysis": "# Key Points\n\n...",
    "created_at": "2025-05-10T22:42:59.123Z",
    "updated_at": "2025-05-10T22:43:15.456Z",
    "status": "completed",
    "error": null
  }
}
```

### Delete Transcription

**Endpoint:** `DELETE /api/transcriptions/:id`

**Parameters:**
- `id` (path parameter): The ID of the transcription
- `userId` (query string or header): The ID of the user

**Example Request:**
```bash
curl -X DELETE \
  -H "x-user-id: your-user-id" \
  http://localhost:3000/api/transcriptions/uuid-here
```

**Example Response:**
```json
{
  "success": true,
  "message": "Transcription deleted successfully"
}
```

## Testing the Transcription Service

A test script is provided to verify the transcription service functionality:

```bash
# Run with a specific audio file
npm run test:transcription /path/to/audio/file.mp3

# Or place a file named test_audio.mp3 in the project root and run
npm run test:transcription
```

## Environment Variables

Make sure the following environment variables are set in your `.env` file:

```
# OpenAI Configuration (for Whisper transcription only)
OPENAI_API_KEY=your_openai_api_key

# OpenRouter Configuration (for analysis)
OPENROUTER_API_KEY=your_openrouter_api_key
OPENROUTER_MODEL=openai/gpt-3.5-turbo

# Supabase Configuration
SUPABASE_URL=your_supabase_project_url
SUPABASE_KEY=your_supabase_anon_or_service_key
SUPABASE_STORAGE_BUCKET=audio_recordings

# Frontend URLs (for CORS and OpenRouter HTTP-Referer)
FRONTEND_URL=https://repspheres.com

# File Upload Configuration
MAX_FILE_SIZE=50000000 # 50MB in bytes
ALLOWED_FILE_TYPES=audio/mpeg,audio/wav,audio/mp4,audio/webm,audio/ogg
```

You can run the environment check script to verify your configuration:

```bash
npm run check:env
```

## Database Schema

The transcription service uses the `transcriptions` table in Supabase. The schema is defined in `create_transcriptions_table.sql`.

## Pricing Information

**OpenAI Whisper API pricing (for transcription):**
- $0.006 per minute of audio (6 cents per 10 minutes)
- $0.36 per hour of audio transcription

**OpenRouter API pricing (for analysis):**
- Varies by model selected
- See [OpenRouter pricing](https://openrouter.ai/pricing) for details

## Limitations

- Maximum file size: 50MB (configurable via `MAX_FILE_SIZE` environment variable)
- Supported file types: MP3, WAV, M4A, WEBM, OGG (configurable via `ALLOWED_FILE_TYPES` environment variable)
- Free tier users are limited to 10 transcriptions (configurable in the `/user/usage` endpoint)
