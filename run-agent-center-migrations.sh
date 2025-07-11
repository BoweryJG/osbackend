#!/bin/bash

# Run database migrations for Agent Command Center

echo "🚀 Running Agent Command Center database migrations..."

# Load environment variables
source .env

# Run each migration
echo "📊 Creating voices table..."
psql $DATABASE_URL < migrations/create_voices_table.sql

echo "📈 Creating metrics tables..."
psql $DATABASE_URL < migrations/create_metrics_tables.sql

echo "🎵 Creating audio clips table..."
psql $DATABASE_URL < migrations/create_audio_clips_table.sql

echo "🎓 Creating knowledge bank tables..."
psql $DATABASE_URL < migrations/create_knowledge_bank_tables.sql

echo "✅ All migrations completed successfully!"