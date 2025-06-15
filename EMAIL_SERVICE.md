# RepSpheres Email Service

## Overview
A powerful, unlimited email service with NO monthly fees. Send as anyone, schedule campaigns, and maintain full control.

## Features
- ✅ **Unlimited Sending** - No monthly limits
- ✅ **Multi-Account Rotation** - Avoid Gmail limits
- ✅ **Send As Client** - Appear as your client
- ✅ **Campaign Scheduling** - Week-long drip campaigns
- ✅ **MCP Integration** - AI-powered email generation
- ✅ **No Monthly Fees** - Use your own Gmail accounts

## Quick Start

### 1. Set Up Gmail App Passwords
1. Go to https://myaccount.google.com/apppasswords
2. Generate an app password for each Gmail account
3. Add to `.env`:
```env
GMAIL_EMAIL_1=your.email@gmail.com
GMAIL_APP_PASSWORD_1=your-app-password
```

### 2. Test the Service
```bash
npm run test:email
```

### 3. Run Database Migration
```bash
# In Supabase SQL editor, run:
/migrations/create_email_tables.sql
```

## API Endpoints

### Send Single Email
```javascript
POST /api/emails/send
{
  "to": "recipient@example.com",
  "subject": "Your Subject",
  "html": "<h1>Hello</h1>",
  "from": "Custom Name <custom@email.com>" // Optional
}
```

### Send As Client
```javascript
POST /api/emails/send-as-client
{
  "clientEmail": "client@theirdomain.com",
  "clientName": "John Smith",
  "recipientEmail": "prospect@example.com",
  "subject": "Following up",
  "body": "<p>Email content</p>"
}
```

### Create Campaign
```javascript
POST /api/emails/campaign
{
  "name": "7-Day Follow Up",
  "recipients": [
    {"email": "john@example.com", "name": "John"},
    {"email": "jane@example.com", "name": "Jane"}
  ],
  "subject": "{{name}}, quick question",
  "htmlTemplate": "<p>Hi {{name}}, ...</p>",
  "schedule": [
    {"sendAt": "2024-01-15T09:00:00Z", "template": "initial"},
    {"sendAt": "2024-01-17T14:00:00Z", "template": "followup1"},
    {"sendAt": "2024-01-22T10:00:00Z", "template": "followup2"}
  ]
}
```

### Bulk Send
```javascript
POST /api/emails/bulk
{
  "emails": [
    {"to": "user1@example.com", "subject": "Hello 1", "html": "<p>Content 1</p>"},
    {"to": "user2@example.com", "subject": "Hello 2", "html": "<p>Content 2</p>"}
  ],
  "delayBetween": 5000 // 5 seconds between sends
}
```

### Get Statistics
```javascript
GET /api/emails/stats

Response:
{
  "accounts": [
    {
      "email": "account1@gmail.com",
      "sentToday": 150,
      "remainingToday": 350
    }
  ],
  "totalSentToday": 150
}
```

## Advanced Features

### 1. Template Variables
Use `{{variable}}` in your templates:
```html
<p>Hi {{name}}, your {{product}} is ready!</p>
```

### 2. Campaign Scheduling
Schedule emails days or weeks apart:
```javascript
schedule: [
  {"sendAt": "2024-01-15T09:00:00Z"},
  {"sendAt": "2024-01-22T09:00:00Z"}, // 1 week later
  {"sendAt": "2024-01-29T09:00:00Z"}  // 2 weeks later
]
```

### 3. Rate Limiting
- Automatic rotation between accounts
- Built-in delays to avoid spam filters
- Daily limit tracking per account

## Scaling Options

### Current: Gmail SMTP (Free)
- 500 emails/day per account
- Add more accounts to scale

### Future: Postal Docker (Unlimited)
```bash
docker run -d postal/postal
```
- Unlimited sends
- Full control
- No external dependencies

## Troubleshooting

### Gmail Setup Issues
1. Enable 2-factor authentication
2. Generate app-specific password
3. Do NOT use regular password
4. Check spam folder for test emails

### Common Errors
- `Invalid login`: Wrong app password
- `Daily limit exceeded`: Add more accounts
- `Connection timeout`: Check firewall

## No Monthly Fees Ever
Unlike SendGrid ($20+/mo) or Mailgun ($35+/mo), this solution costs $0/month forever.