#!/bin/bash

# Load environment variables from .env
if [ -f .env ]; then
  export $(cat .env | grep -v '^#' | xargs)
fi

# Also set the Deepgram key
export DEEPGRAM_API_KEY="493834398688f831e029c15cbdc676160f8e6a52"

# Run validation
node deployment/voice-feature-validation.js