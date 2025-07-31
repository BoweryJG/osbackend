# RepConnect Subscription Integration Guide

This guide explains how to integrate your app with the unified RepConnect subscription system for checking access, tracking usage, and managing feature limits.

## Overview

The RepConnect subscription system provides:
- **Unified subscription management** across all RepSpheres apps
- **Real-time access validation** with caching
- **Automatic usage tracking** and limit enforcement
- **Twilio auto-provisioning** for RepX1+ subscribers
- **Cross-app feature access** control

## Quick Start

### 1. Install the Client Library

```bash
npm install @repconnect/subscription-client
# or
yarn add @repconnect/subscription-client
```

### 2. Initialize the Client

```javascript
import SubscriptionClient from '@repconnect/subscription-client';

const subscriptionClient = new SubscriptionClient({
  apiUrl: 'https://osbackend-zl1h.onrender.com',
  appName: 'canvas', // Your app name
  cacheTimeout: 300000 // 5 minutes
});
```

### 3. Check Feature Access

```javascript
// Before allowing an action, validate access
const access = await subscriptionClient.validateAccess(
  userId,
  'canvas_scans', // Feature type
  1 // Quantity requested
);

if (!access.allowed) {
  // Show upgrade prompt
  showUpgradeModal({
    currentTier: access.tier,
    feature: 'canvas_scans',
    limit: access.limit,
    used: access.currentUsage
  });
  return;
}

// Proceed with action...
```

### 4. Track Usage

```javascript
// After successful action, track usage
await subscriptionClient.trackUsage(
  userId,
  'canvas_scans',
  1,
  {
    practiceId: 'abc123',
    scanType: 'full'
  }
);
```

## API Endpoints

### POST /api/subscription/validate-access
Validates if a user can perform an action based on their subscription tier.

**Request:**
```json
{
  "userId": "user-uuid",
  "email": "user@example.com", // Alternative to userId
  "feature": "calls|emails|canvas_scans|ai_queries|transcriptions",
  "requestedQuantity": 1
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "allowed": true,
    "tier": "repx2",
    "feature": "calls",
    "limit": 200,
    "currentUsage": 45,
    "remaining": 155,
    "requestedQuantity": 1
  }
}
```

### POST /api/subscription/check-limits
Get all feature limits and current usage for a user.

**Request:**
```json
{
  "userId": "user-uuid",
  "email": "user@example.com" // Alternative
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "tier": "repx3",
    "subscription": {
      "id": "sub_abc123",
      "status": "active",
      "current_period_end": "2025-02-28T23:59:59Z"
    },
    "limits": {
      "calls": {
        "limit": 400,
        "used": 127,
        "remaining": 273,
        "percentage": 32
      },
      "emails": {
        "limit": 100,
        "used": 23,
        "remaining": 77,
        "percentage": 23
      },
      "canvas_scans": {
        "limit": 25,
        "used": 8,
        "remaining": 17,
        "percentage": 32
      }
    },
    "resetDate": "2025-02-01T00:00:00Z"
  }
}
```

### POST /api/subscription/track-usage
Track feature usage for billing and limits.

**Request:**
```json
{
  "userId": "user-uuid",
  "email": "user@example.com",
  "feature": "calls",
  "quantity": 1,
  "appName": "canvas",
  "metadata": {
    "callDuration": 300,
    "toNumber": "+1234567890"
  }
}
```

### GET /api/subscription/usage-stats
Get usage statistics for reporting.

**Query Parameters:**
- `userId` or `email` (required)
- `period`: `current_month` (default), `last_month`, `last_30_days`

## Feature Types

| Feature | Description | Available Tiers |
|---------|-------------|-----------------|
| `calls` | Phone calls via Twilio | RepX1+ |
| `emails` | Email sends | RepX2+ |
| `canvas_scans` | Canvas practice scans | RepX2+ |
| `ai_queries` | AI API calls | All tiers |
| `transcriptions` | Audio transcriptions | All tiers |

## Subscription Tiers

| Tier | Calls | Emails | Canvas Scans | AI Queries | Transcriptions |
|------|-------|--------|--------------|------------|----------------|
| Free | 0 | 0 | 0 | 10 | 5 |
| RepX1 | 100 | 0 | 0 | 50 | 100 |
| RepX2 | 200 | 50 | 10 | 100 | 200 |
| RepX3 | 400 | 100 | 25 | 500 | 400 |
| RepX4 | 800 | 200 | 50 | 1000 | 800 |
| RepX5 | Unlimited | Unlimited | Unlimited | Unlimited | Unlimited |

## React Integration

Use the provided React hook for easy integration:

```javascript
import { useSubscription } from '@repconnect/subscription-client/react';

function MyComponent({ userId }) {
  const { 
    limits, 
    validateAccess, 
    trackUsage, 
    loading, 
    error,
    tier,
    isFeatureAvailable 
  } = useSubscription(userId);

  const handleScan = async () => {
    // Check if feature is available
    if (!isFeatureAvailable('canvas_scans')) {
      showFeatureNotAvailable();
      return;
    }

    // Validate access
    const access = await validateAccess('canvas_scans');
    if (!access.allowed) {
      showUpgradeModal();
      return;
    }

    // Perform scan
    const result = await performCanvasScan();

    // Track usage
    await trackUsage('canvas_scans', 1, {
      scanId: result.id
    });
  };

  if (loading) return <Spinner />;
  if (error) return <ErrorMessage>{error}</ErrorMessage>;

  return (
    <div>
      <h3>Your Plan: {tier}</h3>
      <UsageBar 
        used={limits.canvas_scans.used}
        limit={limits.canvas_scans.limit}
      />
      <button onClick={handleScan}>
        Scan Practice ({limits.canvas_scans.remaining} remaining)
      </button>
    </div>
  );
}
```

## Twilio Integration

RepX1+ subscribers automatically get a Twilio phone number provisioned. Check if configured:

```javascript
const twilioConfig = await subscriptionClient.getTwilioConfig(userId);

if (twilioConfig.configured) {
  console.log('Phone number:', twilioConfig.phoneNumber);
  console.log('Status:', twilioConfig.status);
} else {
  // Trigger provisioning for eligible users
  if (tier >= 'repx1') {
    await subscriptionClient.provisionTwilio(userId, email, tier);
  }
}
```

## Error Handling

```javascript
try {
  const access = await subscriptionClient.validateAccess(userId, 'calls');
  // ...
} catch (error) {
  if (error.message.includes('limit exceeded')) {
    showUpgradePrompt();
  } else if (error.message.includes('not found')) {
    // User doesn't have a subscription
    redirectToSignup();
  } else {
    // Generic error
    console.error('Subscription error:', error);
    showErrorMessage();
  }
}
```

## Caching

The client library caches responses for 5 minutes by default. You can:

1. **Adjust cache timeout:**
   ```javascript
   const client = new SubscriptionClient({
     cacheTimeout: 60000 // 1 minute
   });
   ```

2. **Clear cache manually:**
   ```javascript
   client.clearCache();
   ```

3. **Disable caching:**
   ```javascript
   const client = new SubscriptionClient({
     cacheTimeout: 0
   });
   ```

## Best Practices

1. **Always validate before actions:**
   ```javascript
   // ❌ Bad - tracks usage without validation
   await performAction();
   await trackUsage('feature', 1);

   // ✅ Good - validates first
   const access = await validateAccess('feature');
   if (access.allowed) {
     await performAction();
     await trackUsage('feature', 1);
   }
   ```

2. **Handle rate limits gracefully:**
   ```javascript
   if (!access.allowed && access.remaining === 0) {
     const resetDate = new Date(limits.resetDate);
     showMessage(`Limit reached. Resets ${resetDate.toLocaleDateString()}`);
   }
   ```

3. **Track usage immediately after success:**
   ```javascript
   try {
     const result = await performAction();
     await trackUsage('feature', 1, { resultId: result.id });
   } catch (error) {
     // Don't track usage if action failed
     console.error('Action failed:', error);
   }
   ```

4. **Provide clear upgrade paths:**
   ```javascript
   const UpgradePrompt = ({ currentTier, feature }) => (
     <div>
       <p>This feature requires {getRequiredTier(feature)}</p>
       <p>You currently have {getTierDisplayName(currentTier)}</p>
       <Button onClick={() => navigate('/upgrade')}>
         Upgrade Now
       </Button>
     </div>
   );
   ```

## Testing

For development/testing, you can use mock responses:

```javascript
// Mock successful validation
const mockClient = {
  validateAccess: async () => ({ 
    allowed: true, 
    tier: 'repx3',
    remaining: 10 
  }),
  trackUsage: async () => ({ success: true }),
  checkLimits: async () => ({
    tier: 'repx3',
    limits: {
      calls: { limit: 400, used: 0, remaining: 400 }
    }
  })
};
```

## Migration from Legacy Systems

If migrating from app-specific subscription logic:

1. **Replace local subscription checks:**
   ```javascript
   // Old
   if (userPlan === 'premium') { ... }

   // New
   const access = await validateAccess('feature');
   if (access.allowed) { ... }
   ```

2. **Update usage tracking:**
   ```javascript
   // Old
   await db.incrementUsage(userId, 'calls');

   // New
   await trackUsage('calls', 1);
   ```

3. **Use unified tier names:**
   - `free` → `free`
   - `starter/basic` → `repx1`
   - `pro/premium` → `repx3`
   - `enterprise` → `repx5`

## Support

For issues or questions:
- API Documentation: https://osbackend-zl1h.onrender.com/docs
- GitHub Issues: https://github.com/repspheres/repconnect
- Email: support@repspheres.com