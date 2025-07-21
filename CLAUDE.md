# Unified Agent System - Claude Code Context

This document provides context for Claude Code when working with the unified agent system backend.

## System Overview

This is a production Node.js backend supporting a **unified agent system** that serves both Canvas and RepConnect applications with 22 specialized AI agents.

## Architecture

### Single Source of Truth
- **Primary Table**: `unified_agents` in Supabase project `cbopynuvhcymbumjnvay` (Sphere1a)
- **22 Total Agents**: Across strategists, coaches, specialists, elite closers, voice reps
- **Multi-App Support**: Agents available in Canvas, RepConnect, or Pedro via `available_in_apps[]`

### Core Components
- **AgentCore** (`agents/core/agentCore.js`): App-agnostic agent management with `appName` parameter
- **WebSocket Server** (`agents/websocket/server.js`): Multi-app real-time chat support
- **RepConnect Routes** (`routes/repconnectRoutes.js`): REST API + chat endpoints
- **Canvas Routes** (`routes/agents/agentRoutes.js`): Canvas-specific endpoints

## Agent Categories

### 🧠 Strategists (4 agents)
Available in both Canvas and RepConnect:
- **Hunter**: Prospecting specialist
- **Closer**: Deal negotiation expert  
- **Educator**: Teaching-focused medical expert
- **Strategist**: Market intelligence analyst

### 🏆 Elite Closers (2 agents)
- **Harvey Specter**: Maximum aggression closer
- **Victoria Sterling**: Sophisticated negotiator

### 👥 Coaches (5 agents)
- **Coach Alex**: RepConnect exclusive motivational coach
- **Alexis Rivera, David Park, Marcus Chen, Sarah Mitchell**: Canvas + RepConnect

### 🩺 Medical Specialists (6 agents)
- **Dr. Amanda Foster, Dr. Harvey Stern, Dr. Lisa Martinez, Dr. Sarah Chen**: Medical device experts
- **Jake Thompson, Marcus Rodriguez**: Sports medicine and emergency specialists

### 🎤 Voice Representatives (5 agents)
- **Marcus, Sarah**: RepConnect exclusive voice reps
- **Brian, Julie, Maria**: Pedro platform specialists

## Communication Methods

### WebSocket Chat (`/agents-ws`)
Both Canvas and RepConnect connect to the same WebSocket server:
```javascript
// Canvas
const canvas = io('/', { auth: { token, appName: 'canvas' }});

// RepConnect  
const repconnect = io('/', { auth: { token, appName: 'repconnect' }});
```

### REST API Chat (RepConnect Only)
- `POST /api/repconnect/chat/stream` - Server-Sent Events streaming
- `POST /api/repconnect/chat/message` - Standard chat messages
- Conversation management endpoints

### Voice Integration
- **19 Voice-Enabled Agents**: ElevenLabs integration
- **Voice Sessions**: Tracked in `agent_voice_sessions` table
- **Whisper Support**: Real-time coaching during calls

## Key Database Tables

### Primary Tables
- `unified_agents` - Master agent table (SINGLE SOURCE OF TRUTH)
- `agent_voice_profiles` - Voice configurations
- `agent_conversation_styles` - Chat behavior
- `agent_conversations` - Chat history
- `agent_voice_sessions` - Voice call tracking

### Legacy Tables (DO NOT USE)
- `canvas_ai_agents` - ❌ Deprecated, migrated to unified_agents
- `sales_coach_agents` - ❌ Deprecated, migrated to unified_agents  
- `repconnect_agents` - ❌ Deprecated, migrated to unified_agents

## Environment & Deployment

### Supabase Configuration
- **Project**: Sphere1a (`cbopynuvhcymbumjnvay`)
- **URL**: `https://cbopynuvhcymbumjnvay.supabase.co`
- **Service Key**: Required for backend operations

### Production Deployment
- **Platform**: Render
- **URL**: `https://osbackend-zl1h.onrender.com`
- **Auto-Deploy**: Connected to GitHub main branch
- **Health Check**: `GET /health`

## Recent Major Changes

### Unified System Migration (Latest)
- ✅ Consolidated all agents into `unified_agents` table
- ✅ Made AgentCore app-agnostic with dynamic filtering
- ✅ Added full chat functionality to RepConnect
- ✅ Implemented multi-app WebSocket support
- ✅ Migrated all system prompts (100% coverage)
- ✅ Removed fallbacks to old tables

## Testing

### Test Files Available
- `test_canvas_chat.js` - WebSocket chat testing
- `test_repconnect_chat.js` - REST API chat testing  
- `agents/websocket/test-multiapp.js` - Multi-app WebSocket testing

### Running Tests
```bash
# Canvas WebSocket test
node test_canvas_chat.js

# RepConnect REST API test  
node test_repconnect_chat.js

# Multi-app WebSocket test
cd agents/websocket && node test-multiapp.js
```

## Common Tasks

### Adding New Agents
1. Insert into `unified_agents` table with appropriate `available_in_apps[]`
2. Add system_prompt for chat functionality
3. Optionally add voice profile and conversation style

### Debugging Agent Issues
1. Check `unified_agents` table for agent existence
2. Verify `available_in_apps` contains correct app name
3. Ensure `is_active = true`
4. Check system_prompt is not null for chat functionality

### Updating Agent Behavior
- **Chat Behavior**: Update `system_prompt` in `unified_agents`
- **Voice Settings**: Update `voice_settings` or `agent_voice_profiles`  
- **Conversation Style**: Update `agent_conversation_styles`

## File Naming Conventions

When creating new files:
- **Canvas-specific**: Include "canvas" in filename (e.g., `test_canvas_chat.js`)
- **RepConnect-specific**: Include "repconnect" in filename (e.g., `test_repconnect_chat.js`)
- **Shared/Universal**: Use generic names (e.g., `agentCore.js`)

## API Endpoints Summary

### Canvas (`/api/canvas/`)
- Agent listing and details
- Conversation management  
- WebSocket chat primary interface

### RepConnect (`/api/repconnect/`)
- Agent listing with RepConnect filtering
- Voice session management
- **NEW**: Full chat REST API with streaming support
- **NEW**: WebSocket chat support

## Important Notes

- **Always use `unified_agents` table** - never query old agent tables directly
- **App context matters** - AgentCore requires `appName` parameter
- **System prompts required** - All agents need system_prompt for chat functionality
- **Voice + Chat** - Both apps now have identical capabilities
- **Backward compatibility** - Old API endpoints still work but use unified backend

This system provides a scalable, unified architecture supporting multiple applications with consistent agent behavior and capabilities.