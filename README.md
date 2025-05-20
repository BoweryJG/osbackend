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
   - `OPENROUTER_API_KEY` - Your OpenRouter API key (required for the transcription service)
   - `OPENAI_API_KEY` - Your OpenAI API key (required for the transcription service)
   - See `ENV_VARIABLE_GUIDE.md` for detailed instructions on setting up environment variables locally and on Render
   - The Supabase keys and both API keys above are required if you plan to use the transcription service
4. Run the SQL scripts to set up the Supabase database tables:
   - `create_user_registrations_table.sql`
   - `create_subscriptions_table.sql`
   - `create_module_access_table.sql`
   - `create_app_data_table.sql`
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

## Deployment
The service is configured to deploy to Render.com using the included `render.yaml` file.

## Frontend Integration
Update all frontend applications to point to this consolidated backend URL:
- Development: `http://localhost:3000`
- Production: The URL of your deployed backend on Render

## Requirements
- Node.js 18+
- Supabase project with PostgreSQL database
