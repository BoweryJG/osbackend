# Amazon SES Setup Guide for RepSpheres

## Overview
RepSpheres now uses Amazon SES for all email sending, replacing SendGrid and Vultr/Postal. This provides:
- **70% cost savings** ($0.10 per 1000 emails vs SendGrid's $0.30)
- **Better deliverability** (Amazon's infrastructure)
- **Unified billing** (all on AWS)
- **No server maintenance** (vs Postal)

## Cost by Tier
- **RepX0**: No email access
- **RepX1**: 100 emails/month = $0.01/month
- **RepX2**: 500 emails/month = $0.05/month  
- **RepX3**: 2,000 emails/month = $0.20/month
- **RepX4**: Unlimited = Pay as you go
- **RepX5**: Unlimited + White label = Pay as you go

## Setup Steps

### 1. Create AWS Account
1. Go to [aws.amazon.com](https://aws.amazon.com)
2. Create account or sign in
3. Go to SES service in console

### 2. Get Out of Sandbox Mode
By default, SES starts in sandbox mode (can only email verified addresses).

1. In SES Console, go to "Account dashboard"
2. Click "Request production access"
3. Fill out the form:
   - **Use case**: Transactional emails for SaaS platform
   - **Website**: https://repspheres.com
   - **Email type**: Transactional
   - **How you handle bounces**: Automated via SES notifications
   - **How you get email addresses**: User registration with double opt-in

Usually approved within 24 hours.

### 3. Verify Your Domain
1. In SES Console, go to "Verified identities"
2. Click "Create identity"
3. Choose "Domain"
4. Enter: `repspheres.com`
5. Add the DNS records shown to your domain:
   ```
   TXT _amazonses.repspheres.com "verification-token-here"
   ```

### 4. Set Up DKIM (Better Deliverability)
1. In domain settings, click "DKIM"
2. Choose "Easy DKIM"
3. Add the 3 CNAME records to your DNS

### 5. Create IAM User for API Access
1. Go to IAM Console
2. Create new user: `repspheres-ses`
3. Attach policy: `AmazonSESFullAccess`
4. Create access key
5. Save credentials for .env

### 6. Environment Variables
Add to your `.env` file:
```env
# AWS SES
AWS_ACCESS_KEY_ID=AKIAIOSFODNN7EXAMPLE
AWS_SECRET_ACCESS_KEY=wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY
AWS_REGION=us-east-1
SES_FROM_EMAIL=noreply@repspheres.com
ADMIN_EMAIL=jason@repspheres.com
```

### 7. Run Database Migration
```bash
# In Supabase SQL editor, run:
migrations/20250731_create_email_logs.sql
```

### 8. Update Render Environment
Add the same AWS variables to your Render service.

## Testing

1. Run test script:
```bash
node test_ses_email.js
```

2. Test via API:
```bash
curl -X POST https://osbackend-zl1h.onrender.com/api/repx/email/test \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json"
```

## API Endpoints

### Send Email
```javascript
POST /api/repx/email/send
{
  "to": "user@example.com",
  "subject": "Hello",
  "html": "<h1>Hello World</h1>",
  "tags": { "campaign": "welcome" }
}
```

### Bulk Email (RepX4+ only)
```javascript
POST /api/repx/email/send-bulk
{
  "template": "welcome-email",
  "recipients": [
    { "email": "user1@example.com", "data": { "name": "John" } },
    { "email": "user2@example.com", "data": { "name": "Jane" } }
  ]
}
```

### Check Quota
```javascript
GET /api/repx/email/quota
// Returns: { tier: "repx1", limit: 100, remaining: 87, sent: 13 }
```

### Get Statistics
```javascript
GET /api/repx/email/stats
// Returns usage, costs, bounce rates, etc.
```

## Frontend Integration

```javascript
// Send email
const response = await fetch('/api/repx/email/send', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    to: 'customer@example.com',
    subject: 'Your Report',
    html: emailHTML
  })
});

// Check if quota exceeded
if (!response.ok) {
  const error = await response.json();
  if (error.message.includes('limit reached')) {
    // Show upgrade prompt
  }
}
```

## Monitoring

1. **AWS CloudWatch**: Automatic metrics for bounces, complaints
2. **Supabase Tables**: 
   - `user_email_usage` - Monthly quotas
   - `email_send_logs` - All sent emails
3. **Cost Tracking**: Built into API responses

## Troubleshooting

### "MessageRejected" Error
- Still in sandbox mode
- Email address not verified
- Domain not verified

### "Throttling" Error  
- Sending too fast
- SES has sending rate limits (start at 1 email/sec)

### High Bounce Rate
- Check CloudWatch metrics
- Review email_send_logs for patterns
- Implement double opt-in

## Migration from SendGrid

All existing code that calls `/api/repx/email/*` endpoints will continue working. The backend now uses SES instead of SendGrid/Vultr transparently.