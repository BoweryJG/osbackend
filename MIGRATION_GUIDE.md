# Migration Guide for React Applications

This guide outlines the steps to migrate your existing React applications to use the consolidated Spheres backend.

## Overview

All React applications should now connect to a single backend endpoint that manages centralized data storage in Supabase and provides module-based access control.

## Step 1: Update API Endpoints

Update all API calls in your React applications to point to the consolidated backend:

### Development
```javascript
const API_BASE_URL = 'http://localhost:3000';
```

### Production
```javascript
const API_BASE_URL = 'https://spheres-consolidated-backend.onrender.com'; // Your actual Render URL
```

## Step 2: User Authentication

Ensure your application includes user authentication:

1. Use Supabase authentication if possible
2. When making requests to protected endpoints, include the user's email in the request:

```javascript
// Example: Checking module access
const checkAccess = async (email, module) => {
  const response = await fetch(`${API_BASE_URL}/api/modules/access?email=${encodeURIComponent(email)}&module=${module}`);
  const data = await response.json();
  return data.hasAccess;
};
```

## Step 3: Data Storage

Use the app data endpoints for storing application-specific data:

```javascript
// Saving data
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

// Loading data
const loadData = async (appName, userId) => {
  const response = await fetch(`${API_BASE_URL}/api/data/${appName}?userId=${encodeURIComponent(userId)}`);
  const result = await response.json();
  return result.data;
};
```

## Step 4: LLM Integration

If your application uses LLM features, update to use the consolidated API:

```javascript
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

## Step 5: Module Access Control

Check if the user has access to specific modules before showing them:

```javascript
// In your component
useEffect(() => {
  const checkModuleAccess = async () => {
    if (user) {
      // Check if user has access to this module
      const hasAccess = await checkAccess(user.email, 'linguistics');
      
      if (!hasAccess) {
        // Redirect or show subscription upgrade message
        navigate('/subscription-required');
      }
    }
  };
  
  checkModuleAccess();
}, [user]);
```

## Step 6: Test Thoroughly

1. Test all functionality with different user types (free, ASM, RSM)
2. Verify data persistence and retrieval
3. Check module access restrictions
4. Test LLM access based on subscription level

## Specific App Migration Guides

### Workspace App

1. Update API endpoints as described above
2. Use the `/api/data/workspace` endpoint for storing workspace data
3. Check module access with `module=workspace`

### Linguistics App

1. Update API endpoints as described above
2. Use the `/api/data/linguistics` endpoint for storing linguistics data
3. Check module access with `module=linguistics`
4. Ensure LLM requests include the user's email for access control

### Market Insights App

1. Update API endpoints as described above
2. Use the `/api/data/market_insights` endpoint for storing market data
3. Check module access with `module=market_insights`

### CRM App

1. Update API endpoints as described above
2. Use the `/api/data/crm` endpoint for storing CRM data
3. Check module access with `module=crm`
4. Note that CRM access is restricted to RSM subscription level only

### Blog App

1. Update API endpoints as described above
2. Use the `/api/data/blog` endpoint for storing blog-related user data
3. Check module access with `module=blog`
4. The blog itself should be publicly accessible, but user-specific features require login

## Troubleshooting

If you encounter issues during migration:

1. Check browser console for errors
2. Verify the backend is running and accessible
3. Ensure all environment variables are correctly set in the backend
4. Verify Supabase connection is working
5. Check that the user has the appropriate subscription level for the requested modules

### Common Database Issues

#### Type Mismatch Between UUID and TEXT

If you encounter errors like `operator does not exist: text = uuid`, you'll need to run the provided fix script:

1. Go to your Supabase project dashboard
2. Navigate to the SQL Editor
3. Run the `fix_type_mismatches.sql` script which will:
   - Fix the Row Level Security policies that compare user IDs
   - Add proper type casting between UUID and TEXT values
   - Provide notices for any manual migrations that might be needed

#### Data Consistency Issues

If you're migrating data from multiple backends:

1. Ensure there are no duplicate user records
2. Verify all module access entries match the correct subscription levels
3. Consider running data validation queries to identify inconsistencies before relying on the data

## Contact

For migration assistance, contact the development team.
