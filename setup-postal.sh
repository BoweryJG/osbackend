#!/bin/bash

echo "🚀 Setting up Postal Email Server for UNLIMITED emails!"
echo "=================================================="

# Check if Docker is installed
if ! command -v docker &> /dev/null; then
    echo "❌ Docker is not installed. Please install Docker Desktop first."
    echo "Visit: https://www.docker.com/products/docker-desktop"
    exit 1
fi

# Check if Docker is running
if ! docker info &> /dev/null; then
    echo "❌ Docker is not running. Please start Docker Desktop."
    exit 1
fi

echo "✅ Docker is installed and running"

# Start Postal
echo ""
echo "Starting Postal email server..."
docker-compose up -d

# Wait for services to start
echo ""
echo "Waiting for services to initialize..."
sleep 30

# Check if Postal is running
if docker ps | grep -q postal; then
    echo ""
    echo "✅ Postal is running!"
    echo ""
    echo "🎉 Setup Complete!"
    echo "=================="
    echo ""
    echo "Postal Web UI: http://localhost:5000"
    echo "Username: admin@repspheres.com"
    echo "Password: RepSpheres2024!"
    echo ""
    echo "Next steps:"
    echo "1. Visit http://localhost:5000"
    echo "2. Log in with the credentials above"
    echo "3. Create an organization 'RepSpheres'"
    echo "4. Add a mail server"
    echo "5. Get your API key"
    echo "6. Update .env with:"
    echo "   POSTAL_HOST=localhost"
    echo "   POSTAL_PORT=25"
    echo "   POSTAL_API_KEY=your-api-key"
    echo ""
    echo "Then you'll have UNLIMITED email sending!"
else
    echo "❌ Failed to start Postal. Check docker-compose logs:"
    echo "docker-compose logs"
fi