# Deploying Webhook Changes to Render.com

This guide will help you deploy the new webhook endpoint changes to your Render.com instance.

## What Changed

We've added two important endpoints to support your frontend application:

1. `/webhook` - A new endpoint that matches the expected interface from your frontend application
2. `/user/usage` - An endpoint that provides usage information for users

## Deployment Steps

### Option 1: Automatic Deployment (Recommended)

If you've connected your Render service to GitHub:

1. Commit the changes to your GitHub repository:
   ```bash
   git add index.js test_webhook.js
   git commit -m "Add webhook endpoint for frontend compatibility"
   git push
   ```

2. Render will automatically detect the changes and deploy them.

3. Wait a few minutes for the deployment to complete.

### Option 2: Manual Deployment

If you're not using automatic deployments:

1. Log in to your [Render Dashboard](https://dashboard.render.com)

2. Navigate to your service (`spheres-consolidated-backend`)

3. Click on the "Manual Deploy" button and select "Deploy latest commit" or "Clear build cache & deploy"

4. Wait for the deployment to complete

## Verifying the Deployment

After deployment, run the test script against your production URL:

```bash
BACKEND_URL=https://osbackend-zl1h.onrender.com node test_webhook.js
```

## Updating Your Frontend

Your frontend application at `https://muilinguistics.netlify.app` should already be configured to use `https://osbackend-zl1h.onrender.com` as its backend URL. The changes we've made ensure the backend has the necessary endpoints to support your frontend's expected API calls.

## Troubleshooting

If you encounter any issues:

1. Check the Render logs for any errors
2. Verify that the OpenRouter API key is properly set in your Render environment variables
3. Test the endpoints using a tool like Postman or cURL:
   ```bash
   curl -X POST https://osbackend-zl1h.onrender.com/webhook \
     -H "Content-Type: application/json" \
     -d '{"data": {"fileUrl": "https://example.com/test.mp3", "prompt": "Test webhook"}}'
   ```
   
4. If errors persist, you may need to set additional environment variables in your Render dashboard.

## Need Help?

If you continue to experience issues with the deployment, check the following:

1. Your Render service is on a paid plan with enough resources
2. All required environment variables are properly set
3. CORS is properly configured to allow requests from your frontend domain

Remember that the first request after deployment might be slow as the service "wakes up" if you're using a free tier.
