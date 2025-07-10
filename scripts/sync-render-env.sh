#!/bin/bash

# Sync environment variables with Render
# This script standardizes Supabase env vars across the codebase

echo "Syncing environment variables with Render..."

# Check if render CLI is logged in
if ! render whoami &>/dev/null; then
    echo "Please login to Render CLI first:"
    echo "Run: render login"
    exit 1
fi

# Get service ID
echo "Fetching your Render service..."
SERVICE_ID=$(render services -o json | jq -r '.[0].service.id')

if [ -z "$SERVICE_ID" ]; then
    echo "No service found. Please ensure you're in the correct workspace."
    exit 1
fi

echo "Found service: $SERVICE_ID"

# Read env vars from .env file
if [ ! -f ".env" ]; then
    echo "No .env file found"
    exit 1
fi

# Standardize Supabase env vars
echo "Setting Supabase environment variables..."

# Get values from .env
SUPABASE_URL=$(grep "^SUPABASE_URL=" .env | cut -d '=' -f2-)
SUPABASE_KEY=$(grep "^SUPABASE_KEY=" .env | cut -d '=' -f2-)
SUPABASE_STORAGE_BUCKET=$(grep "^SUPABASE_STORAGE_BUCKET=" .env | cut -d '=' -f2-)

# Set standardized env vars on Render
if [ -n "$SUPABASE_URL" ]; then
    echo "Setting SUPABASE_URL..."
    render env set SUPABASE_URL="$SUPABASE_URL" --service "$SERVICE_ID" --confirm
fi

if [ -n "$SUPABASE_KEY" ]; then
    echo "Setting SUPABASE_SERVICE_ROLE_KEY (from SUPABASE_KEY)..."
    render env set SUPABASE_SERVICE_ROLE_KEY="$SUPABASE_KEY" --service "$SERVICE_ID" --confirm
    
    # Also set SUPABASE_KEY for backward compatibility
    echo "Setting SUPABASE_KEY..."
    render env set SUPABASE_KEY="$SUPABASE_KEY" --service "$SERVICE_ID" --confirm
fi

if [ -n "$SUPABASE_STORAGE_BUCKET" ]; then
    echo "Setting SUPABASE_STORAGE_BUCKET..."
    render env set SUPABASE_STORAGE_BUCKET="$SUPABASE_STORAGE_BUCKET" --service "$SERVICE_ID" --confirm
fi

echo "Environment variables synced successfully!"
echo ""
echo "Note: Your codebase now supports both SUPABASE_KEY and SUPABASE_SERVICE_ROLE_KEY"
echo "for backward compatibility."