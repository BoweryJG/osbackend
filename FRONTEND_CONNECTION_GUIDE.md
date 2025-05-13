# Frontend Connection Guide for Netlify Apps

This guide will help you connect your Netlify-hosted frontend applications to the consolidated Spheres backend on Render.com.

## Backend Information

- **Backend URL**: `https://osbackend-zl1h.onrender.com`
- **Status**: Deployed and running on Render.com
- **CORS**: Already configured to allow requests from `*.netlify.app` domains

## Step 1: Update API Base URL in Each Frontend App

In each of your Netlify-hosted frontend applications, update the API base URL to point to the consolidated backend:

```javascript
// Before
const API_BASE_URL = 'https://your-old-backend-url.com';

// After
const API_BASE_URL = 'https://osbackend-zl1h.onrender.com';
```

Look for this configuration in files like:
- `src/config.js`
- `src/api/index.js`
- `src/services/api.js`
- `.env` or `.env.production`

## Step 2: Update Environment Variables in Netlify

1. Log in to your [Netlify Dashboard](https://app.netlify.com/)
2. Select each of your frontend applications
3. Go to **Site settings** > **Build & deploy** > **Environment variables**
4. Update or add the backend URL variable:
   - Key: `REACT_APP_API_URL` or `VITE_API_URL` (depending on your build system)
   - Value: `https://osbackend-zl1h.onrender.com`
5. Click **Save** and trigger a new deployment

## Step 3: Update API Calls

Ensure all API calls in your frontend code use the updated base URL:

### For Module Access

```javascript
// Check if user has access to a specific module
const checkAccess = async (email, module) => {
  const response = await fetch(`${API_BASE_URL}/api/modules/access?email=${encodeURIComponent(email)}&module=${module}`);
  const data = await response.json();
  return data.hasAccess;
};

// List all modules a user has access to
const listModules = async (email) => {
  const response = await fetch(`${API_BASE_URL}/api/modules/list?email=${encodeURIComponent(email)}`);
  const data = await response.json();
  return data.modules;
};
```

### For Data Storage

```javascript
// Save application data
const saveData = async (appName, userId, data) => {
  const response = await fetch(`${API_BASE_URL}/api/data/${appName}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      userId,
      data
    })
  });
  
  return await response.json();
};

// Load application data
const loadData = async (appName, userId) => {
  const response = await fetch(`${API_BASE_URL}/api/data/${appName}?userId=${encodeURIComponent(userId)}`);
  const result = await response.json();
  return result.data;
};

// Delete application data
const deleteData = async (appName, userId) => {
  const response = await fetch(`${API_BASE_URL}/api/data/${appName}?userId=${encodeURIComponent(userId)}`, {
    method: 'DELETE'
  });
  
  return await response.json();
};
```

### For LLM Integration

```javascript
// Call LLM API
const callLLM = async (prompt, model = null) => {
  const response = await fetch(`${API_BASE_URL}/task`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      prompt,
      llm_model: model, // Optional, will use default if not specified
      email: user.email // Include for paid model access control
    })
  });
  
  const result = await response.json();
  return result.llmResult;
};
```

### For Webhook Compatibility

If your application uses the webhook endpoint:

```javascript
// Call webhook endpoint
const callWebhook = async (fileUrl, prompt) => {
  const response = await fetch(`${API_BASE_URL}/webhook`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      data: {
        fileUrl,
        prompt
      }
    })
  });
  
  return await response.json();
};
```

## Step 4: Update User Authentication

Ensure your application includes user authentication and passes the user's email when making requests to protected endpoints:

```javascript
// Example: Checking module access with authenticated user
const checkUserAccess = async (module) => {
  // Get current user from your auth system
  const user = getCurrentUser();
  
  if (!user || !user.email) {
    return false;
  }
  
  return await checkAccess(user.email, module);
};
```

## Step 5: Test the Connection

After updating your frontend code:

1. Deploy the changes to Netlify
2. Test all functionality that interacts with the backend
3. Check browser console for any CORS or connection errors
4. Verify data is being saved and retrieved correctly

## Specific App Configuration

### Market Insights App

1. Update API base URL to `https://osbackend-zl1h.onrender.com`
2. Use the `/api/data/market_insights` endpoint for storing market data
3. Check module access with `module=market_insights`

### Linguistics App

1. Update API base URL to `https://osbackend-zl1h.onrender.com`
2. Use the `/api/data/linguistics` endpoint for storing linguistics data
3. Check module access with `module=linguistics`
4. Ensure LLM requests include the user's email for access control

### Workspace App

1. Update API base URL to `https://osbackend-zl1h.onrender.com`
2. Use the `/api/data/workspace` endpoint for storing workspace data
3. Check module access with `module=workspace`

### CRM App

1. Update API base URL to `https://osbackend-zl1h.onrender.com`
2. Use the `/api/data/crm` endpoint for storing CRM data
3. Check module access with `module=crm`

### Blog App

1. Update API base URL to `https://osbackend-zl1h.onrender.com`
2. Use the `/api/data/blog` endpoint for storing blog-related user data
3. Check module access with `module=blog`

## Troubleshooting

If you encounter issues connecting to the backend:

1. **CORS Errors**: Ensure your Netlify domain is properly allowed in the backend CORS configuration
2. **Authentication Issues**: Verify user authentication is working correctly
3. **404 Errors**: Check that you're using the correct endpoint paths
4. **Connection Timeouts**: The backend might be in sleep mode if using a free Render plan; the first request may take longer

### Common CORS Issues

If you see CORS errors in the console:

1. Check that your frontend is making requests from an allowed domain
2. Ensure you're not including credentials in requests to public endpoints
3. Verify the backend CORS configuration includes your Netlify domain

### API Response Issues

If API calls return unexpected results:

1. Check the request format and parameters
2. Verify the user has the appropriate subscription level for the requested modules
3. Ensure the backend is properly connected to Supabase

## Need Help?

If you continue to experience issues connecting your frontend to the backend, contact the development team for assistance.
