# RepX Pricing Update - July 30, 2025

## Overview
Updated osbackend with new unified RepX subscription tiers and Stripe price IDs.

## New Pricing Structure

### Rep¹ - Login ($97/mo, $970/yr)
- **Product ID**: `prod_SmFydoxW9fhX9i`
- **Monthly Price ID**: `price_1RqhStGRiAPUZqWutwNBJlnr`
- **Annual Price ID**: `price_1RqhStGRiAPUZqWu8eRYprp6`
- **Features**: Cross-app SSO, 1-min agents

### Rep² - Login + Email ($197/mo, $1,970/yr)
- **Product ID**: `prod_SmFyc5CAmyVXyc`
- **Monthly Price ID**: `price_1RqhSuGRiAPUZqWu29dIsVGz`
- **Annual Price ID**: `price_1RqhSuGRiAPUZqWu0nHKxkmp`
- **Features**: + Vultr SMTP unlimited email, 5-min agents

### Rep³ - Login + Email + Phone ($297/mo, $2,970/yr)
- **Product ID**: `prod_SmFy6tnJYDJfIo`
- **Monthly Price ID**: `price_1RqhSvGRiAPUZqWuygjxykuG`
- **Annual Price ID**: `price_1RqhSvGRiAPUZqWuuvRB2q20`
- **Features**: + Twilio phone provisioning, 15-min agents

### Rep⁴ - Login + Email + Phone + Gmail ($497/mo, $4,970/yr)
- **Product ID**: `prod_SmFy5G44rm0zAh`
- **Monthly Price ID**: `price_1RqhSvGRiAPUZqWu6YlhyKE2`
- **Annual Price ID**: `price_1RqhSwGRiAPUZqWuJmTnpUXw`
- **Features**: + Gmail OAuth sync, 30-min agents

### Rep⁵ - Everything + Custom ($997/mo, $9,970/yr)
- **Product ID**: `prod_SmFy5is3MQHaKb`
- **Monthly Price ID**: `price_1RqhSwGRiAPUZqWuAJzj4tw5`
- **Annual Price ID**: `price_1RqhSwGRiAPUZqWump7raV5n`
- **Features**: + White label, unlimited agents

## Files Updated
- `/routes/stripe.js` - Updated all price IDs and feature descriptions
- Removed old pricing structure (Rep¹=$39, Rep²=$97, etc.)
- Added new unified authentication features

## Testing
Test the updated pricing by calling:
```bash
GET https://osbackend-zl1h.onrender.com/api/stripe/repx/plans
```

## Next Steps
1. Deploy to production
2. Update all frontend apps to use new tier names
3. Test checkout flow with new price IDs
4. Configure Stripe webhooks for auto-provisioning