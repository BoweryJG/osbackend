# WebSocket Multi-App Functionality

The WebSocket server now supports multiple applications connecting with their respective agent contexts.

## How It Works

1. **App Name in Handshake**: Each client must provide an `appName` in the socket.io authentication object
2. **App-Specific Agent Cores**: The server maintains separate AgentCore instances for each app
3. **Agent Filtering**: Each AgentCore filters agents based on the `available_in_apps` field in the database

## Client Connection Examples

### Canvas App Connection
```javascript
const socket = io('http://localhost:3001', {
  path: '/agents-ws',
  auth: {
    token: 'your-jwt-token',
    appName: 'canvas'
  }
});
```

### RepConnect App Connection
```javascript
const socket = io('http://localhost:3001', {
  path: '/agents-ws',
  auth: {
    token: 'your-jwt-token',
    appName: 'repconnect'
  }
});
```

### Default Connection (falls back to 'canvas')
```javascript
const socket = io('http://localhost:3001', {
  path: '/agents-ws',
  auth: {
    token: 'your-jwt-token'
    // appName not provided, defaults to 'canvas'
  }
});
```

## Supported App Names

- `canvas` - Canvas Sales Intelligence platform
- `repconnect` - RepConnect platform
- Any other app name can be used as long as agents are configured for it

## Database Requirements

Agents in the `unified_agents` table must have an `available_in_apps` field that contains an array of app names where the agent should be available.

Example agent record:
```json
{
  "id": "agent-123",
  "name": "Sales Expert",
  "available_in_apps": ["canvas", "repconnect"],
  "is_active": true
}
```

## Testing

Run the multi-app test script:
```bash
node agents/websocket/test-multiapp.js
```

This will test connections from both Canvas and RepConnect apps to ensure they can connect and retrieve their respective agents.

## Server Architecture

```
WebSocketServer
├── agentCores: Map<appName, AgentCore>
├── conversationManager: ConversationManager (shared)
└── getAgentCore(appName) → AgentCore instance
```

Each AgentCore instance is app-specific and filters agents based on the app context, ensuring that each application only sees agents that are configured for it.