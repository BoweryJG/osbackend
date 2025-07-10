# Authentication Implementation Guide

## Overview
This guide shows how to protect your API routes with the new cookie-based authentication and CSRF protection.

## Updating Protected Routes

### Example: Protecting Coaching Session Routes

```javascript
import express from 'express';
import { requireAuth } from '../src/middleware/authMiddleware.js';

const router = express.Router();

// Protected route - requires authentication
router.post('/start-session', requireAuth, async (req, res) => {
  try {
    // req.user is now available from the auth middleware
    const userId = req.user.id;
    const { repId, coachId, procedureCategory } = req.body;
    
    // Your existing logic here...
  } catch (error) {
    // Error handling...
  }
});

// Public route - no authentication needed
router.get('/public-info', async (req, res) => {
  // No requireAuth middleware, so this is publicly accessible
});

export default router;
```

### Applying to Multiple Routes

```javascript
// Apply auth to all routes in this router
router.use(requireAuth);

// All routes below will require authentication
router.get('/protected-1', async (req, res) => { /* ... */ });
router.post('/protected-2', async (req, res) => { /* ... */ });
```

### Selective Authentication

```javascript
// Mix of public and protected routes
router.get('/public', handler); // No auth
router.get('/protected', requireAuth, handler); // Auth required
router.post('/create', requireAuth, handler); // Auth required
```

## Client-Side API Calls

### Example: Making Authenticated Requests

```typescript
import axios from 'axios';

// Axios is already configured with interceptors in authService.ts
// Just make normal requests and auth/CSRF will be handled automatically

// GET request (no CSRF needed)
const getData = async () => {
  const response = await axios.get('/api/coaching/sessions');
  return response.data;
};

// POST request (CSRF token automatically added)
const createSession = async (data) => {
  const response = await axios.post('/api/coaching/start-session', data);
  return response.data;
};

// Error handling (401 triggers auto-refresh)
try {
  const data = await getData();
} catch (error) {
  if (error.response?.status === 403) {
    // CSRF error - get new token
    await authService.getNewCSRFToken();
    // Retry request
  }
}
```

## Session Management

### Server-Side Session Configuration

```javascript
// In authMiddleware.js
const SESSION_TIMEOUT = 30 * 60 * 1000; // 30 minutes
const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'strict',
  maxAge: SESSION_TIMEOUT,
  path: '/'
};
```

### Client-Side Session Monitoring

The AuthContext automatically:
- Shows warning 5 minutes before timeout
- Refreshes session every 15 minutes
- Handles user activity tracking
- Clears session on timeout

## Security Best Practices

1. **Never expose sensitive tokens in client-side code**
   - JWT stored in httpOnly cookies
   - CSRF token in separate non-httpOnly cookie

2. **Always validate CSRF for state-changing operations**
   - Applied automatically via middleware
   - Skip only for GET/HEAD/OPTIONS

3. **Use secure cookie settings in production**
   - secure: true (HTTPS only)
   - sameSite: 'strict' (CSRF protection)

4. **Implement proper error handling**
   - 401: Session expired - trigger refresh
   - 403: CSRF invalid - get new token
   - 500: Server error - show user message

## Migration Checklist

- [ ] Install cookie-parser: `npm install cookie-parser`
- [ ] Add auth routes to server.js
- [ ] Update protected API routes with `requireAuth`
- [ ] Add SessionWarning component to App.tsx
- [ ] Test login/logout flow
- [ ] Test session timeout
- [ ] Test CSRF protection
- [ ] Update deployment environment variables