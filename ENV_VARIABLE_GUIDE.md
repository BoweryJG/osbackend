# Setting Up Environment Variables for Spheres Consolidated Backend

This guide explains how to set up environment variables for your consolidated backend on Render.com.

## Environment Variables Needed

These are the environment variables required for your backend to function properly:

- `SUPABASE_URL` - Your Supabase project URL
- `SUPABASE_KEY` - Your Supabase anon or service key
- `OPENROUTER_API_KEY` - Your OpenRouter API key for LLM access (required for analysis and optional for Whisper)
- `OPENAI_API_KEY` - Your OpenAI API key for Whisper transcription (optional if using OpenRouter)
- The Supabase keys and at least one API key above are required for the transcription service
- `OPENROUTER_MODEL` - Default model to use (optional)
- `NODE_ENV` - Set to `production` for deployed environments
- `FRONTEND_URL` - Your main frontend URL (for CORS)
- `GOOGLE_CLIENT_ID` - If using Google auth
- `GOOGLE_CLIENT_SECRET` - If using Google auth
- `SESSION_SECRET` - Random string for session encryption

## Setting Variables on Render.com

1. **Log in to your Render Dashboard**: https://dashboard.render.com

2. **Navigate to your backend service**:
   - Find and click on the "spheres-consolidated-backend" service in your dashboard

3. **Access Environment Variables**:
   - Click on the "Environment" tab in the service dashboard

4. **Add Environment Variables**:
   - You'll see a form with "Key" and "Value" fields
   - Add each required environment variable with its corresponding value
   - For sensitive variables like API keys, ensure "Secret" is selected

5. **Get Values from Existing Services (if migrating)**:
   - If you have existing backend services, copy the values from them
   - In the Render dashboard, navigate to each existing service
   - Go to the "Environment" tab
   - Copy the values to use in your new consolidated service

6. **Get Supabase Credentials**:
   - Log in to your Supabase dashboard (https://app.supabase.io)
   - Select your project
   - Go to Project Settings > API
   - Copy the "URL" and "anon/public" key (or service role key for more privileges)

7. **Get OpenRouter API Key**:
   - Log in to your OpenRouter account (https://openrouter.ai/keys)
   - Copy your existing API key or create a new one

8. **Apply Changes**:
   - After adding all variables, click "Save Changes"
   - Render will automatically restart your service with the new variables

## Testing Your Configuration

After setting your environment variables:

1. Wait for your service to finish deploying (you'll see a green "Live" status)
2. Test the `/health` endpoint by visiting `https://your-service-url.onrender.com/health`
3. Check the logs in Render dashboard to ensure Supabase connection is successful

## Local Development Environment

For local development:

1. Create a `.env` file in your project root (based on `.env.example`)
2. Add all the same environment variables you set on Render
3. For local development, set `NODE_ENV=development` and `LOCAL_DEV=true`

## Troubleshooting

If your service isn't connecting properly:

1. Check Render logs for any error messages
2. Verify all environment variables are set correctly
3. Ensure your Supabase project is active and accessible
4. Try redeploying the service after confirming your environment variables
