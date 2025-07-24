# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is **osbackend** - a production Node.js backend serving a unified agent system that supports Canvas and RepConnect applications with 22 specialized AI agents. The system provides voice conversations, text chat, and real-time communication capabilities across medical sales intelligence and sales representative platforms.

**Production URL**: `https://osbackend-zl1h.onrender.com`

## Development Commands

### Essential Commands

```bash
# Start development/production server
npm start

# Run specific test suites
npm run test:transcription    # Test transcription service
npm run test:webhook         # Test webhook functionality
npm run test:supabase        # Test Supabase connection
npm run test:twilio          # Test Twilio integration
npm run test:stripe          # Test Stripe checkout and webhooks
npm run test:email           # Test email service
npm run test:voice-cloning   # Test ElevenLabs voice cloning
npm run test:knowledge-bank  # Test knowledge bank service

# Environment validation
npm run check:env            # Validate environment variables
```

### Additional Test Files

```bash
# Canvas and RepConnect chat testing
node test_canvas_chat.js
node test_repconnect_chat.js

# Multi-app WebSocket testing
cd agents/websocket && node test-multiapp.js

# Specific service testing
node test_knowledge_bank.js
node test_voice_cloning.js
node test_elevenlabs.js
```

### Database Operations

```bash
# Run migrations via API
node run-migrations-via-api.js

# Run Supabase-specific migrations
node run-supabase-migrations.js

# Migration scripts for production deployment
./run-agent-center-migrations.sh
```

## Architecture Overview

### Unified Agent System (Single Source of Truth)

- **Primary Table**: `unified_agents` in Supabase project `cbopynuvhcymbumjnvay` (Sphere1a)
- **22 Total Agents**: Strategists, coaches, medical specialists, elite closers, voice representatives
- **Multi-App Support**: Agents available across Canvas, RepConnect, or Pedro via `available_in_apps[]` field
- **App-Agnostic Design**: Dynamic filtering based on application context

### Core Components Architecture

**AgentCore (`agents/core/agentCore.js`)**

- App-agnostic agent management with `appName` parameter for dynamic filtering
- Requires `appName` in constructor: `new AgentCore('canvas')` or `new AgentCore('repconnect')`
- ALWAYS queries `unified_agents` table - never legacy tables
- Built-in caching and Anthropic/Supabase integration

**WebSocket Server (`agents/websocket/server.js`)**

- Multi-app real-time chat support on `/agents-ws` path
- Supports both Canvas and RepConnect with app-specific auth
- Streaming message responses with chunked delivery
- Connection management with JWT token validation

**API Routes Structure**

- `routes/agents/agentRoutes.js` - Canvas-specific endpoints (`/api/canvas/`)
- `routes/repconnectRoutes.js` - RepConnect endpoints + full chat API (`/api/repconnect/`)
- `routes/authRoutes.js` - Authentication and user management
- `routes/healthRoutes.js` - System health and monitoring

### Database Schema (Key Tables)

**Primary Tables (USE THESE)**

```sql
unified_agents              -- Master agent table (SINGLE SOURCE OF TRUTH)
agent_voice_profiles        -- Voice configurations per agent
agent_conversation_styles   -- Chat behavior and personality
agent_conversations        -- Chat history and sessions
agent_voice_sessions       -- Voice call tracking
```

**Legacy Tables (DO NOT USE)**

```sql
canvas_ai_agents           -- ❌ Deprecated, migrated to unified_agents
sales_coach_agents         -- ❌ Deprecated, migrated to unified_agents
repconnect_agents          -- ❌ Deprecated, migrated to unified_agents
```

## Communication Architecture

### WebSocket Chat (Primary for Canvas, Available for RepConnect)

```javascript
// Canvas connection
const canvas = io('/', {
  path: '/agents-ws',
  auth: { token: 'jwt-token', appName: 'canvas' }
});

// RepConnect connection
const repconnect = io('/', {
  path: '/agents-ws',
  auth: { token: 'jwt-token', appName: 'repconnect' }
});

// Message flow
socket.emit('message', { conversationId, message, agentId });
socket.on('agent:message:chunk', data => {
  /* streaming response */
});
socket.on('agent:message:complete', data => {
  /* response complete */
});
```

### REST API Chat (RepConnect Primary)

```bash
POST /api/repconnect/chat/stream      # Server-Sent Events streaming
POST /api/repconnect/chat/message     # Standard chat messages
POST /api/repconnect/chat/conversations # Create conversation
GET  /api/repconnect/chat/conversations # List conversations
```

### Voice Integration

- **19 Voice-Enabled Agents**: ElevenLabs integration with unique voice profiles
- **Voice Sessions**: Complete tracking in `agent_voice_sessions` table
- **Whisper Support**: Real-time coaching during calls via OpenAI Whisper
- **Voice Cloning**: Custom voices for premium agents like Harvey Specter

## Environment Configuration

### Required Environment Variables

```env
# Database (Primary)
SUPABASE_URL=https://cbopynuvhcymbumjnvay.supabase.co
SUPABASE_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-key

# AI Services
ANTHROPIC_API_KEY=your-claude-key
OPENAI_API_KEY=your-openai-key
ELEVENLABS_API_KEY=your-elevenlabs-key

# Communication
TWILIO_ACCOUNT_SID=your-twilio-sid
TWILIO_AUTH_TOKEN=your-twilio-token

# Payments
STRIPE_SECRET_KEY=your-stripe-key
STRIPE_WEBHOOK_SECRET=your-webhook-secret

# Application URLs
FRONTEND_URL=https://canvas.repspheres.com
SITE_URL=https://osbackend-zl1h.onrender.com
```

### Environment Validation

Run `npm run check:env` or `node check_environment.js` to validate all required environment variables are present.

## Agent Categories and Specialties

### 🧠 Strategists (4 agents) - Canvas + RepConnect

- **Hunter**: Prospecting and lead generation specialist
- **Closer**: Deal-making and negotiation expert
- **Educator**: Teaching-focused medical procedure expert
- **Strategist**: Market intelligence and competitive analysis

### 🏆 Elite Closers (2 agents) - Canvas + RepConnect

- **Harvey Specter**: Legendary closer with maximum aggression
- **Victoria Sterling**: Elite negotiator with sophisticated approach

### 👥 Coaches (5 agents) - Mixed availability

- **Coach Alex**: Motivational sales coach (RepConnect exclusive)
- **Alexis Rivera, David Park, Marcus Chen, Sarah Mitchell**: Canvas + RepConnect

### 🩺 Medical Specialists (6 agents) - Canvas + RepConnect

- **Dr. Amanda Foster**: Aesthetic procedures specialist
- **Dr. Harvey Stern**: Surgical equipment expert
- **Dr. Lisa Martinez**: Cardiology and cardiac devices
- **Dr. Sarah Chen**: Orthopedic and spine procedures
- **Jake Thompson**: Sports medicine and rehabilitation
- **Marcus Rodriguez**: Emergency medicine and trauma

### 🎤 Voice Representatives (5 agents) - App-specific

- **Marcus, Sarah**: RepConnect exclusive voice representatives
- **Brian, Julie, Maria**: Pedro platform specialists

## Development Practices

### Agent System Development

- **ALWAYS use `unified_agents` table** - never query legacy tables directly
- **App context is critical** - AgentCore requires `appName` parameter for proper filtering
- **System prompts required** - All agents need `system_prompt` field for chat functionality
- **Voice + Chat integration** - Both Canvas and RepConnect have identical capabilities

### File Naming Conventions

- **Canvas-specific files**: Include "canvas" in filename (e.g., `test_canvas_chat.js`)
- **RepConnect-specific files**: Include "repconnect" in filename (e.g., `test_repconnect_chat.js`)
- **Shared/Universal files**: Use generic names (e.g., `agentCore.js`)

### Testing Approach

- **WebSocket testing**: Use `test-multiapp.js` in `agents/websocket/` directory
- **Chat functionality**: Separate test files for Canvas and RepConnect
- **Service testing**: Individual test files for each service (transcription, voice, email)
- **Integration testing**: Use `test_all_endpoints.js` for comprehensive API testing

## Key Services

### Knowledge Bank Service (`services/knowledgeBankService.js`)

- Medical procedure knowledge management
- Vector embeddings for intelligent content matching
- Integration with agent responses for contextual information

### Personality Engine (`services/personalityEngine.js`)

- Agent personality and behavior customization
- Dynamic response style adaptation
- Integration with conversation management

### Audio Clip Service (`services/audioClipService.js`)

- Voice message processing and storage
- ElevenLabs integration for voice synthesis
- Audio file format conversion and optimization

### WebSocket Manager (`services/websocketManager.js`)

- Multi-application WebSocket connection management
- Real-time message broadcasting
- Connection state tracking and cleanup

## Deployment and Production

### Render Deployment

- **Auto-deploy**: Connected to GitHub main branch
- **Health checks**: `GET /health` endpoint monitored
- **Environment**: All variables configured in Render dashboard
- **Scaling**: Supports multiple instances with shared database

### Production Monitoring

- **Sentry Integration**: Error tracking and performance monitoring
- **Structured Logging**: JSON-formatted logs with service identification
- **Response Time Tracking**: Built-in middleware for performance monitoring
- **Rate Limiting**: Per-user request throttling for API protection

## Common Development Tasks

### Adding New Agents

1. Insert into `unified_agents` table with appropriate `available_in_apps[]`
2. Add `system_prompt` for chat functionality
3. Optionally add voice profile in `agent_voice_profiles`
4. Add conversation style in `agent_conversation_styles` if needed

### Debugging Agent Issues

1. Verify agent exists in `unified_agents` table
2. Check `available_in_apps` contains correct app name ('canvas', 'repconnect', 'pedro')
3. Ensure `is_active = true`
4. Verify `system_prompt` is not null for chat functionality
5. Use agent test files to validate functionality

### Updating Agent Behavior

- **Chat responses**: Update `system_prompt` in `unified_agents`
- **Voice settings**: Update `voice_settings` or `agent_voice_profiles`
- **Personality**: Update `agent_conversation_styles`
- **Availability**: Modify `available_in_apps[]` array

## Migration and Database Operations

### Database Migrations

- Use `run-migrations-via-api.js` for API-based migrations
- Production migrations via `./run-agent-center-migrations.sh`
- All migrations should be compatible with unified agent system

### Data Migration Notes

- Legacy agent tables have been migrated to `unified_agents`
- System prompts migrated with 100% coverage
- Voice profiles and conversation styles preserved
- App availability matrix configured for all agents

## Security and Authentication

### Authentication Methods

- **JWT Tokens**: Supabase Auth integration for user sessions
- **Service Role Access**: Admin operations with elevated permissions
- **WebSocket Auth**: Token-based connection authentication
- **API Key Protection**: Service-to-service authentication

### Security Features

- **CORS Configuration**: Restricted origins for production safety
- **Input Validation**: Comprehensive request validation and sanitization
- **Rate Limiting**: Request throttling to prevent abuse
- **Error Handling**: Secure error responses without data leaks

## Production Fixes and Deployment History

### January 2025 - Production Lint Fixes and Deployment

**Status**: ✅ DEPLOYED - Service live at https://osbackend-zl1h.onrender.com

#### Critical Issues Resolved:

1. **ESLint Errors Reduced**: From 385 to 274 errors (29% reduction)
   - Fixed undefined variables (tempFilePath in transcription_service.js, logger in index.js)
   - Replaced process.exit() calls with proper error throwing
   - Removed unused imports (createClient, uuidv4)
   - Added underscore prefixes to unused parameters in agentCore.js

2. **Deployment Pipeline Fixes**:
   - Made husky optional for production builds (`husky || echo 'Husky not available'`)
   - Fixed template literal syntax errors in research-routes.js
   - Corrected EnvValidator import from default to named export
   - Added missing JWT_SECRET environment variable

#### Files Modified:

- `services/transcription_service.js` - Fixed undefined tempFilePath variable
- `index.js` - Added logger import, fixed EnvValidator import, replaced process.exit()
- `package.json` - Made husky gracefully fail in production
- `research-routes.js` - Fixed multiple template literal syntax errors
- `agents/core/agentCore.js` - Prefixed unused parameters with underscores

#### Environment Variables Added:

- `JWT_SECRET` - Added secure secret for token generation

#### Deployment Success:

- **Build**: Successful on Render
- **Health Check**: Passing at /health endpoint
- **Services**: All 22 agents operational
- **APIs**: All endpoints responding correctly

#### Next Recommended Actions:

- Continue reducing remaining 274 lint errors for improved code quality
- Add automated testing pipeline to catch issues before deployment
- Consider implementing pre-commit hooks once development stabilizes
