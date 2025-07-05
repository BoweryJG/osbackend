# Phone System Service

This directory contains the comprehensive phone system management platform for RepSpheres.

## Features

- **Multi-tenant phone management** - Manage phone systems for multiple clients
- **VoIP.ms integration** - Complete API integration for calls and SMS
- **Twilio support** - Alternative provider with full feature support
- **Usage tracking** - Real-time call and SMS usage monitoring
- **Automated billing** - Stripe integration for payment processing
- **Client management** - Full CRUD operations for client accounts

## Directory Structure

```
phone/
├── controllers/    # API controllers
├── entities/       # Database entities
├── middleware/     # Auth and error handling
├── routes/         # API routes
├── services/       # Business logic
├── types/          # TypeScript types
└── utils/          # Helper utilities
```

## Integration with RepConnect1

RepConnect1 uses this phone infrastructure through the following APIs:

1. **Phone Number Management**
   - GET /api/phone-numbers - List available numbers
   - POST /api/phone-numbers/provision - Provision new number
   
2. **Call Management**
   - POST /api/calls/initiate - Start a call
   - GET /api/calls/:id - Get call details
   - POST /api/calls/:id/recording - Get recording
   
3. **SMS Management**
   - POST /api/sms/send - Send SMS
   - GET /api/sms/conversations - Get SMS threads
   
4. **Usage Tracking**
   - GET /api/usage/summary - Get usage statistics
   - GET /api/usage/details - Detailed usage logs

## Database Tables

Uses RepConnect1's Supabase (cbopynuvhcymbumjnvay):
- phone_numbers
- call_logs
- sms_messages
- usage_records
- phone_system_config

## Environment Variables

```env
# VoIP.ms Configuration
VOIPMS_USERNAME=your_username
VOIPMS_API_PASSWORD=your_api_password

# Twilio Configuration (optional)
TWILIO_ACCOUNT_SID=your_account_sid
TWILIO_AUTH_TOKEN=your_auth_token

# Stripe Billing
STRIPE_SECRET_KEY=your_stripe_key
STRIPE_WEBHOOK_SECRET=your_webhook_secret

# RepConnect1 Supabase
SUPABASE_URL=https://cbopynuvhcymbumjnvay.supabase.co
SUPABASE_SERVICE_KEY=your_service_key
```