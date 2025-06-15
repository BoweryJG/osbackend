# RepSpheres Unlimited Email System

## Current Setup
- **3 Gmail Accounts**: 1,500 emails/day (once you add app password for account #3)
- **Postal Server**: UNLIMITED emails/day (optional)
- **Total Capacity**: UNLIMITED!

## Your Accounts
1. `jgolden@bowerycreativeagency.com` - ✅ Active (500/day)
2. `yjasonwilliamgolden@gmail.com` - ✅ Active (500/day)  
3. `jasonwilliamgolden@gmail.com` - ⚠️ Need app password (500/day)

## Quick Setup for Account #3
1. Go to https://myaccount.google.com/apppasswords
2. Sign in to `jasonwilliamgolden@gmail.com`
3. Generate app password
4. Update `.env` with the password

## Postal Docker Setup (UNLIMITED)

### Option 1: Quick Setup (Recommended)
```bash
# Run the setup script
./setup-postal.sh
```

### Option 2: Manual Setup
```bash
# Start Postal
docker-compose up -d

# Visit http://localhost:5000
# Login: admin@repspheres.com / RepSpheres2024!

# In Postal Web UI:
1. Create organization "RepSpheres"
2. Add mail server
3. Get API key
4. Update .env:
   POSTAL_HOST=localhost
   POSTAL_PORT=25
   POSTAL_API_KEY=your-key-here
```

## API Usage Examples

### Send via Specific Method
```javascript
// Force using Postal (unlimited)
POST /api/emails/send
{
  "to": "user@example.com",
  "subject": "Test",
  "html": "<p>Content</p>",
  "preferPostal": true
}

// Use Gmail rotation (default)
POST /api/emails/send
{
  "to": "user@example.com",
  "subject": "Test",
  "html": "<p>Content</p>"
}
```

### Bulk Campaign (Auto-uses Postal if available)
```javascript
POST /api/emails/bulk
{
  "emails": [...1000 emails...],
  "delayBetween": 3000
}
```

## Capacity Summary
- **Without Postal**: 1,500 emails/day
- **With Postal**: UNLIMITED emails/day
- **Cost**: $0/month forever

## Smart Routing
The system automatically:
- Uses Gmail for transactional emails (better deliverability)
- Uses Postal for bulk campaigns (unlimited volume)
- Rotates Gmail accounts to maximize daily capacity
- Tracks usage per account

## Production Deployment
When deploying to Render:
1. Gmail accounts work immediately
2. For Postal, you'd need a VPS or dedicated server
3. Or use Gmail only (1,500/day is plenty for most use cases)

## Troubleshooting
- **Gmail auth failed**: Regenerate app password
- **Postal not connecting**: Check Docker is running
- **Daily limit hit**: Add more Gmail accounts or enable Postal