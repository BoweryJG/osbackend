# Dashboard API Documentation

This document describes the comprehensive dashboard API routes that provide access to all dashboard features including metrics, agents, voice profiles, personality templates, and more.

## Base URL
All dashboard endpoints are prefixed with `/api/dashboard`

## Authentication
All dashboard endpoints require authentication via Bearer token in the Authorization header:
```
Authorization: Bearer YOUR_TOKEN_HERE
```

## Rate Limiting
The dashboard API uses tier-based rate limiting:
- **Free tier**: 60 requests/minute
- **Basic tier**: 200 requests/minute
- **Pro tier**: 500 requests/minute
- **Enterprise tier**: 1000 requests/minute

## Endpoints

### 1. Dashboard Overview
Get main dashboard metrics and summary data.

**Endpoint:** `GET /api/dashboard/overview`

**Response:**
```json
{
  "success": true,
  "data": {
    "summary": {
      "today": {
        "totalCost": 12.45,
        "callCount": 25,
        "emailCount": 150,
        "aiInteractions": 75
      },
      "week": {
        "totalCost": 89.50,
        "byDay": [...],
        "topMetricType": [...]
      },
      "realtimeStats": {
        "activeConnections": 5,
        "lastUpdate": "2024-01-15T10:30:00Z"
      }
    },
    "userMetrics": [...],
    "recentActivity": [...],
    "systemStatus": {
      "services": {
        "metricsAggregator": "operational",
        "voiceCloning": "operational",
        "personalityEngine": "operational",
        "audioClips": "operational"
      },
      "lastUpdated": "2024-01-15T10:30:00Z"
    },
    "timestamp": "2024-01-15T10:30:00Z"
  }
}
```

### 2. List Agents
Get all AI agents with their performance metrics.

**Endpoint:** `GET /api/dashboard/agents`

**Query Parameters:**
- `page` (number, default: 1): Page number for pagination
- `limit` (number, default: 20): Number of agents per page
- `sortBy` (string, default: 'created_at'): Field to sort by
- `order` (string, default: 'desc'): Sort order ('asc' or 'desc')

**Response:**
```json
{
  "success": true,
  "data": {
    "agents": [
      {
        "id": "agent-123",
        "name": "Sales Assistant",
        "type": "sales",
        "created_at": "2024-01-10T08:00:00Z",
        "performance": {
          "agentId": "agent-123",
          "totalConversations": 150,
          "avgRating": 4.5,
          "responseMetrics": {
            "avgResponseTime": 1.2,
            "totalInteractions": 450
          },
          "outcomeAnalysis": {...},
          "costAnalysis": 25.50
        }
      }
    ],
    "pagination": {
      "page": 1,
      "limit": 20,
      "total": 45
    }
  }
}
```

### 3. Agent Detailed Metrics
Get detailed metrics for a specific agent.

**Endpoint:** `GET /api/dashboard/metrics/:agentId`

**URL Parameters:**
- `agentId` (string, required): The agent's unique identifier

**Query Parameters:**
- `startDate` (ISO 8601 date): Start date for metrics
- `endDate` (ISO 8601 date): End date for metrics
- `period` (string, default: 'day'): Aggregation period ('hour', 'day', 'week', 'month')

**Response:**
```json
{
  "success": true,
  "data": {
    "agent": {...},
    "performance": {
      "agentId": "agent-123",
      "totalConversations": 150,
      "avgRating": 4.5,
      "responseMetrics": {...},
      "outcomeAnalysis": {...},
      "costAnalysis": 25.50
    },
    "aggregatedMetrics": [...],
    "successRates": [...],
    "recentConversations": [...],
    "period": "day"
  }
}
```

### 4. Voice Profiles
List all voice profiles with usage statistics.

**Endpoint:** `GET /api/dashboard/voice-profiles`

**Query Parameters:**
- `limit` (number, default: 50): Maximum number of profiles to return
- `includeInactive` (boolean, default: false): Include inactive profiles

**Response:**
```json
{
  "success": true,
  "data": {
    "profiles": [
      {
        "voice_id": "voice-456",
        "name": "Professional Sarah",
        "description": "Professional female voice",
        "provider": "elevenlabs",
        "is_active": true,
        "created_at": "2024-01-05T12:00:00Z",
        "usage": {
          "totalCalls": 250,
          "lastUsed": "2024-01-15T09:00:00Z"
        }
      }
    ],
    "total": 12
  }
}
```

### 5. Personality Templates
Get available personality templates (both default and custom).

**Endpoint:** `GET /api/dashboard/personality-templates`

**Response:**
```json
{
  "success": true,
  "data": {
    "templates": [
      {
        "key": "professional",
        "name": "Professional Consultant",
        "traits": {
          "professionalism": 9,
          "friendliness": 5,
          "assertiveness": 7,
          "humor": 2,
          "empathy": 6,
          "verbosity": 6,
          "formality": 8,
          "creativity": 4
        },
        "type": "default"
      },
      {
        "key": "custom-123",
        "name": "Custom Sales Rep",
        "traits": {...},
        "type": "custom",
        "createdBy": "user-789",
        "createdAt": "2024-01-12T14:00:00Z"
      }
    ],
    "total": 8
  }
}
```

### 6. Quick Clips
Get recent audio clips with analytics.

**Endpoint:** `GET /api/dashboard/quick-clips`

**Query Parameters:**
- `limit` (number, default: 20): Maximum number of clips
- `includeExpired` (boolean, default: false): Include expired clips

**Response:**
```json
{
  "success": true,
  "data": {
    "clips": [
      {
        "id": "clip-789",
        "text": "Thank you for your interest...",
        "voice": "nicole",
        "share_url": "https://api.example.com/audio-clips/clip-789",
        "created_at": "2024-01-15T08:00:00Z",
        "expires_at": "2024-01-16T08:00:00Z",
        "analytics": {
          "clipId": "clip-789",
          "plays": 25,
          "uniqueListeners": 18,
          "devices": {
            "mobile": 12,
            "web": 6
          },
          "locations": {
            "US": 15,
            "UK": 3
          },
          "downloads": 5,
          "shares": 3,
          "smsDeliveries": 2
        }
      }
    ],
    "total": 15
  }
}
```

### 7. Training Status
Get agent training progress and status.

**Endpoint:** `GET /api/dashboard/training-status`

**Query Parameters:**
- `agentId` (string, optional): Filter by specific agent

**Response:**
```json
{
  "success": true,
  "data": {
    "stats": {
      "total": 50,
      "completed": 42,
      "inProgress": 3,
      "failed": 5,
      "averageDuration": 3600,
      "successRate": 89.36
    },
    "activeSessions": [...],
    "recentCompletions": [...],
    "allSessions": [...]
  }
}
```

### 8. Refresh Metrics
Force refresh of dashboard metrics (requires professional tier).

**Endpoint:** `POST /api/dashboard/refresh-metrics`

**Required Tier:** Professional or higher

**Response:**
```json
{
  "success": true,
  "data": {
    "message": "Metrics refreshed successfully",
    "summary": {...},
    "refreshedAt": "2024-01-15T10:35:00Z"
  }
}
```

### 9. Export Dashboard Data
Export dashboard data in various formats (requires professional tier).

**Endpoint:** `GET /api/dashboard/export`

**Required Tier:** Professional or higher

**Query Parameters:**
- `format` (string, default: 'json'): Export format ('json' or 'csv')
- `startDate` (ISO 8601 date): Start date for export
- `endDate` (ISO 8601 date): End date for export
- `dataTypes` (string, default: 'all'): Data types to export ('all', 'metrics', 'agents', or comma-separated list)

**Response:**
- For JSON format: Returns JSON data with Content-Disposition header for download
- For CSV format: Returns CSV data with appropriate headers

## Error Responses

All endpoints follow a consistent error response format:

```json
{
  "success": false,
  "error": "Error type",
  "message": "Detailed error message"
}
```

Common HTTP status codes:
- `401 Unauthorized`: Missing or invalid authentication token
- `403 Forbidden`: Insufficient permissions or subscription tier
- `404 Not Found`: Resource not found
- `429 Too Many Requests`: Rate limit exceeded
- `500 Internal Server Error`: Server error

## WebSocket Connection

The metrics aggregator also provides a WebSocket endpoint for real-time metric updates:

**WebSocket URL:** `ws://localhost:8081` (or configured port)

**Connection Example:**
```javascript
const ws = new WebSocket('ws://localhost:8081');

ws.on('open', () => {
  // Subscribe to specific metrics
  ws.send(JSON.stringify({
    type: 'subscribe',
    params: {
      metrics: ['harvey_performance', 'voice_call', 'email_campaign']
    }
  }));
});

ws.on('message', (data) => {
  const message = JSON.parse(data);
  console.log('Metric update:', message);
});
```

**WebSocket Message Types:**
- `subscribe`: Subscribe to specific metric types
- `getMetrics`: Get metrics with filters
- `getAggregation`: Get aggregated metrics
- `metricUpdate`: Real-time metric update (received)

## Integration Examples

### JavaScript/Node.js
```javascript
import axios from 'axios';

const api = axios.create({
  baseURL: 'https://api.example.com',
  headers: {
    'Authorization': 'Bearer YOUR_TOKEN'
  }
});

// Get dashboard overview
const overview = await api.get('/api/dashboard/overview');
console.log(overview.data);

// Get agent metrics
const agentMetrics = await api.get('/api/dashboard/metrics/agent-123', {
  params: {
    period: 'week',
    startDate: '2024-01-08',
    endDate: '2024-01-15'
  }
});
```

### Python
```python
import requests

headers = {
    'Authorization': 'Bearer YOUR_TOKEN'
}

# Get voice profiles
response = requests.get(
    'https://api.example.com/api/dashboard/voice-profiles',
    headers=headers,
    params={'limit': 20}
)

profiles = response.json()
```

### cURL
```bash
# Get personality templates
curl -X GET "https://api.example.com/api/dashboard/personality-templates" \
  -H "Authorization: Bearer YOUR_TOKEN"

# Export dashboard data
curl -X GET "https://api.example.com/api/dashboard/export?format=csv&dataTypes=metrics" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -o dashboard-export.csv
```

## Best Practices

1. **Caching**: Dashboard data is cached for performance. Use the refresh endpoint sparingly.
2. **Pagination**: Always use pagination for list endpoints to avoid large responses.
3. **Date Ranges**: Keep date ranges reasonable (< 90 days) for better performance.
4. **WebSocket**: Use WebSocket for real-time updates instead of polling.
5. **Rate Limiting**: Implement exponential backoff on 429 responses.

## Support

For API support, please contact:
- Email: api-support@example.com
- Documentation: https://docs.example.com/dashboard-api
- Status Page: https://status.example.com