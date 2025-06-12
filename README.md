# RepSpheres Backend API (osbackend)

A comprehensive Node.js backend service powering multiple RepSpheres applications with AI capabilities, transcription services, and sales intelligence.

## 🚀 Features

### Core Services
- **Multi-LLM Support** via OpenRouter (Claude, GPT-4, Gemini, etc.)
- **Audio Transcription** with OpenAI Whisper
- **Twilio Integration** for voice/SMS capabilities
- **Stripe Payments** with subscription management
- **Supabase Database** integration
- **News Aggregation** via Brave Search API
- **Polling System** for real-time feedback
- **Module-based Access Control** for different apps
- **Usage Tracking** and billing management

### Canvas Sales Intelligence (NEW)
- **Enhanced Doctor Research** with 95% confidence scoring
- **Website Discovery & Analysis** using Brave Search and Firecrawl
- **Review Aggregation** from multiple sources
- **Competitive Analysis** of local market
- **AI-Powered Synthesis** using OpenRouter (Claude Opus 4)
- **Batch Processing** for multiple doctors
- **Real-time Progress** via SSE streaming
- **No Perplexity API Required** - uses OpenRouter for all AI features

## 📱 Applications Supported
- **Canvas** - Sales Intelligence Platform
- **Workspace** - Project Management
- **Linguistics** - Language Analysis
- **Market Insights** - Market Research
- **CRM** - Customer Relationship Management
- **MarketData** - Financial Data Analysis
- **Blog** - Content Management 

## 📋 Prerequisites

- Node.js 18+ 
- npm or yarn
- Supabase account (optional but recommended)
- API keys for various services (see Environment Variables)

## 🛠️ Installation

1. Clone the repository:
```bash
git clone https://github.com/BoweryJG/osbackend.git
cd osbackend
```

2. Install dependencies:
```bash
npm install
```

3. Configure environment variables:
```bash
cp .env.example .env
# Edit .env with your API keys
```

4. Run database migrations (if using Supabase):
```bash
# Run these SQL files in your Supabase SQL editor:
create_user_registrations_table.sql
create_subscriptions_table.sql
create_usage_logs_table.sql
create_transcriptions_table.sql
create_twilio_tables.sql
create_module_access_table.sql
create_app_data_table.sql
add_stripe_fields_to_subscriptions.sql
```

5. Start the server:
```bash
npm start
```

## 🔧 Configuration

### Required Environment Variables

```env
# Server Configuration
PORT=3000
NODE_ENV=production

# Supabase (Required for full functionality)
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_KEY=your-supabase-anon-key

# OpenRouter (Required for AI features)
OPENROUTER_API_KEY=sk-or-v1-your-key-here
OPENROUTER_MODEL=anthropic/claude-3-haiku

# Brave Search (Required for Canvas and web search)
BRAVE_API_KEY=your-brave-api-key

# OpenAI (Required for transcription)
OPENAI_API_KEY=sk-your-openai-key

# Twilio (Optional - for voice/SMS)
TWILIO_ACCOUNT_SID=your-account-sid
TWILIO_AUTH_TOKEN=your-auth-token
TWILIO_PHONE_NUMBER=+1234567890

# Stripe (Optional - for payments)
STRIPE_SECRET_KEY=sk_test_your-key
STRIPE_WEBHOOK_SECRET=whsec_your-secret
STRIPE_STARTER_PRICE_ID=price_starter
STRIPE_PROFESSIONAL_PRICE_ID=price_pro
STRIPE_ENTERPRISE_PRICE_ID=price_enterprise

# Firecrawl (Optional - for Canvas website analysis)
FIRECRAWL_API_KEY=fc-your-firecrawl-key

# Perplexity (No longer required - using OpenRouter instead)
# PERPLEXITY_API_KEY=pplx-your-key

# Frontend URLs (for CORS)
FRONTEND_URL=https://your-frontend.com
```

See `ENV_VARIABLE_GUIDE.md` for detailed setup instructions.

## 📡 API Endpoints

### Health Check
```http
GET /health
```

### Canvas Sales Intelligence 🎯

#### Start Research Job
```http
POST /api/research/start
Content-Type: application/json

{
  "doctor": {
    "displayName": "Dr. Smith",
    "npi": "1234567890",
    "specialty": "Dentistry",
    "city": "New York",
    "state": "NY",
    "organizationName": "Smith Dental"
  },
  "product": "yomi",
  "userId": "user-123"
}
```

#### Check Job Status
```http
GET /api/research/:jobId/status
```

#### Get Results
```http
GET /api/research/:jobId
```

#### Stream Progress (SSE)
```http
GET /api/research/:jobId/stream
```

#### Batch Research
```http
POST /api/research/batch
Content-Type: application/json

{
  "doctors": [...],
  "product": "yomi",
  "userId": "user-123"
}
```

### AI/LLM Operations
```http
POST /task
Content-Type: application/json

{
  "task": "Analyze this text...",
  "llm_model": "anthropic/claude-3-opus",
  "additional_input": "Context here"
}
```

### Transcription Service
```http
POST /api/transcribe
Content-Type: multipart/form-data

audio: [audio file]
userId: "user-123"
```

```http
GET /api/transcriptions?userId=user-123
GET /api/transcriptions/:id
DELETE /api/transcriptions/:id
```

### Module Access Control
```http
GET /api/modules/access?email=user@example.com&module=canvas
GET /api/modules/list?email=user@example.com
```

### Data Storage
```http
POST /api/data/:appName
GET /api/data/:appName?userId=user123
DELETE /api/data/:appName?userId=user123
```

### Subscription & Billing
```http
GET /api/pricing
GET /api/subscription/:userId
POST /api/create-checkout-session
POST /stripe/webhook (Webhook)
```

### Twilio Voice/SMS
```http
POST /api/twilio/call
POST /api/twilio/sms
GET /api/twilio/calls
GET /api/twilio/messages
POST /twilio/voice (Webhook)
POST /twilio/sms (Webhook)
```

### News & Search
```http
GET /api/brave/news?query=medical+devices
```

### Polling System
```http
POST /api/polls
GET /api/polls
GET /api/polls/:id
POST /api/polls/:id/vote
```

## 🏗️ Architecture

### Canvas Research Pipeline

1. **Doctor Search** → NPI verification
2. **Website Discovery** → Brave Search API
3. **Website Analysis** → Firecrawl scraping
4. **Review Aggregation** → Multiple sources
5. **Competitor Analysis** → Local market search
6. **AI Synthesis** → OpenRouter (Claude Opus 4)
7. **Confidence Scoring** → Multi-factor algorithm

Note: The `/api/perplexity-research` endpoint now uses OpenRouter with Brave Search context instead of requiring a separate Perplexity API key.

### Confidence Scoring Algorithm

```javascript
Base Score Components:
- NPI Verified: 35 points
- Sources Found: 2 points each (max 30)
- Website Analyzed: 15 points  
- Reviews Found: up to 10 points
- Analysis Quality: 10 points
Total: Up to 95% confidence
```

### Rate Limiting

- Canvas Research: 20 requests/minute per user
- Transcription: Based on subscription tier
- LLM Calls: Based on subscription tier

### Caching Strategy

- Research results: 3-day TTL
- News results: 1-hour TTL
- In-memory cache with LRU eviction

## 🚀 Deployment

### Render.com (Recommended)

1. Create new Web Service
2. Connect GitHub repository
3. Set environment variables
4. Deploy using `render.yaml`

### Railway

```bash
railway init
railway link
railway up
```

### Manual Server

```bash
# Install PM2
npm install -g pm2

# Start with PM2
pm2 start index.js --name "repspheres-backend"

# Save PM2 config
pm2 save
pm2 startup
```

## 🧪 Testing

### Run All Tests
```bash
npm run check:env
```

### Test Specific Services
```bash
npm run test:transcription
npm run test:twilio
npm run test:stripe
npm run test:brave
npm run test:research  # Canvas features
```

### Test Canvas Research
```bash
# Start server
npm start

# In another terminal
node test_research.js
```

Expected output:
```
✅ Health check: { status: 'healthy', ... }
📊 Starting research for: Gregory White
✅ Job started: uuid-here
📍 Progress: 25% - website - Analyzing website...
📍 Progress: 50% - reviews - Gathering reviews...
📍 Progress: 75% - competition - Analyzing competition...
📍 Progress: 100% - completed - Research complete!
✅ Research completed!
📊 Confidence Score: 87%
📍 Sources found: 23
🎯 Buying signals: 3
```

## 🤝 Frontend Integration

### Canvas (Sales Intelligence)
```javascript
const BACKEND_URL = 'https://osbackend-zl1h.onrender.com';

// Start research
const response = await fetch(`${BACKEND_URL}/api/research/start`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ doctor, product, userId })
});

// Poll for status
const status = await fetch(`${BACKEND_URL}/api/research/${jobId}/status`);
```

### CORS Allowed Origins
- https://canvas.repspheres.com
- https://workspace.repspheres.com
- https://linguistics.repspheres.com
- https://crm.repspheres.com
- https://marketdata.repspheres.com
- http://localhost:5173
- http://localhost:5176

## 📊 API Response Examples

### Research Job Response
```json
{
  "jobId": "550e8400-e29b-41d4-a716",
  "status": "completed",
  "progress": 100,
  "data": {
    "doctor": {...},
    "confidence": {
      "score": 87,
      "breakdown": {
        "npiVerified": 35,
        "sourceCount": 28,
        "websiteFound": 15,
        "reviewsFound": 9,
        "analysisQuality": 10
      }
    },
    "synthesis": {
      "executiveSummary": "Dr. White's practice shows strong growth...",
      "buyingSignals": [
        {
          "signal": "Expanding to second location",
          "evidence": "Website announcement",
          "urgency": "high",
          "relevanceToProduct": "Need for consistent tech across locations"
        }
      ],
      "painPoints": [...],
      "approachStrategy": {...},
      "actionPlan": [...]
    }
  }
}
```

## 🐛 Troubleshooting

### Common Issues

1. **"Supabase connection failed"**
   - Check SUPABASE_URL and SUPABASE_KEY
   - Service continues without Supabase features

2. **"Rate limit exceeded"**
   - Wait 1 minute before retrying
   - Implement request queuing

3. **"Research timeout"**
   - Normal research takes 30-45 seconds
   - Check API key validity

### Debug Mode
```bash
DEBUG=* npm start
```

## 📝 Documentation

- `ENV_VARIABLE_GUIDE.md` - Environment setup
- `TRANSCRIPTION_SERVICE_GUIDE.md` - Audio transcription
- `TWILIO_INTEGRATION_GUIDE.md` - Voice/SMS setup
- `PRICING_ENV_SETUP.md` - Stripe configuration
- `FRONTEND_CONNECTION_GUIDE.md` - Frontend integration

## 🔄 Version History

- **v2.1.0** - Removed Perplexity dependency, all AI features now use OpenRouter
- **v2.0.0** - Added Canvas research routes with enhanced AI
- **v1.5.0** - Pricing tiers and usage tracking
- **v1.4.0** - Twilio voice/SMS integration  
- **v1.3.0** - Stripe subscription management
- **v1.2.0** - Multi-LLM support via OpenRouter
- **v1.1.0** - Audio transcription service
- **v1.0.0** - Initial release

## 📄 License

Proprietary - RepSpheres Inc.

## 🆘 Support

- Technical Issues: Create GitHub issue
- API Questions: support@repspheres.com
- Emergency: Check status at status.repspheres.com

---

Built with ❤️ by the RepSpheres Team
