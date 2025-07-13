# Agentbackend Integration Guide

## Overview

osbackend now integrates with the centralized agentbackend system to provide sales reps with access to specialized sales, aesthetic, and coaching agents from the centralized agent repository.

## New Environment Variables

Add these variables to your osbackend deployment:

```bash
# Required
AGENTBACKEND_URL=https://agentbackend-2932.onrender.com

# Optional (for authenticated requests)
AGENTBACKEND_API_KEY=your_api_key_here
```

## New API Endpoints

### 1. External Agents

**GET** `/api/agents/external`

Fetch agents from agentbackend filtered for sales purposes.

**Query Parameters:**
- `category` - Agent category (defaults to 'sales')
- `role` - Agent role filter
- `purpose` - Agent purpose filter

**Response:**
```json
{
  "agents": [...],
  "count": 14,
  "source": "agentbackend"
}
```

### 2. Combined Agents

**GET** `/api/agents/combined`

Get both local Canvas agents and external agentbackend agents in one response.

**Query Parameters:**
- Same as external agents endpoint

**Response:**
```json
{
  "agents": [...],
  "count": 18,
  "sources": {
    "canvas": 4,
    "agentbackend": 14
  }
}
```

### 3. Sales Agent Recommendations

**POST** `/api/agents/sales/recommend`

Get intelligent agent recommendations based on sales context.

**Request Body:**
```json
{
  "customer_type": "dental_practice",
  "sales_stage": "demo",
  "product_category": "aesthetic_devices",
  "urgency": "high"
}
```

**Response:**
```json
{
  "recommendations": [
    {
      "id": "harvey",
      "name": "Harvey Specter",
      "recommendation_score": 15,
      "recommendation_reason": "Specialized external agent, Expert in dental_practice market, demo stage specialist",
      "source": "agentbackend",
      "external": true
    }
  ],
  "count": 5,
  "context": {...}
}
```

### 4. External Agent Conversations

**POST** `/api/conversations/external`

Create a conversation with an external agent from agentbackend.

**Request Body:**
```json
{
  "externalAgentId": "harvey",
  "title": "Sales Strategy Session",
  "agentSource": "agentbackend",
  "context": {
    "customer_type": "dental_practice",
    "sales_objective": "close_deal"
  }
}
```

## Sales Agent Categories

The integration automatically filters agents suitable for sales reps:

- **Sales** - Direct sales agents (Harvey Specter, Sales Specialists)
- **Aesthetic** - Aesthetic treatment specialists (Botox, Fillers, Skincare)
- **Coaching** - Performance and motivation coaches

## Recommendation Algorithm

The system scores agents based on:

1. **Agent Source** (External vs Internal)
2. **Customer Type Match** (Target audience alignment)
3. **Sales Stage Expertise** (Prospecting, Demo, Closing, Follow-up)
4. **Product Category** (Dental, Aesthetic, Medical devices)
5. **Urgency Modifier** (High/Medium/Low priority)

## Integration Benefits

### For Sales Reps
- Access to specialized sales agents beyond local Canvas agents
- Intelligent agent recommendations based on sales context
- Unified interface for both local and external agents

### For osbackend
- Maintains existing Canvas agent functionality
- Seamless integration with agentbackend
- Graceful fallback if external service unavailable
- Enhanced sales capabilities without code duplication

## Error Handling

- Graceful degradation if agentbackend unavailable
- Fallback to local Canvas agents only
- Detailed error messages for debugging
- Service availability checks before API calls

## Testing

Test the integration with these curl commands:

```bash
# Test external agents
curl -H "Authorization: Bearer YOUR_TOKEN" \
  "https://osbackend-zl1h.onrender.com/api/agents/external?category=sales"

# Test combined agents
curl -H "Authorization: Bearer YOUR_TOKEN" \
  "https://osbackend-zl1h.onrender.com/api/agents/combined"

# Test recommendations
curl -X POST -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"customer_type":"dental_practice","sales_stage":"demo"}' \
  "https://osbackend-zl1h.onrender.com/api/agents/sales/recommend"
```

## Deployment Checklist

1. ✅ Add environment variables to Render deployment
2. ⚠️ Verify agentbackend connectivity
3. ⚠️ Test agent fetching and filtering
4. ⚠️ Validate recommendation algorithm
5. ⚠️ Confirm external conversation creation

## Next Steps

1. Deploy updated osbackend to Render
2. Configure environment variables
3. Test all new endpoints
4. Update frontend to use new agent sources
5. Monitor integration performance

## File Changes

- `routes/agents/agentRoutes.js` - Added external agent integration endpoints
- `AGENTBACKEND_INTEGRATION.md` - This documentation file

The integration is backward compatible and non-breaking. Existing Canvas agent functionality remains unchanged.