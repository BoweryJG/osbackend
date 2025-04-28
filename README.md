# MCP AI Server

A modular backend server to orchestrate LLM calls, execute tasks, and log activities to Supabase.

## Features
- Call different LLMs (OpenAI, extendable to Anthropic, etc.)
- Execute tasks via REST API
- Log all activity/results to Supabase

## Setup
1. Clone/download this repo.
2. Run `npm install`.
3. Copy `.env.example` to `.env` and fill in your credentials (Supabase, OpenAI, etc).
4. Start the server:
   ```bash
   npm start
   ```

## Endpoints
- `POST /task` — Call an LLM and log activity
  - Body: `{ "model": "openai", "prompt": "your prompt here" }`
  - Response: `{ success, llmResult }`

## Extending
- Add more LLM providers in `index.js`.
- Add more endpoints as needed.

## Requirements
- Node.js 18+
