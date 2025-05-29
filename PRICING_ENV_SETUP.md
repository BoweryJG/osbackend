# Pricing System Environment Variables

## Required Environment Variables

Add these to your `.env` file and Render environment variables:

```bash
# Stripe Configuration
STRIPE_SECRET_KEY=sk_live_... # or sk_test_... for testing
STRIPE_WEBHOOK_SECRET=whsec_...

# Stripe Price IDs (create these in Stripe Dashboard)
STRIPE_STARTER_PRICE_ID=price_...
STRIPE_PROFESSIONAL_PRICE_ID=price_...
STRIPE_ENTERPRISE_PRICE_ID=price_...

# Frontend URL for redirects
FRONTEND_URL=https://linguistics.repspheres.com

# Existing required variables
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_KEY=your-service-role-key
OPENAI_API_KEY=sk-... # or OPENROUTER_API_KEY
```

## Setting up Stripe Products

1. **Create Products in Stripe Dashboard:**
   - Starter Plan: $99/month
   - Professional Plan: $299/month  
   - Enterprise Plan: Custom pricing

2. **Create Price IDs for each product**

3. **Set up Webhook Endpoint:**
   - URL: `https://osbackend-zl1h.onrender.com/stripe/webhook`
   - Events: `checkout.session.completed`, `invoice.paid`, `customer.subscription.deleted`

## Database Setup

Run the SQL in `create_usage_logs_table.sql` to set up usage tracking tables.

## API Endpoints Added

- `GET /api/pricing` - Get all pricing plans
- `GET /api/subscription/:userId` - Get user subscription and usage
- `POST /api/create-checkout-session` - Create Stripe checkout session

## Usage Enforcement

The `/webhook` endpoint now:
- Checks user's monthly limits before processing
- Returns quota exceeded error (429) if limits exceeded
- Logs usage for billing tracking
- Returns usage information in response