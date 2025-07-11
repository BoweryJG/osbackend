# WebSocket Implementation Guide

This guide explains the enhanced WebSocket implementation in the osbackend system.

## Overview

The WebSocket system provides real-time communication for:
- Dashboard metrics updates
- Agent status monitoring
- Voice cloning progress tracking
- Audio clip analytics
- Training milestones

## Architecture

### 1. Centralized WebSocket Manager (`services/websocketManager.js`)
- Manages all WebSocket connections
- Implements room/channel system
- Handles authentication and reconnection
- Provides event emission methods

### 2. WebSocket Rooms/Channels

Available rooms:
- `dashboard:overview` - General metrics updates
- `agent:{id}` - Specific agent updates
- `voice:training` - Voice cloning progress
- `clips:analytics` - Audio clip play events
- `user:{id}` - User-specific updates
- `admin:broadcast` - Admin broadcast messages

### 3. Event Types

```javascript
// Available event types
METRIC_UPDATE = 'metric_update'
AGENT_STATUS_CHANGE = 'agent_status_change'
VOICE_CLONE_PROGRESS = 'voice_clone_progress'
TRAINING_MILESTONE = 'training_milestone'
CLIP_PLAYED = 'clip_played'
CONNECTION_ESTABLISHED = 'connection_established'
ROOM_JOINED = 'room_joined'
ROOM_LEFT = 'room_left'
ERROR = 'error'
HEARTBEAT = 'heartbeat'
RECONNECTED = 'reconnected'
```

## Server Setup

The WebSocket server runs on port 8082 (configurable via `WS_PORT` env variable).

```javascript
// Started automatically in index.js
import { startWebSocketServer } from './services/websocketManager.js';
startWebSocketServer();
```

## Client Connection

### Frontend Service (`src/utils/websocketService.ts`)

```typescript
import websocketService from './utils/websocketService';

// Connect with authentication
websocketService.connect(authToken);

// Join a room
websocketService.joinRoom('dashboard:overview');

// Listen for events
websocketService.on('metric_update', (data) => {
  console.log('Metric update:', data);
});

// Send messages
websocketService.send('metrics:get', { 
  type: 'voice_call',
  startDate: '2024-01-01' 
});
```

### React Hooks

```typescript
import { useWebSocket, useWebSocketRoom, useWebSocketMetrics } from './utils/websocketService';

// Basic connection
const { connected, authenticated, service } = useWebSocket(authToken);

// Room subscription
useWebSocketRoom('agent:123', (data) => {
  console.log('Agent message:', data);
});

// Metrics subscription
const metrics = useWebSocketMetrics(['voice_call', 'email_campaign']);
```

## Authentication

WebSocket connections support multiple authentication methods:

1. **Token in URL**: `ws://localhost:8082/ws?token=YOUR_TOKEN`
2. **Authorization Header**: `Authorization: Bearer YOUR_TOKEN`
3. **Custom Header**: `X-Auth-Token: YOUR_TOKEN`

The server validates tokens using Supabase or JWT.

## Reconnection Logic

The client automatically reconnects with exponential backoff:
- Initial retry: 5 seconds
- Max retry delay: 30 seconds
- Max attempts: 10

Reconnection preserves:
- Room memberships
- Authentication state
- Client ID

## Server Integration

### Emitting Events

```javascript
import { 
  emitMetricUpdate,
  emitAgentStatusChange,
  emitVoiceCloneProgress,
  emitTrainingMilestone,
  emitClipPlayed 
} from './services/websocketManager.js';

// Metric update
emitMetricUpdate('voice_call', {
  calls: 150,
  duration: 3600,
  cost: 45.50
});

// Agent status
emitAgentStatusChange('agent-123', {
  status: 'online',
  timestamp: new Date().toISOString()
});

// Voice cloning progress
emitVoiceCloneProgress('user-456', {
  status: 'processing',
  progress: 75,
  message: 'Processing audio file...'
});

// Training milestone
emitTrainingMilestone({
  userId: 'user-456',
  milestone: 'audio_extracted',
  details: { duration: 180 }
});

// Clip played
emitClipPlayed('clip-789', {
  plays: 100,
  location: 'US'
});
```

### Custom Message Handling

```javascript
import websocketManager from './services/websocketManager.js';

// Listen for custom messages
websocketManager.on('customMessage', ({ clientId, type, payload }) => {
  if (type === 'custom:event') {
    // Handle custom event
  }
});

// Send to specific user
websocketManager.sendToUser('user-123', {
  type: 'notification',
  data: { message: 'Your voice clone is ready!' }
});

// Broadcast to room
websocketManager.broadcastToRoom('voice:training', {
  type: 'training:update',
  data: { activeJobs: 5 }
});
```

## API Endpoints

### WebSocket Management

- `GET /api/ws/status` - Get WebSocket server status
- `GET /api/ws/rooms` - Get room information
- `POST /api/ws/broadcast` - Broadcast message (admin only)

### WebSocket Proxy

The main server proxies WebSocket connections from `/ws` to the WebSocket server.

## Environment Variables

```bash
# WebSocket Configuration
WS_PORT=8082              # WebSocket server port
METRICS_WS_PORT=8081      # Metrics aggregator port (legacy)
JWT_SECRET=your-secret    # JWT secret for fallback auth
```

## Security

1. **Authentication Required**: Most rooms require authentication
2. **Room Permissions**: Users can only join authorized rooms
3. **Message Validation**: All messages are validated before processing
4. **Rate Limiting**: Connection and message rate limits apply

## Monitoring

Get WebSocket statistics:

```javascript
import { getWebSocketStats } from './services/websocketManager.js';

const stats = getWebSocketStats();
// {
//   totalClients: 45,
//   authenticatedClients: 42,
//   rooms: {
//     'dashboard:overview': { clientCount: 15 },
//     'agent:123': { clientCount: 3 }
//   }
// }
```

## Troubleshooting

### Connection Issues
1. Check if WebSocket server is running (port 8082)
2. Verify authentication token is valid
3. Check browser console for connection errors
4. Ensure firewall allows WebSocket connections

### Message Not Received
1. Verify client has joined the correct room
2. Check message type and format
3. Ensure authentication is valid
4. Check server logs for errors

### Performance Issues
1. Monitor client connection count
2. Check message frequency and size
3. Review room subscription patterns
4. Consider implementing message batching

## Examples

See `services/agentStatusIntegration.example.js` for integration examples.

## Migration from Legacy WebSocket

If migrating from the old WebSocket implementation:

1. Update client connection URL from port 8081 to 8082
2. Update event listeners to use new event types
3. Implement room-based subscriptions
4. Add authentication to connections
5. Update server-side event emissions

## Testing

Test WebSocket connection:
```bash
# Install wscat
npm install -g wscat

# Connect to WebSocket
wscat -c ws://localhost:8082/ws

# Send auth message
{"type":"auth","payload":{"token":"YOUR_TOKEN"}}

# Join room
{"type":"join","payload":{"room":"dashboard:overview"}}

# Request metrics
{"type":"metrics:get","payload":{}}
```