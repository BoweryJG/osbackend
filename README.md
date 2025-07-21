# 🚀 Unified Agent System - Production Backend

A comprehensive multi-application backend supporting Canvas and RepConnect with unified agent architecture, voice capabilities, and real-time chat functionality.

[![Deploy Status](https://img.shields.io/badge/deploy-live-success)](https://osbackend-zl1h.onrender.com)
[![Node.js](https://img.shields.io/badge/node-%3E%3D18.0.0-brightgreen)](https://nodejs.org)
[![License](https://img.shields.io/badge/license-Proprietary-red)](LICENSE)
[![API](https://img.shields.io/badge/API-REST%20%2B%20WebSocket-blue)](https://osbackend-zl1h.onrender.com/api-docs)

**Production URL**: `https://osbackend-zl1h.onrender.com`  
**Status**: ✅ Production Ready  
**Architecture**: Unified multi-app agent system

## 🏗️ Architecture Overview

### Unified Agent System
- **Single Source of Truth**: All agents stored in `unified_agents` table
- **Multi-App Support**: Canvas and RepConnect share the same agent infrastructure
- **App-Agnostic Design**: Dynamic filtering based on `available_in_apps` field
- **22 Specialized Agents**: Across strategists, coaches, specialists, elite closers, and voice reps

### Applications Supported
- **Canvas**: Medical sales intelligence platform with chat and voice
- **RepConnect**: Sales representative platform with chat and voice
- **Pedro**: Voice-only representatives (3 agents)

## 🎯 Key Features

### 🤖 Agent Capabilities
- **Voice Conversations**: 19 ElevenLabs-powered voice agents
- **Text Chat**: Real-time streaming chat responses
- **Specialized Knowledge**: Medical procedures, sales coaching, closing techniques
- **Personality-Driven**: Unique personalities, coaching styles, and communication approaches

### 💬 Communication Channels
- **WebSocket**: Real-time chat for Canvas and RepConnect
- **REST API**: RepConnect chat endpoints with streaming support  
- **Voice Sessions**: ElevenLabs integration for voice conversations
- **SMS/Phone**: Twilio integration for voice calls and messaging

### 🗄️ Database Architecture
```
unified_agents (Master Table)
├── Basic Info: id, name, agent_category, personality_type
├── Voice: voice_id, voice_name, voice_settings, voice_personality_notes
├── Personality: personality_profile, coaching_style, communication_style
├── Capabilities: specialties, medical_specialties, device_expertise
├── Content: system_prompt, background_story, signature_phrases
├── Availability: available_in_apps[], is_active
└── Relationships: agent_voice_profiles, agent_conversation_styles
```

## 🚀 Quick Start

### Prerequisites
- Node.js 18+
- Supabase account with unified_agents table
- Environment variables configured

### Installation
```bash
# Clone repository
git clone https://github.com/BoweryJG/osbackend.git
cd osbackend

# Install dependencies
npm install

# Configure environment variables
cp .env.example .env
# Fill in your Supabase, Twilio, OpenAI, ElevenLabs credentials

# Start development server
npm run dev

# Or start production server
npm start
```

### Environment Configuration
```env
# Core Database
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-key

# Voice Services
ELEVENLABS_API_KEY=your-elevenlabs-key
OPENAI_API_KEY=your-openai-key (for Whisper)
TWILIO_ACCOUNT_SID=your-twilio-sid
TWILIO_AUTH_TOKEN=your-twilio-token

# AI Services
ANTHROPIC_API_KEY=your-claude-key

# Application URLs
FRONTEND_URL=https://canvas.repspheres.com
SITE_URL=https://osbackend-zl1h.onrender.com
```

## 📡 API Endpoints

### Canvas Agents (`/api/canvas`)
```
GET    /agents                    # List Canvas agents
GET    /agents/:id                # Get specific agent
POST   /conversations             # Create conversation
GET    /conversations             # List conversations
POST   /conversations/:id/messages # Send message (deprecated - use WebSocket)
```

### RepConnect Agents (`/api/repconnect`)
```
GET    /agents                    # List RepConnect agents
GET    /agents/voice-enabled      # List voice-enabled agents
GET    /agents/harvey             # Get Harvey Specter specifically
GET    /agents/categories         # Get agent categories
GET    /agents/:id                # Get specific agent

# Chat Functionality (NEW)
POST   /chat/stream               # Streaming chat responses (SSE)
POST   /chat/message              # Standard chat messages
POST   /chat/conversations        # Create conversation
GET    /chat/conversations        # List conversations
GET    /chat/conversations/:id    # Get conversation details

# Voice Sessions
POST   /agents/:id/start-voice-session  # Start voice session
```

### WebSocket Chat (`/agents-ws`)
```javascript
// Canvas Connection
const canvas = io('ws://localhost:3001', {
  path: '/agents-ws',
  auth: { token: 'jwt-token', appName: 'canvas' }
});

// RepConnect Connection  
const repconnect = io('ws://localhost:3001', {
  path: '/agents-ws',
  auth: { token: 'jwt-token', appName: 'repconnect' }
});

// Events
socket.emit('message', { conversationId, message, agentId });
socket.on('agent:message:chunk', (data) => { /* streaming response */ });
socket.on('agent:message:complete', (data) => { /* response complete */ });
```

## 🎯 Agent Categories & Specialties

### 🧠 Strategists (4 agents)
- **Hunter**: Prospecting and lead generation specialist
- **Closer**: Deal-making and negotiation expert  
- **Educator**: Teaching-focused medical procedure expert
- **Strategist**: Market intelligence and competitive analysis

### 🏆 Elite Closers (2 agents)
- **Harvey Specter**: Legendary closer with maximum aggression
- **Victoria Sterling**: Elite negotiator with sophisticated approach

### 👥 Coaches (5 agents)
- **Coach Alex**: Motivational sales coach (RepConnect exclusive)
- **Alexis Rivera**: Confidence and mindset coaching
- **David Park**: Strategic sales methodology
- **Marcus Chen**: Performance optimization
- **Sarah Mitchell**: Relationship building expertise

### 🩺 Medical Specialists (6 agents)
- **Dr. Amanda Foster**: Aesthetic procedures specialist
- **Dr. Harvey Stern**: Surgical equipment expert
- **Dr. Lisa Martinez**: Cardiology and cardiac devices
- **Dr. Sarah Chen**: Orthopedic and spine procedures  
- **Jake Thompson**: Sports medicine and rehabilitation
- **Marcus Rodriguez**: Emergency medicine and trauma

### 🎤 Voice Representatives (5 agents)
- **Marcus**: Professional analytical approach (RepConnect exclusive)
- **Sarah**: Friendly empathetic communication (RepConnect exclusive)
- **Brian**: Pedro platform specialist
- **Julie**: Pedro platform specialist  
- **Maria**: Pedro platform specialist

## 🔧 Development

### Project Structure
```
osbackend/
├── agents/
│   ├── core/
│   │   ├── agentCore.js           # App-agnostic agent management
│   │   └── conversationManager.js # Chat conversation handling
│   └── websocket/
│       ├── server.js              # Multi-app WebSocket server
│       ├── test-multiapp.js       # WebSocket testing
│       └── README-multiapp.md     # WebSocket documentation
├── routes/
│   ├── agents/
│   │   └── agentRoutes.js         # Canvas agent endpoints
│   ├── repconnectRoutes.js        # RepConnect endpoints + chat
│   ├── authRoutes.js              # Authentication
│   └── dashboard.js               # Admin dashboard
├── services/
│   ├── knowledgeBankService.js    # Knowledge management
│   └── personalityEngine.js      # Agent personality system
└── migrations/
    └── *.sql                      # Database migrations
```

### Testing
```bash
# Test Canvas WebSocket chat
node test_canvas_chat.js

# Test RepConnect REST API chat  
node test_repconnect_chat.js

# Test multi-app WebSocket server
cd agents/websocket && node test-multiapp.js

# Test knowledge bank functionality
node test_knowledge_bank.js
```

### Database Migrations
```bash
# Apply database migrations
node run-migrations-via-api.js

# The unified_agents table will be created with:
# - All agent profiles and personalities
# - Voice configurations and settings
# - System prompts for chat functionality
# - App availability matrix
```

## 🎤 Voice Integration

### ElevenLabs Configuration
- **19 Voice-Enabled Agents**: Each with unique voice profiles
- **Voice Cloning**: Custom voices for Harvey Specter and other premium agents
- **Whisper Support**: Real-time coaching during calls
- **Voice Sessions**: Tracked in `agent_voice_sessions` table

### Voice Features
- **Real-time Conversation**: Low-latency voice responses
- **Personality Matching**: Voice tone matches agent personality
- **Coaching Integration**: Whisper prompts during live calls
- **Session Management**: Complete voice session tracking

## 🔐 Authentication & Security

### Authentication Methods
- **JWT Tokens**: Supabase Auth integration
- **Bearer Authentication**: API endpoint protection
- **WebSocket Auth**: Token-based WebSocket connections
- **Service Role**: Admin operations with elevated permissions

### Security Features
- **CORS Configuration**: Restricted origins for production
- **Rate Limiting**: Request throttling per user
- **Input Validation**: Comprehensive request validation
- **Error Handling**: Secure error responses without data leaks

## 📊 Monitoring & Analytics

### Logging
- **Structured Logging**: JSON-formatted logs with timestamps
- **Error Tracking**: Comprehensive error logging and tracking
- **Performance Monitoring**: Response time and throughput tracking
- **User Analytics**: Conversation and interaction analytics

### Health Checks
```
GET /health                 # Basic health status
GET /api/canvas/agents      # Canvas agents availability  
GET /api/repconnect/agents  # RepConnect agents availability
```

## 🚀 Production Deployment

### Render Configuration
- **Auto-Deploy**: Connected to GitHub main branch
- **Environment Variables**: Configured in Render dashboard
- **Health Checks**: Automatic health monitoring
- **Zero-Downtime**: Rolling deployments

### Performance Optimization
- **Agent Caching**: In-memory agent profile caching
- **Connection Pooling**: Optimized database connections
- **WebSocket Scaling**: Multi-instance WebSocket support
- **CDN Integration**: Static asset optimization

## 💰 Subscription Tiers

| Tier | Monthly | Annual | Key Features |
|------|---------|---------|--------------|
| **FREE** | $0 | $0 | Basic access, limited features |
| **EXPLORER** | $49 | $490 | 100+ procedures, 5 AI prompts/mo |
| **PROFESSIONAL** | $149 | $1,490 | 500+ procedures, 50 AI conversations |
| **GROWTH** | $349 | $3,490 | Unlimited AI, team features |
| **ENTERPRISE** | $749 | $7,490 | Custom AI training, 10 seats |
| **ELITE** | $1,499 | $14,990 | White glove service, unlimited everything |

## 🤝 Contributing

### Development Workflow
1. Fork the repository
2. Create feature branch: `git checkout -b feature/amazing-feature`
3. Make changes and test thoroughly
4. Commit: `git commit -m 'Add amazing feature'`
5. Push: `git push origin feature/amazing-feature`
6. Create Pull Request

### Code Standards
- **ESLint**: JavaScript linting and formatting
- **Error Handling**: Comprehensive try-catch blocks
- **Documentation**: JSDoc comments for functions
- **Testing**: Unit tests for new functionality

## 📞 Support

### Documentation
- **API Documentation**: Detailed endpoint documentation
- **WebSocket Guide**: Real-time communication setup
- **Agent Profiles**: Complete agent capability matrix
- **Troubleshooting**: Common issues and solutions

### Contact
- **Issues**: [GitHub Issues](https://github.com/BoweryJG/osbackend/issues)
- **Email**: support@repspheres.com
- **Documentation**: [API Docs](https://docs.repspheres.com)

## 📈 Roadmap

### Upcoming Features
- **Multi-language Support**: International agent personalities
- **Advanced Analytics**: Conversation sentiment analysis
- **Custom Agent Creation**: User-defined agent personalities
- **Integration Hub**: CRM and marketing platform integrations

### Performance Improvements
- **Redis Caching**: Enhanced caching layer
- **GraphQL API**: Advanced query capabilities  
- **Microservices**: Service decomposition for scaling
- **AI Optimization**: Enhanced response quality and speed

## 🧪 Testing Infrastructure

### Test Files Available
```bash
# Canvas WebSocket chat testing
/Users/jasonsmacbookpro2022/crm/test_canvas_chat.js

# RepConnect REST API chat testing
/Users/jasonsmacbookpro2022/crm/test_repconnect_chat.js

# Multi-app WebSocket testing
/Users/jasonsmacbookpro2022/osbackend/agents/websocket/test-multiapp.js

# Knowledge bank functionality
/Users/jasonsmacbookpro2022/osbackend/test_knowledge_bank.js
```

### Load Testing
```bash
# Install dependencies
npm install axios ws

# Run Canvas test
cd /Users/jasonsmacbookpro2022/crm
node test_canvas_chat.js

# Run RepConnect test  
node test_repconnect_chat.js
```

## 🔄 Recent Major Updates

### 🚀 Unified Agent System (Latest)
- ✅ **Single Source of Truth**: All 22 agents in unified_agents table
- ✅ **App-Agnostic Architecture**: Dynamic filtering by app context
- ✅ **RepConnect Chat**: Full REST API chat functionality added
- ✅ **Multi-App WebSocket**: Supports both Canvas and RepConnect
- ✅ **System Prompt Migration**: 100% coverage for all agents
- ✅ **Voice + Chat Integration**: Both apps have identical capabilities

---

**Built with ❤️ by the RepSpheres Team**

*Empowering sales representatives with AI-powered conversation intelligence.*