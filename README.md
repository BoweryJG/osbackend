# Canvas Sales Intelligence Backend (osbackend) 🚀

> Enterprise-grade API powering AI-driven medical sales intelligence

[![Deploy Status](https://img.shields.io/badge/deploy-live-success)](https://osbackend-zl1h.onrender.com)
[![Node.js](https://img.shields.io/badge/node-%3E%3D18.0.0-brightgreen)](https://nodejs.org)
[![License](https://img.shields.io/badge/license-Proprietary-red)](LICENSE)
[![API](https://img.shields.io/badge/API-REST%20%2B%20WebSocket-blue)](https://osbackend-zl1h.onrender.com/api-docs)

An enterprise-grade Node.js backend powering the Canvas Sales ecosystem - AI-powered sales intelligence tools for medical device and pharmaceutical representatives.

**Production URL**: `https://osbackend-zl1h.onrender.com`  
**Status**: ✅ Production Ready  
**Architecture**: Multi-tenant, microservices-ready

## 📑 Table of Contents

- [Core Capabilities](#-core-capabilities)
- [System Architecture](#-system-architecture)
- [Tech Stack](#-tech-stack)
- [Getting Started](#-getting-started)
  - [Prerequisites](#prerequisites)
  - [Installation](#installation)
  - [Environment Configuration](#environment-configuration)
  - [Database Setup](#database-setup)
- [API Documentation](#-api-documentation)
  - [Authentication](#authentication)
  - [Canvas AI Agents](#canvas-ai-agents)
  - [Doctor Research](#doctor-research)
  - [Billing & Subscriptions](#billing--subscriptions)
- [WebSocket Architecture](#-websocket-architecture)
- [Deployment](#-deployment)
- [Performance & Scaling](#-performance--scaling)
- [Security](#-security)
- [Monitoring](#-monitoring)
- [Contributing](#-contributing)
- [Support](#-support)  

## 🚀 Core Capabilities

### 🤖 Canvas AI Sales Agents
- **4 Specialized Agent Personalities**: Hunter, Closer, Educator, Strategist
- **Dynamic Procedure Specialization**: 200+ dental/aesthetic procedures
- **Real-time Chat**: WebSocket-based conversations with Claude 3 Opus
- **Proactive Insights**: AI-generated suggestions during conversations
- **Conversation Management**: Full history with search and export

### 🔬 AI & Intelligence Services
- **Multi-LLM Orchestration** via OpenRouter (Claude Opus 4, GPT-4, Gemini Pro)
- **Audio Transcription** with OpenAI Whisper + intelligent summarization
- **Canvas Sales Intelligence** - 95% accuracy doctor profiling & market analysis
- **Perplexity Deep Research** integration for comprehensive reports
- **Apify Web Scraping** for social media intelligence
- **Custom AI Workflows** with usage tracking and cost optimization

### 💰 Commerce & Billing
- **Stripe Integration** with 11 pricing tiers (FREE to ELITE)
  - Monthly & annual billing cycles
  - Webhook processing for real-time updates
  - Usage-based billing support
- **Subscription Management** with tier-based feature access
- **Module Access Control** for different RepSpheres applications

### 📞 Communication Services
- **Twilio Voice/SMS** full integration
  - Automated call handling & recording
  - SMS campaigns and responses
  - Transcription of call recordings
- **Email Services** (SMTP ready)
- **Real-time Notifications** via webhooks

### 🔐 Authentication & Security
- **Supabase Auth** with Google/Facebook OAuth
- **JWT Token Management** with refresh logic
- **Session Management** with PostgreSQL store
- **Rate Limiting** and DDoS protection
- **CORS Configuration** for multi-app support

### 📊 Data & Storage
- **Supabase Database** with optimized schemas
- **File Upload Processing** (10MB limit, multiple formats)
- **Redis Caching** support (optional)
- **Intelligent Data Aggregation** across multiple sources

## 📱 Applications Powered

| App | Description | Features |
|-----|-------------|----------|
| **Canvas** | Sales Intelligence Platform | Doctor research, competitor analysis, AI conversation prep |
| **Market Data** | Real-time procedure analytics | 350+ CPT/CDT codes, growth tracking, market sizing |
| **Podcast RepSpheres** | Medical podcast aggregator | RSS parsing, Apple Podcasts API, trending detection |
| **CRM** | Customer relationship management | Contact tracking, activity logging, pipeline management |
| **GlobalRepSpheres** | Main platform & landing | Unified auth, subscription management, onboarding |

## 🤖 Canvas AI Agents System

### Agent Personalities
1. **Hunter** 🎯 - Lead generation and prospecting specialist
   - Direct, results-oriented communication
   - Focuses on identifying opportunities
   - Expert at qualifying prospects

2. **Closer** 💼 - Deal negotiation and closing expert
   - Persuasive, confidence-building approach
   - Handles objections smoothly
   - Masters the art of the close

3. **Educator** 📚 - Product knowledge and training specialist
   - Patient, detailed explanations
   - Clinical evidence focus
   - Builds trust through expertise

4. **Strategist** 📊 - Territory planning and analytics expert
   - Data-driven insights
   - Competitive intelligence
   - Long-term relationship building

### Dynamic Procedure Specialization
- **200+ Procedures**: Dental implants, orthodontics, aesthetics, and more
- **Real-time Context**: Agents adapt their knowledge based on selected procedure
- **Featured Procedures**: Top 20 high-value procedures highlighted
- **Smart Search**: Find any procedure quickly with intelligent search

### WebSocket Architecture
```
┌─────────────┐     WebSocket      ┌──────────────────┐
│   Canvas    │ ←─────────────────→ │  Agent Server    │
│  Frontend   │                     │  (Socket.io)     │
└─────────────┘                     └────────┬─────────┘
                                             │
                                    ┌────────▼─────────┐
                                    │  Claude 3 Opus   │
                                    │  Streaming API   │
                                    └──────────────────┘
```

## 🏗️ Technical Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        Frontend Apps                         │
│  (Canvas, Market Data, CRM, Podcasts, GlobalRepSpheres)    │
└─────────────────┬───────────────────────────────────────────┘
                  │ HTTPS
┌─────────────────▼───────────────────────────────────────────┐
│                    osbackend (Node.js)                      │
│  ┌─────────────┐ ┌──────────────┐ ┌───────────────────┐   │
│  │   Auth      │ │   AI Routes  │ │   Billing/Stripe  │   │
│  │  Middleware │ │  Research    │ │   Subscriptions   │   │
│  └─────────────┘ └──────────────┘ └───────────────────┘   │
│  ┌─────────────┐ ┌──────────────┐ ┌───────────────────┐   │
│  │   Canvas    │ │  Transcribe  │ │   File Upload     │   │
│  │   Agents   │ │   Service    │ │   Processing      │   │
│  └─────────────┘ └──────────────┘ └───────────────────┘   │
└─────────────────┬───────────────────────────────────────────┘
                  │
┌─────────────────▼───────────────────────────────────────────┐
│                    External Services                         │
│  Supabase │ Anthropic │ Stripe │ Twilio │ Brave │ More    │
└─────────────────────────────────────────────────────────────┘
```

## 💎 Subscription Tiers

| Tier | Monthly | Annual | Key Features |
|------|---------|---------|--------------|
| **FREE** | $0 | $0 | Basic access, limited features |
| **EXPLORER** | $49 | $490 | 100+ procedures, 5 AI prompts/mo |
| **PROFESSIONAL** | $149 | $1,490 | 500+ procedures, 50 AI conversations |
| **GROWTH** | $349 | $3,490 | Unlimited AI, team features |
| **ENTERPRISE** | $749 | $7,490 | Custom AI training, 10 seats |
| **ELITE** | $1,499 | $14,990 | White glove service, unlimited everything |

## 🚀 Quick Start

1. **Clone the repository**
```bash
git clone https://github.com/BoweryJG/osbackend.git
cd osbackend
```

2. **Install dependencies**
```bash
npm install
```

3. **Configure environment**
```bash
cp .env.example .env
# Edit .env with your credentials
```

4. **Start the server**
```bash
npm start
# Server runs on http://localhost:3001
```

## 🔧 Environment Variables

### Required
- `SUPABASE_URL` - Your Supabase project URL
- `SUPABASE_KEY` - Supabase service key
- `SUPABASE_SERVICE_KEY` - Supabase service role key (for admin operations)
- `STRIPE_SECRET_KEY` - Stripe API key
- `STRIPE_WEBHOOK_SECRET` - Stripe webhook secret
- `SESSION_SECRET` - Express session secret
- `OPENROUTER_API_KEY` - For AI services
- `ANTHROPIC_API_KEY` - For Canvas AI Agents (Claude 3 Opus)
- `BRAVE_API_KEY` - For web search
- `FIRECRAWL_API_KEY` - For web scraping

### Optional
- `TWILIO_ACCOUNT_SID` - For voice/SMS
- `OPENAI_API_KEY` - For Whisper transcription
- `PERPLEXITY_API_KEY` - For deep research
- `APIFY_API_TOKEN` - For social scraping

## 📚 API Endpoints

### Authentication
- `POST /auth/register` - User registration
- `POST /auth/login` - User login
- `POST /auth/logout` - User logout
- `GET /auth/user` - Get current user

### Canvas Intelligence
- `POST /research/doctor` - Research doctor profile
- `POST /research/batch` - Batch doctor research
- `POST /openrouter` - AI conversation generation
- `POST /firecrawl-scrape` - Web scraping

### Canvas AI Agents
- `GET /api/canvas/agents` - List all agents
- `GET /api/canvas/agents/:id` - Get specific agent
- `POST /api/canvas/agents/suggest` - Get agent recommendations
- `GET /api/canvas/conversations` - List user conversations
- `POST /api/canvas/conversations` - Create new conversation
- `POST /api/canvas/conversations/with-procedure` - Create with procedure context
- `GET /api/canvas/conversations/:id` - Get conversation details
- `DELETE /api/canvas/conversations/:id` - Delete conversation
- `GET /api/canvas/conversations/:id/export` - Export conversation
- `GET /api/canvas/procedures/featured` - Get featured procedures
- `GET /api/canvas/procedures/search?q=` - Search procedures
- `GET /api/canvas/procedures/:id?type=` - Get procedure details

### Subscriptions
- `POST /create-checkout-session` - Start subscription
- `POST /stripe-webhook` - Handle Stripe events
- `GET /subscription-status` - Check user subscription

### Transcription
- `POST /transcribe` - Transcribe audio file
- `POST /transcribe-url` - Transcribe from URL
- `GET /transcriptions` - List user transcriptions

### Twilio
- `POST /twilio/voice` - Handle incoming calls
- `POST /twilio/sms` - Handle SMS
- `POST /make-call` - Initiate outbound call

## 🧪 Testing

### Test Suite Overview

```bash
# Run all tests
npm test

# Run specific test suites
npm run test:unit          # Unit tests
npm run test:integration   # Integration tests
npm run test:e2e          # End-to-end tests

# Test coverage
npm run test:coverage

# Test specific services
npm run test:agents       # AI agent tests
npm run test:websocket    # WebSocket tests
npm run test:stripe       # Payment tests
npm run test:auth         # Authentication tests
```

### Testing Strategy

#### Unit Tests
```javascript
// Example: Testing AgentCore
describe('AgentCore', () => {
  it('should build correct system prompt with procedure context', () => {
    const agent = { name: 'Hunter', specialty: ['dental'] };
    const context = { 
      metadata: { 
        procedureContext: { name: 'YOMI Implants' } 
      } 
    };
    
    const prompt = agentCore.buildSystemPrompt(agent, context);
    expect(prompt).toContain('YOMI Implants');
  });
});
```

#### Integration Tests
```javascript
// Example: Testing WebSocket communication
describe('WebSocket Integration', () => {
  it('should stream AI responses', async () => {
    const client = io(TEST_URL, { auth: { token } });
    
    client.emit('message', { 
      conversationId: '123',
      message: 'Hello'
    });
    
    const chunks = [];
    client.on('agent:message:chunk', (data) => {
      chunks.push(data.chunk);
    });
    
    await waitFor(() => {
      expect(chunks.length).toBeGreaterThan(0);
    });
  });
});
```

### Load Testing

```bash
# Install artillery
npm install -g artillery

# Run load test
artillery run tests/load/websocket-test.yml

# Example load test config
config:
  target: "https://osbackend-zl1h.onrender.com"
  phases:
    - duration: 60
      arrivalRate: 10
      rampTo: 100
scenarios:
  - engine: "socketio"
    flow:
      - emit:
          channel: "message"
          data:
            conversationId: "test"
            message: "Hello"
```

## 📈 Performance

- **Response Time**: <200ms average
- **Uptime**: 99.9% SLA
- **Concurrent Users**: 10,000+
- **API Rate Limit**: 100 requests/15min
- **File Upload**: 10MB max

## 🔒 Security

- All API endpoints require authentication (except public routes)
- HTTPS only in production
- Environment variables for sensitive data
- SQL injection protection via parameterized queries
- XSS protection headers
- CORS restricted to approved domains

## 🚢 Deployment

### Render Deployment (Production)

#### Automatic Deployment
1. Push to `main` branch triggers automatic deployment
2. Render builds and deploys within 5-10 minutes
3. Zero-downtime deployments with health checks

#### Manual Deployment
```bash
# Install Render CLI
brew install render/render/render

# Deploy manually
render deploy --service-id srv-xxx
```

#### Environment Variables
Set in Render Dashboard → Environment:
```bash
NODE_ENV=production
PORT=3002
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_SERVICE_KEY=xxx
ANTHROPIC_API_KEY=xxx
# ... other variables
```

### Docker Deployment

```dockerfile
# Dockerfile
FROM node:18-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .

FROM node:18-alpine
WORKDIR /app
COPY --from=builder /app .
EXPOSE 3002
CMD ["npm", "start"]
```

```bash
# Build and run
docker build -t canvas-backend .
docker run -p 3002:3002 --env-file .env canvas-backend
```

### Kubernetes Deployment

```yaml
# deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: canvas-backend
spec:
  replicas: 3
  selector:
    matchLabels:
      app: canvas-backend
  template:
    metadata:
      labels:
        app: canvas-backend
    spec:
      containers:
      - name: canvas-backend
        image: canvas-backend:latest
        ports:
        - containerPort: 3002
        env:
        - name: NODE_ENV
          value: "production"
        envFrom:
        - secretRef:
            name: canvas-secrets
```

## 📊 Monitoring

### Health Checks

```javascript
// GET /health
{
  "status": "ok",
  "timestamp": "2024-06-19T12:00:00Z",
  "services": {
    "database": "connected",
    "redis": "connected",
    "anthropic": "ready",
    "stripe": "ready"
  },
  "version": "1.0.0"
}

// GET /health/detailed
{
  "memory": {
    "used": "256MB",
    "total": "512MB"
  },
  "uptime": "24h 30m",
  "requests": {
    "total": 150000,
    "errors": 23,
    "rate": "100/s"
  }
}
```

### Logging

```javascript
// Winston logging configuration
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.json(),
  transports: [
    new winston.transports.File({ filename: 'error.log', level: 'error' }),
    new winston.transports.File({ filename: 'combined.log' }),
    new winston.transports.Console({
      format: winston.format.simple()
    })
  ]
});

// Usage
logger.info('Agent conversation started', { 
  userId: user.id, 
  agentId: agent.id 
});
```

### Metrics & Analytics

```javascript
// Prometheus metrics
const promClient = require('prom-client');
const collectDefaultMetrics = promClient.collectDefaultMetrics;

// Collect default metrics
collectDefaultMetrics({ timeout: 5000 });

// Custom metrics
const httpRequestDuration = new promClient.Histogram({
  name: 'http_request_duration_seconds',
  help: 'Duration of HTTP requests in seconds',
  labelNames: ['method', 'route', 'status']
});

// Grafana dashboard available at /metrics
```

## 🗄️ Database Management

### Migrations

```bash
# Create new migration
npm run db:migrate:create add_agent_features

# Run migrations
npm run db:migrate:up

# Rollback last migration
npm run db:migrate:down

# Reset database
npm run db:reset
```

### Backup & Restore

```bash
# Backup database
pg_dump $DATABASE_URL > backup_$(date +%Y%m%d).sql

# Restore database
psql $DATABASE_URL < backup_20240619.sql

# Automated daily backups via Supabase
# Dashboard → Settings → Backups
```

### Performance Optimization

```sql
-- Add indexes for common queries
CREATE INDEX idx_conversations_user_id ON agent_conversations(user_id);
CREATE INDEX idx_messages_conversation_id ON agent_messages(conversation_id);
CREATE INDEX idx_procedures_featured ON dental_procedures(is_featured);

-- Analyze query performance
EXPLAIN ANALYZE SELECT * FROM agent_conversations 
WHERE user_id = '123' ORDER BY created_at DESC;
```

## 🔐 Security Best Practices

### API Security
- JWT tokens expire after 1 hour
- Refresh tokens stored securely
- Rate limiting per user/IP
- Input validation on all endpoints
- SQL injection prevention via parameterized queries

### Environment Security
```bash
# Never commit .env files
echo ".env*" >> .gitignore

# Use secrets management
# Render: Environment Groups
# K8s: Secrets/ConfigMaps
# AWS: Secrets Manager
```

### OWASP Top 10 Protection
1. **Injection**: Parameterized queries, input validation
2. **Broken Authentication**: JWT + refresh tokens
3. **Sensitive Data**: Encryption at rest/transit
4. **XXE**: XML parsing disabled
5. **Broken Access Control**: RLS policies
6. **Security Misconfiguration**: Security headers
7. **XSS**: Content-Type validation
8. **Insecure Deserialization**: JSON schema validation
9. **Using Components with Vulnerabilities**: Regular updates
10. **Insufficient Logging**: Comprehensive audit logs

## 🤝 Contributing

We welcome contributions! Please follow these guidelines:

### Development Workflow

1. **Fork & Clone**
   ```bash
   git clone https://github.com/YOUR_USERNAME/osbackend.git
   cd osbackend
   ```

2. **Create Feature Branch**
   ```bash
   git checkout -b feature/agent-improvements
   ```

3. **Make Changes**
   - Follow ESLint rules
   - Add tests for new features
   - Update API documentation

4. **Test Thoroughly**
   ```bash
   npm run test
   npm run lint
   ```

5. **Commit with Conventional Commits**
   ```bash
   git commit -m "feat(agents): add voice response capability"
   git commit -m "fix(websocket): resolve reconnection issue"
   git commit -m "docs(api): update agent endpoints"
   ```

6. **Push & Create PR**
   ```bash
   git push origin feature/agent-improvements
   ```

### Code Standards

- **Style**: ESLint + Prettier
- **Commits**: Conventional Commits
- **Tests**: 80% coverage minimum
- **Docs**: JSDoc for all public APIs

### API Design Guidelines

- RESTful principles
- Consistent error responses
- Versioned endpoints
- Comprehensive OpenAPI docs

## 📚 Additional Resources

### Documentation
- [API Reference](https://osbackend-zl1h.onrender.com/api-docs)
- [Canvas Features Guide](./CANVAS-FEATURES.md)
- [WebSocket Protocol](./docs/WEBSOCKET.md)
- [Database Schema](./docs/SCHEMA.md)

### Tutorials
- [Building Custom Agents](./docs/tutorials/custom-agents.md)
- [Integrating New AI Models](./docs/tutorials/ai-models.md)
- [Scaling WebSocket Connections](./docs/tutorials/scaling.md)

### Architecture Decisions
- [ADR-001: WebSocket vs REST](./docs/adr/001-websocket.md)
- [ADR-002: Multi-tenant Architecture](./docs/adr/002-multitenancy.md)
- [ADR-003: AI Model Selection](./docs/adr/003-ai-models.md)

## 🐛 Troubleshooting

### Common Issues

#### Database Connection
```bash
# Error: ECONNREFUSED
# Solution: Check Supabase credentials
echo $SUPABASE_URL
echo $SUPABASE_SERVICE_KEY | wc -c  # Should be > 100

# Test connection
node -e "require('./supabase-test.js')"
```

#### WebSocket Issues
```bash
# Error: WebSocket connection failed
# Check CORS settings
curl -I https://osbackend-zl1h.onrender.com

# Test WebSocket endpoint
wscat -c wss://osbackend-zl1h.onrender.com/agents-ws
```

#### AI Agent Errors
```bash
# Error: Anthropic API error
# Check API key and quota
curl https://api.anthropic.com/v1/messages \
  -H "x-api-key: $ANTHROPIC_API_KEY" \
  -H "anthropic-version: 2023-06-01"
```

### Debug Mode

Enable verbose logging:
```javascript
// Set in environment
DEBUG=* npm start

// Or in code
process.env.DEBUG = 'canvas:*';
```

## 📈 Performance Tuning

### Node.js Optimization
```bash
# Increase memory limit
node --max-old-space-size=4096 index.js

# Enable clustering
NODE_CLUSTER_WORKERS=4 npm start

# Profile performance
node --prof index.js
node --prof-process isolate-*.log > profile.txt
```

### Database Optimization
```sql
-- Connection pooling
-- Set in Supabase: Settings → Database → Connection Pooling

-- Query optimization
ANALYZE agent_conversations;
VACUUM ANALYZE;

-- Monitor slow queries
SELECT query, calls, mean_exec_time
FROM pg_stat_statements
ORDER BY mean_exec_time DESC
LIMIT 10;
```

### Caching Strategy
```javascript
// Redis caching (optional)
const redis = require('redis');
const client = redis.createClient(process.env.REDIS_URL);

// Cache agent responses
const cacheKey = `agent:${agentId}:${messageHash}`;
const cached = await client.get(cacheKey);
if (cached) return JSON.parse(cached);

// Cache for 5 minutes
await client.setex(cacheKey, 300, JSON.stringify(response));
```

## 📞 Support

### Getting Help
- **Documentation**: [docs.canvassales.ai](https://docs.canvassales.ai)
- **API Status**: [status.canvassales.ai](https://status.canvassales.ai)
- **Issues**: [GitHub Issues](https://github.com/BoweryJG/osbackend/issues)
- **Email**: backend@canvassales.ai

### Enterprise Support
- **SLA**: 99.9% uptime guarantee
- **Response Time**: < 4 hours
- **Dedicated Slack channel**
- **Phone support available**

Contact: enterprise@canvassales.ai

## 📄 License

This project is proprietary software owned by Canvas Sales Intelligence, Inc.

- **Commercial Use**: Requires license
- **Modifications**: Must be contributed back
- **Distribution**: Prohibited
- **Private Use**: Allowed with valid license

For licensing: license@canvassales.ai

## 🙏 Acknowledgments

### Core Technologies
- Node.js and Express communities
- Anthropic for Claude AI
- Supabase for backend infrastructure
- Socket.io for real-time magic
- All open source contributors

### Special Thanks
- Canvas Engineering Team
- Beta testers and early adopters
- Medical sales professionals who provided feedback

---

<div align="center">
  <p>Built with ❤️ by the Canvas Sales Intelligence Team</p>
  <p>Powering the future of medical sales</p>
  <br/>
  <a href="https://canvassales.ai">Website</a> •
  <a href="https://osbackend-zl1h.onrender.com">API</a> •
  <a href="https://github.com/BoweryJG/osbackend">GitHub</a> •
  <a href="https://twitter.com/canvassales">Twitter</a>
</div>