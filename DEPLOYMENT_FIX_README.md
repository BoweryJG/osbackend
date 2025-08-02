# DEPLOYMENT FAILURE ROOT CAUSE AND FIX

## The Problem
On [DATE], a simple request to "clean up duplicate/unused environment variables" in Render led to a catastrophic deployment failure. All new deployments began failing with "Exited with status 1" approximately 7 seconds after startup.

## Root Cause Analysis

### 1. Missing PORT Environment Variable (PRIMARY CAUSE)
- **What happened**: The critical `PORT=10000` environment variable was deleted during "cleanup"
- **Why it matters**: Render requires apps to listen on the PORT they provide (10000)
- **What went wrong**: Without PORT set, the app defaults to port 3000 (see index.js line: `const PORT = process.env.PORT || 3000;`)
- **Result**: Render's health checks hit port 10000, find nothing, and kill the deployment after ~7 seconds

### 2. Multiple WebSocket Servers (SECONDARY ISSUE)
The application attempts to start WebSocket servers on multiple ports:
- Main HTTP server: Uses PORT (should be 10000)
- Metrics WebSocket: Port 8081 (line 2755 in index.js)
- Central WebSocket Manager: Port 8082 (line 2761 in index.js)

**Render only allows binding to ONE port** - the PORT environment variable they provide.

### 3. Why July 31st Deployment Still Works
The deployment from commit 5e603694 (July 31st) continues to run because:
- It was deployed when PORT=10000 was still set
- Render keeps old deployments running until new ones successfully deploy
- Environment variables are baked into the running deployment

## THE FIX

### Minimum Required (Add to Render Environment Variables):
```
PORT=10000
```

### Additional Variables That May Be Needed:
```
ELEVENLABS_API_KEY=your_actual_key_here
SENDGRID_API_KEY=your_actual_key_here
WS_PORT=10000                  # Force WebSocket to use same port
METRICS_WS_PORT=10000          # Force metrics to use same port
```

## How to Add Environment Variables in Render

1. Go to your service dashboard in Render
2. Click on "Environment" in the left sidebar
3. Add the variable(s) above
4. Click "Save Changes"
5. This will trigger a new deployment

## Verification

After adding PORT=10000, your deployment logs should show:
- App starting on port 10000 (not 3000)
- Successful health checks
- No "Exited with status 1" error

## Lessons Learned

1. **NEVER delete environment variables without understanding their purpose**
2. **PORT is CRITICAL for Render deployments** - it tells your app which port to listen on
3. **Multiple port bindings don't work on Render** - everything must use the single PORT provided
4. **Test environment variable changes** in a staging environment first

## Long-term Fix

The application should be refactored to:
1. Use a single port for all services (HTTP + WebSockets)
2. Mount WebSocket servers as paths on the main server instead of separate ports
3. Add environment variable validation on startup to catch missing critical variables

## Emergency Rollback Option

If adding PORT=10000 doesn't work, you can:
1. Revert to commit 5e603694 (the working July 31st version)
2. Re-deploy from that commit
3. Manually add back any code changes made since then

---

**Created**: [Current Date]  
**Incident Duration**: [Hours spent debugging]  
**Root Cause**: Missing PORT=10000 environment variable  
**Resolution**: Add PORT=10000 to Render environment variables