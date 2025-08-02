# MISSING ENVIRONMENT VARIABLES CAUSING DEPLOYMENT FAILURE

## CRITICAL - Add these to Render immediately:

```
ELEVENLABS_API_KEY=your_actual_key_here
SENDGRID_API_KEY=your_actual_key_here
PORT=10000
```

## IMPORTANT - Also missing:

```
FORWARD_TO_PHONE=+1234567890
SENDGRID_FROM_EMAIL=noreply@repspheres.com
METRICS_WS_PORT=8081
WS_PORT=8082
```

## Your current variables that ARE correct:
- All Supabase keys ✓
- Twilio credentials ✓
- Stripe keys ✓
- JWT_SECRET ✓
- Google OAuth ✓
- OpenAI/Anthropic keys ✓

## The crash is happening because:
1. Code tries to initialize ElevenLabs without API key
2. Code tries to use SendGrid without API key
3. Render expects app on PORT 10000

Add the missing variables above and deployment should work.