# Production Deployment Checklist for osbackend

**Service URL**: https://osbackend-zl1h.onrender.com  
**Status**: 🟢 LIVE (Auto-deploy enabled)

## 🚨 Critical Issues to Fix

### 1. Database Connection
- **Issue**: `relation "public.users" does not exist`
- **Action**: Check if using correct Supabase project and schema
- **Fix**: Ensure SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY point to correct project

### 2. Missing/Invalid API Keys
- **ANTHROPIC_API_KEY**: Returns 404 (check if valid)
- **FIRECRAWL_API_KEY**: Returns 404 (check if valid)
- **BRAVE_SEARCH_API_KEY**: Not configured
- **ELEVENLABS_API_KEY**: Has fallback mode but should be added

## ✅ Working Features
- ✅ Service is live and responding
- ✅ Health endpoints working
- ✅ Auto-deploy restored
- ✅ WebSocket on single port (/ws)
- ✅ Database pool configured
- ✅ Stripe integration working
- ✅ Process error handlers preventing crashes

## 📋 Environment Variables Required

### Core Database
```
SUPABASE_URL=https://cbopynuvhcymbumjnvay.supabase.co
SUPABASE_KEY=<anon-key>
SUPABASE_SERVICE_ROLE_KEY=<service-key>
```

### AI Services
```
ANTHROPIC_API_KEY=<your-key>
OPENAI_API_KEY=<your-key>
ELEVENLABS_API_KEY=<your-key>
```

### Communication
```
TWILIO_ACCOUNT_SID=<your-sid>
TWILIO_AUTH_TOKEN=<your-token>
```

### Payments
```
STRIPE_SECRET_KEY=<your-key>
STRIPE_WEBHOOK_SECRET=<your-secret>
```

### Search/Research
```
BRAVE_SEARCH_API_KEY=<your-key>
FIRECRAWL_API_KEY=<your-key>
PERPLEXITY_API_KEY=<your-key>
```

### Application
```
FRONTEND_URL=https://canvas.repspheres.com
SITE_URL=https://osbackend-zl1h.onrender.com
JWT_SECRET=<secure-secret>
PORT=10000
```

## 🔍 Production Verification Steps

1. **Check all environment variables are set in Render dashboard**
2. **Test authentication flow**:
   ```bash
   # Test signup
   curl -X POST https://osbackend-zl1h.onrender.com/api/auth/signup \
     -H "Content-Type: application/json" \
     -d '{"email":"test@example.com","password":"testpass123"}'
   ```

3. **Test WebSocket connection**:
   ```bash
   node test-websocket-live.js
   ```

4. **Verify RepX tiers**:
   ```bash
   curl https://osbackend-zl1h.onrender.com/api/stripe/repx/plans
   ```

5. **Monitor Render logs for exit code 7 errors**

## 🚀 Next Steps

1. Add missing environment variables in Render dashboard
2. Verify Supabase project URL is correct
3. Test all agent endpoints
4. Monitor error logs for 24 hours
5. Set up monitoring alerts

## 📊 Monitoring

- **Health Check**: https://osbackend-zl1h.onrender.com/health
- **Detailed Health**: https://osbackend-zl1h.onrender.com/api/health
- **Dependencies**: https://osbackend-zl1h.onrender.com/health/dependencies
- **Render Dashboard**: https://dashboard.render.com/web/srv-d08hp4re5dus73eih7v0