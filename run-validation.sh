#!/bin/bash

# Load environment variables from .env
if [ -f .env ]; then
  export $(cat .env | grep -v '^#' | xargs)
fi

# Run validation
node deployment/voice-feature-validation.js