# Spheres Consolidated Backend

A unified backend server for all Spheres applications, with centralized data storage in Supabase and module-based access control.

## Features
- Single backend for all Spheres applications
- Centralized data storage in Supabase
- Module-based access control
- User subscription management 
- LLM integration via OpenRouter with access control
- Reliable Supabase connection with auto-retry

## Modules Included
- Workspace
- Linguistics
- Market Insights
- CRM
- Blog 

## Setup
1. Clone this repository
2. Run `npm install`
3. Copy `.env.example` to `.env` and fill in your credentials:
   - `SUPABASE_URL` - Your Supabase project URL
   - `SUPABASE_KEY` - Your Supabase anon or service key
   - `OPENROUTER_API_KEY` - Your OpenRouter API key (required for analysis and optional for Whisper)
   - `OPENAI_API_KEY` - Your OpenAI API key for Whisper transcription (optional if using OpenRouter)
   - `STRIPE_SECRET_KEY` - Your Stripe secret API key
   - `STRIPE_WEBHOOK_SECRET` - Stripe webhook signing secret
   - `STRIPE_PRICE_ID` - Price ID for your subscription product
   - See `ENV_VARIABLE_GUIDE.md` for detailed instructions on setting up environment variables locally and on Render
   - The Supabase keys and either OpenAI or OpenRouter API key are required if you plan to use the transcription service
4. Run the SQL scripts to set up the Supabase database tables:
   - `create_user_registrations_table.sql`
   - `create_subscriptions_table.sql`
   - `create_module_access_table.sql`
   - `create_app_data_table.sql`
   - `add_stripe_fields_to_subscriptions.sql`
   - `fix_type_mismatches.sql` (run this if you encounter any type mismatch errors)
5. Start the server:
   ```bash
   npm start
   ```

## API Endpoints

### Module Access
- `GET /api/modules/access` - Check if a user has access to a specific module
  - Query: `?email=user@example.com&module=moduleName`
  - Response: `{ success: true, hasAccess: true|false }`

- `GET /api/modules/list` - List all modules a user has access to
  - Query: `?email=user@example.com`
  - Response: `{ success: true, modules: ["workspace", "blog", ...] }`

### Data Storage
- `POST /api/data/:appName` - Create or update app data
  - Params: `appName` (e.g., "workspace", "linguistics")
  - Body: `{ userId: "user123", data: { /* your JSON data */ } }`
  - Response: `{ success: true, data: { /* saved data object */ } }`

- `GET /api/data/:appName` - Get app data
  - Params: `appName`
  - Query: `?userId=user123`
  - Response: `{ success: true, data: { /* data object */ } }`

- `DELETE /api/data/:appName` - Delete app data
  - Params: `appName`
  - Query: `?userId=user123`
  - Response: `{ success: true, message: "App data deleted successfully" }`

### LLM Integration
- `POST /task` - Call an LLM and log activity
  - Body: `{ "model": "openai", "prompt": "your prompt here", "llm_model": "specific-model-if-needed" }`
  - Response: `{ success: true, llmResult: { /* LLM response */ } }`

### Transcription Service
- `POST /api/transcribe` - Upload an audio file for transcription and analysis. Send the file as `audio` (multipart/form-data) and include the user ID in the `x-user-id` header or as `userId`.
- `GET /api/transcriptions` - List all transcriptions for a user.
- `GET /api/transcriptions/:id` - Get a specific transcription record.
- `DELETE /api/transcriptions/:id` - Delete a transcription.

### Billing
- `POST /api/checkout` - Create a Stripe Checkout session for the authenticated user and return the session URL.
- `POST /stripe/webhook` - Stripe webhook endpoint to update subscription status. Handled automatically by Stripe; no direct user call needed.
  
See `TRANSCRIPTION_SERVICE_GUIDE.md` for full request and response examples.

## Deployment
The service is configured to deploy to Render.com using the included `render.yaml` file.

## Frontend Integration
Update all frontend applications to point to this consolidated backend URL:
- Development: `http://localhost:3000`
- Production: The URL of your deployed backend on Render

## Requirements
- Node.js 18+
- Supabase project with PostgreSQL database
