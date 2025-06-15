# 🚀 RepSpheres Email System - Complete Documentation

## Overview
A powerful, unlimited email system with ZERO monthly fees. Send 2,500+ emails/day immediately, or unlimited with Docker Postal.

## ✅ Current Setup

### Email Accounts
1. **jgolden@bowerycreativeagency.com** - Google Workspace (2,000/day)
2. **jasonwilliamgolden@gmail.com** - Gmail (500/day)
3. **Postal Docker** (Optional) - UNLIMITED

**Total Capacity: 2,500 emails/day (or unlimited with Postal)**

### RepSpheres Domain
- **Catch-all forwarding**: ANY@repspheres.com → jgolden@bowerycreativeagency.com
- **20+ professional aliases** configured in the system
- **Send as any @repspheres.com address** from Gmail

## 📧 API Endpoints

### Send Single Email
```bash
POST /api/emails/send
{
  "to": "doctor@hospital.com",
  "subject": "Canvas AI Analysis Ready",
  "html": "<h1>Your Analysis</h1>",
  "from": "jason@repspheres.com"  # Optional - defaults to RepSpheres
}
```

### Send as Client
```bash
POST /api/emails/send-as-client
{
  "clientEmail": "dr.smith@clinic.com",
  "clientName": "Dr. Smith",
  "recipientEmail": "patient@example.com",
  "subject": "Follow-up from our meeting",
  "body": "<p>Email content</p>"
}
```

### Create Campaign
```bash
POST /api/emails/campaign
{
  "name": "7-Day Medical Device Follow-up",
  "recipients": [
    {"email": "doctor1@hospital.com", "name": "Dr. Johnson"},
    {"email": "doctor2@clinic.com", "name": "Dr. Smith"}
  ],
  "subject": "{{name}}, Canvas AI insights for your practice",
  "htmlTemplate": "<p>Hi {{name}}, here are your insights...</p>",
  "schedule": [
    {"sendAt": "2024-01-15T09:00:00Z"},
    {"sendAt": "2024-01-22T09:00:00Z"},
    {"sendAt": "2024-01-29T09:00:00Z"}
  ]
}
```

### Bulk Send
```bash
POST /api/emails/bulk
{
  "emails": [
    {"to": "doc1@example.com", "subject": "Canvas Demo", "html": "<p>Content</p>"},
    {"to": "doc2@example.com", "subject": "Canvas Demo", "html": "<p>Content</p>"}
  ],
  "delayBetween": 5000  # 5 seconds between sends
}
```

### Get Statistics
```bash
GET /api/emails/stats

Response:
{
  "accounts": [
    {"email": "jgolden@bowerycreativeagency.com", "sentToday": 42, "remainingToday": 1958},
    {"email": "jasonwilliamgolden@gmail.com", "sentToday": 0, "remainingToday": 500}
  ],
  "totalSentToday": 42,
  "totalDailyCapacity": 2500
}
```

## 🎯 Using RepSpheres Email Aliases

### Available Aliases
The system includes 20+ professional aliases:

```javascript
import { repspheresEmails } from './services/repspheresEmails.js';

// Leadership
await sendEmail({
  from: repspheresEmails.getFromAddress('jgolden'),  // jason@repspheres.com
  from: repspheresEmails.getFromAddress('sarah'),    // sarah@repspheres.com
});

// Departments
await sendEmail({
  from: repspheresEmails.getFromAddress('support'),  // support@repspheres.com
  from: repspheresEmails.getFromAddress('sales'),    // sales@repspheres.com
  from: repspheresEmails.getFromAddress('canvas'),   // canvas@repspheres.com
});
```

### Full Alias List
- **Leadership**: jgolden@, jason@, sarah@, scarlett@
- **Departments**: support@, sales@, success@, partnerships@
- **Products**: canvas@, ai@
- **General**: hello@, info@, team@
- **Automated**: noreply@, demo@, onboarding@, billing@, careers@, press@

## 🐳 Postal Docker (Unlimited Emails)

### Quick Setup
```bash
# Run the setup script
./setup-postal.sh

# Or manually:
docker-compose up -d

# Access web UI: http://localhost:5000
# Login: admin@repspheres.com / RepSpheres2024!
```

### Enable in .env
```env
POSTAL_HOST=localhost
POSTAL_PORT=25
POSTAL_API_KEY=your-postal-api-key
```

## 🧪 Testing

### Test Basic Email Service
```bash
npm run test:email
```

### Test RepSpheres Aliases
```bash
node test_repspheres_emails.js
```

### Test Specific Endpoint
```bash
curl -X POST http://localhost:3001/api/emails/test \
  -H "Content-Type: application/json" \
  -d '{"email": "your-test@example.com"}'
```

## 🗄️ Database Setup

Run the migration in Supabase SQL editor:
```sql
-- Creates tables for:
-- email_logs (track all emails)
-- email_campaigns (manage campaigns)
-- email_templates (reusable templates)

-- Run: /migrations/create_email_tables.sql
```

## 🔧 Environment Variables

### Required
```env
# Gmail Accounts (already configured)
GMAIL_EMAIL_1=jgolden@bowerycreativeagency.com
GMAIL_APP_PASSWORD_1=udyt jdfa huqe bicx
GMAIL_EMAIL_2=jasonwilliamgolden@gmail.com
GMAIL_APP_PASSWORD_2=smom nvay ojrr xnnj

# Add more accounts:
# GMAIL_EMAIL_3=another@gmail.com
# GMAIL_APP_PASSWORD_3=xxxx xxxx xxxx xxxx
```

### Optional (Postal)
```env
POSTAL_HOST=localhost
POSTAL_PORT=25
POSTAL_API_KEY=your-key
```

## 📈 Scaling Guide

### Current: 2,500 emails/day
- Bowery Creative: 2,000/day
- Personal Gmail: 500/day

### To Scale:
1. **Add Gmail accounts** (+500/day each)
2. **Add Google Workspace** (+2,000/day each)
3. **Enable Postal** (UNLIMITED)

## 🎯 Smart Features

### Automatic Account Rotation
- Switches between accounts to maximize daily limits
- Tracks usage per account
- Prevents hitting limits

### Campaign Scheduling
- Multi-day drip campaigns
- Personalized templates with {{variables}}
- Automatic delays between sends

### Send as Anyone
- Appear as any email address
- Client email spoofing (legitimate use)
- Full control over headers

## 💰 Cost Comparison

### Your Setup: $0/month
- Gmail: FREE
- Postal: FREE (self-hosted)
- ForwardEmail: FREE

### Competitors:
- SendGrid: $20-100/month
- Mailgun: $35-80/month
- Amazon SES: Pay per email
- Mailchimp: $50-300/month

## 🚨 Troubleshooting

### Email Not Sending
1. Check app passwords are correct (16 characters)
2. Verify 2FA is enabled on Gmail accounts
3. Run `npm run test:email` to debug

### Daily Limit Hit
1. Add more Gmail accounts
2. Enable Postal for unlimited
3. Check stats: `GET /api/emails/stats`

### Emails Going to Spam
1. Warm up new accounts gradually
2. Use Gmail for important emails
3. Use Postal for bulk campaigns

## 🛡️ Security Notes

- App passwords are stored in .env (gitignored)
- Never commit real passwords
- Use environment variables on production
- All emails are logged in database

## 🚀 Production Deployment

On Render:
1. Add all environment variables
2. Gmail accounts work immediately
3. Postal requires VPS (optional)

## 📞 Support

- Email issues: Check `/api/emails/stats`
- View logs: Check Supabase email_logs table
- Test emails: Use `/api/emails/test` endpoint

---

Built for RepSpheres - AI-Powered Sales Intelligence for Medical Device Reps
No monthly fees. Total control. Unlimited potential.