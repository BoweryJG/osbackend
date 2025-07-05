# Julie AI Voice Assistant with Kyutai Moshi Integration

Julie AI is a sophisticated real-time voice assistant for Dr. Pedro's dental practice, powered by Kyutai Moshi for ultra-low latency voice conversations.

## Features

### 1. Real-Time Voice Conversations
- **Kyutai Moshi Integration**: Sub-200ms latency for natural conversations
- **Natural Speech Processing**: Handles interruptions, overlapping speech, and natural pauses
- **Voice Activity Detection**: Intelligent detection of when patients start/stop speaking
- **Echo Cancellation**: Built-in audio processing for clear conversations

### 2. Medical Appointment Booking
- **Smart Scheduling**: Offers available appointment slots based on real-time availability
- **Information Collection**: Gathers patient name, phone, concern, and preferred times
- **Confirmation Flow**: Confirms all details before booking
- **SMS Integration**: Sends appointment confirmations automatically

### 3. Patient Question Handling
- **Service Information**: Answers questions about dental services and procedures
- **Pricing Guidance**: Provides general pricing information and insurance details
- **Office Information**: Hours, location, parking, and general inquiries
- **Procedure Explanations**: Basic information about common dental procedures

### 4. Emergency Routing
- **Emergency Detection**: Identifies keywords indicating dental emergencies
- **Severity Assessment**: Asks follow-up questions to determine urgency
- **ER Referral**: Directs severe emergencies to appropriate emergency services
- **Priority Scheduling**: Offers same-day appointments for urgent issues

### 5. Human Handoff
- **Request Detection**: Recognizes when patients want to speak with a human
- **Callback Scheduling**: Collects contact information for staff callback
- **Context Preservation**: Saves conversation history for staff review
- **5-Minute Promise**: Ensures callbacks within 5 minutes during business hours

## Technical Architecture

### Components

1. **MoshiVoiceInterface**
   - WebSocket connection to Kyutai Moshi API
   - Real-time audio streaming
   - Transcript processing
   - Voice synthesis integration

2. **ConversationContext**
   - Maintains conversation state
   - Tracks patient information
   - Manages conversation flow
   - Intent detection and routing

3. **JulieAIService**
   - Session management
   - Call logging and analytics
   - Database integration
   - Error handling and fallbacks

### API Endpoints

#### Twilio Integration
- `POST /voice/julie/incoming` - Webhook for incoming calls
- `POST /voice/julie/status` - Call status updates
- `WS /voice/julie/websocket` - WebSocket for audio streaming

#### Management APIs
- `GET /api/julie/sessions` - List active voice sessions
- `GET /api/julie/health` - Service health check

## Configuration

### Environment Variables

```env
# Moshi Voice API
MOSHI_API_URL=wss://moshi.kyutai.org/api/v1/stream
MOSHI_API_KEY=your_moshi_api_key

# AI/LLM Configuration
OPENROUTER_API_KEY=your_openrouter_key

# Database
SUPABASE_URL=your_supabase_url
SUPABASE_SERVICE_KEY=your_supabase_service_key

# Twilio (optional, for phone integration)
TWILIO_ACCOUNT_SID=your_twilio_sid
TWILIO_AUTH_TOKEN=your_twilio_token
TWILIO_PHONE_NUMBER=your_twilio_number
```

## Database Schema

### Required Tables

```sql
-- Voice calls tracking
CREATE TABLE voice_calls (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  call_sid TEXT UNIQUE,
  phone_number TEXT,
  status TEXT,
  ai_system TEXT DEFAULT 'julie_moshi',
  duration_seconds INTEGER,
  transcript JSONB,
  patient_info JSONB,
  started_at TIMESTAMP WITH TIME ZONE,
  ended_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Emergency calls
CREATE TABLE emergency_calls (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  patient_name TEXT,
  phone_number TEXT,
  concern TEXT,
  transcript JSONB,
  severity TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Callback requests
CREATE TABLE callback_requests (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  patient_name TEXT,
  phone_number TEXT,
  reason TEXT,
  requested_at TIMESTAMP WITH TIME ZONE,
  callback_completed_at TIMESTAMP WITH TIME ZONE,
  status TEXT DEFAULT 'pending',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

## Usage

### Setting up Twilio Phone Number

1. In Twilio Console, configure your phone number:
   - Voice webhook: `https://your-domain.com/voice/julie/incoming`
   - Status callback: `https://your-domain.com/voice/julie/status`
   - Method: POST for both

2. Enable Media Streams in your Twilio account

### Testing

1. **Health Check**:
   ```bash
   curl http://localhost:3001/api/julie/health
   ```

2. **View Active Sessions**:
   ```bash
   curl http://localhost:3001/api/julie/sessions
   ```

3. **Test Call**:
   - Call your configured Twilio number
   - You should hear: "Thank you for calling Dr. Pedro's office. One moment please."
   - Then Julie will greet you and start the conversation

## Conversation Examples

### Appointment Booking
```
Patient: "I need to book an appointment"
Julie: "I'd be happy to book an appointment. May I have your name please?"
Patient: "John Smith"
Julie: "Great! And what's the best phone number to reach you?"
Patient: "555-123-4567"
Julie: "What brings you in to see Dr. Pedro?"
Patient: "I have a toothache"
Julie: "I understand. When works best for you? We have tomorrow at 2 PM or Thursday at 10 AM."
Patient: "Tomorrow at 2 works"
Julie: "Perfect! Let me confirm: Tomorrow at 2 PM for a toothache. Shall I book this for you?"
Patient: "Yes"
Julie: "Wonderful! I've booked your appointment. You'll receive a text confirmation shortly."
```

### Emergency Handling
```
Patient: "I'm in severe pain and my face is swollen"
Julie: "I understand you're experiencing severe pain and swelling. Is this a severe emergency that needs immediate attention?"
Patient: "Yes, it's really bad"
Julie: "For severe swelling and pain, you may need immediate care. Would you like me to connect you with our emergency line, or should you go to the ER?"
```

### Human Request
```
Patient: "I'd like to speak to someone about insurance"
Julie: "Of course! I'll have someone from our team call you right back. We typically return calls within 5 minutes during business hours. Is 555-123-4567 the best number?"
```

## Performance Optimization

1. **Audio Processing**
   - 16kHz sample rate for optimal quality/bandwidth balance
   - PCM16 encoding for Moshi compatibility
   - Efficient audio buffering and streaming

2. **Conversation Management**
   - Context limited to last 20 messages
   - Async processing for non-blocking operations
   - Connection pooling for database queries

3. **Error Handling**
   - Graceful fallbacks for API failures
   - Automatic session cleanup
   - Detailed logging for debugging

## Monitoring and Analytics

Track these key metrics:
- Average call duration
- Successful appointment bookings
- Emergency call routing
- Human handoff requests
- API response times
- Error rates

## Security Considerations

1. **Data Protection**
   - All patient information encrypted at rest
   - Secure WebSocket connections (WSS)
   - API key rotation schedule

2. **HIPAA Compliance**
   - Minimal PHI storage
   - Audit logging for all interactions
   - Secure communication channels

3. **Access Control**
   - Service-level API keys
   - Rate limiting on endpoints
   - IP whitelisting for production

## Troubleshooting

### Common Issues

1. **"Technical difficulties" message**
   - Check MOSHI_API_KEY is set
   - Verify Moshi API endpoint is accessible
   - Check error logs for details

2. **Audio quality issues**
   - Verify network bandwidth
   - Check audio encoding settings
   - Monitor WebSocket connection stability

3. **Booking failures**
   - Verify database connection
   - Check appointment table permissions
   - Ensure SMS service is configured

### Debug Mode

Enable debug logging:
```javascript
process.env.JULIE_DEBUG = 'true'
```

This will log:
- All transcripts
- API requests/responses
- Audio processing metrics
- Session state changes