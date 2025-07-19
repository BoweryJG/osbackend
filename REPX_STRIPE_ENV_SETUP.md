# RepX Stripe Environment Variables Setup

## Overview
This guide explains how to set up the Stripe environment variables for the new RepX Enhancement Levels pricing structure (RepX1-RepX5).

## Required Environment Variables

You need to create Stripe Price IDs for each RepX tier in both monthly and annual billing cycles, then set these environment variables:

### RepX1 - Professional Business Line ($39/month, $390/year)
```bash
STRIPE_REPX1_MONTHLY_PRICE_ID=price_1234567890abcdef  # $39.00/month
STRIPE_REPX1_ANNUAL_PRICE_ID=price_0987654321fedcba   # $390.00/year
```

### RepX2 - Email Integration ($97/month, $970/year)
```bash
STRIPE_REPX2_MONTHLY_PRICE_ID=price_2345678901bcdef0  # $97.00/month
STRIPE_REPX2_ANNUAL_PRICE_ID=price_8765432109edcba9   # $970.00/year
```

### RepX3 - Canvas Intelligence ($197/month, $1970/year)
```bash
STRIPE_REPX3_MONTHLY_PRICE_ID=price_3456789012cdef01  # $197.00/month
STRIPE_REPX3_ANNUAL_PRICE_ID=price_7654321098dcba98   # $1970.00/year
```

### RepX4 - AI Coaching ($397/month, $3970/year)
```bash
STRIPE_REPX4_MONTHLY_PRICE_ID=price_4567890123def012  # $397.00/month
STRIPE_REPX4_ANNUAL_PRICE_ID=price_6543210987cba987   # $3970.00/year
```

### RepX5 - Real-time AI Whisper ($697/month, $6970/year)
```bash
STRIPE_REPX5_MONTHLY_PRICE_ID=price_5678901234ef0123  # $697.00/month
STRIPE_REPX5_ANNUAL_PRICE_ID=price_5432109876ba9876   # $6970.00/year
```

## Stripe Dashboard Setup

1. **Log into Stripe Dashboard**
   - Go to https://dashboard.stripe.com
   - Select your account/workspace

2. **Create Products**
   For each RepX tier, create a product:
   - Name: "RepX1 - Professional Business Line" (etc.)
   - Description: Include the features for each tier
   - Statement descriptor: "REPSPHERES REPX1" (etc.)

3. **Create Price IDs**
   For each product, create two prices:
   - Monthly recurring: Amount in cents (3900 for $39.00)
   - Annual recurring: Amount in cents (39000 for $390.00)
   - Currency: USD
   - Billing period: Monthly or Yearly

4. **Copy Price IDs**
   Copy the generated price IDs (they start with `price_`) and set them as environment variables

## Environment Variable Setup

### For Render.com Deployment
1. Go to your service dashboard
2. Navigate to Environment tab
3. Add each environment variable with its corresponding Stripe Price ID

### For Local Development
Add to your `.env` file:
```bash
# RepX Stripe Price IDs
STRIPE_REPX1_MONTHLY_PRICE_ID=price_your_actual_price_id
STRIPE_REPX1_ANNUAL_PRICE_ID=price_your_actual_price_id
# ... (continue for all tiers)
```

## Testing

### Test Endpoint
```bash
curl -X GET https://osbackend-zl1h.onrender.com/api/stripe/pricing
```

### Test Checkout Session Creation
```bash
curl -X POST https://osbackend-zl1h.onrender.com/api/stripe/create-checkout-session \
  -H "Content-Type: application/json" \
  -d '{
    "tier": "repx2",
    "billingCycle": "monthly",
    "customerEmail": "test@example.com"
  }'
```

## Production Checklist

- [ ] All 10 Price IDs created in Stripe Dashboard
- [ ] Environment variables set in Render.com
- [ ] Test checkout session creation
- [ ] Test subscription lookup
- [ ] Verify webhook endpoints are working
- [ ] Update frontend with actual Price IDs
- [ ] Test end-to-end subscription flow

## Frontend Integration

The frontend Subscribe.tsx component expects these price IDs to be returned from:
```
GET /api/stripe/pricing
```

Or you can hardcode them in the frontend pricing configuration if preferred.

## Webhook Configuration

Make sure your Stripe webhook endpoint is configured to send events to:
```
https://osbackend-zl1h.onrender.com/stripe/webhook
```

Required events:
- `checkout.session.completed`
- `invoice.paid`
- `invoice.payment_failed`
- `customer.subscription.deleted`

## Notes

- Price IDs are immutable once created
- If you need to change prices, create new Price IDs
- The old `/api/create-checkout-session` endpoint still exists for backward compatibility
- RepX endpoints are under `/api/stripe/` namespace
- All amounts are stored in cents in Stripe
- Annual pricing offers ~17% savings compared to monthly

## Support

If you encounter issues:
1. Check Stripe Dashboard for error logs
2. Verify environment variables are set correctly
3. Test with Stripe's test mode first
4. Check backend logs in Render.com dashboard