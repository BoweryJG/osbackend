#!/bin/bash

echo "🚀 Starting Voice Implementation Orchestrator"
echo "============================================"
echo ""
echo "This will deploy 6 parallel agents to implement:"
echo "  ✓ Two-way voice conversations"
echo "  ✓ WebRTC audio pipeline"
echo "  ✓ Twilio whisper coaching"
echo "  ✓ Real-time call analysis"
echo ""
echo "Estimated time: 8 hours"
echo ""

# Create necessary directories
mkdir -p agents deployment/voice-implementation tests logs

# Create shared state file
cat > agents/shared-state.json << EOF
{
  "agents": {},
  "checkpoints": {
    "2-hour": { "status": "pending", "criteria": ["all-agents-started", "no-compile-errors"] },
    "4-hour": { "status": "pending", "criteria": ["core-flow-complete", "unit-tests-pass"] },
    "6-hour": { "status": "pending", "criteria": ["integration-working", "whisper-tested"] }
  },
  "errors": [],
  "blockers": []
}
EOF

# Check if all required services are available
echo "Checking prerequisites..."
if [ -z "$DEEPGRAM_API_KEY" ]; then
  echo "⚠️  Warning: DEEPGRAM_API_KEY not set. Voice transcription will not work."
fi

if [ -z "$ELEVENLABS_API_KEY" ]; then
  echo "⚠️  Warning: ELEVENLABS_API_KEY not set. Text-to-speech will not work."
fi

if [ -z "$TWILIO_AUTH_TOKEN" ]; then
  echo "⚠️  Warning: TWILIO_AUTH_TOKEN not set. Whisper coaching will not work."
fi

echo ""
echo "Starting orchestrator..."

# Start the orchestrator
node voice-implementation-orchestrator.js 2>&1 | tee logs/orchestrator-$(date +%Y%m%d-%H%M%S).log