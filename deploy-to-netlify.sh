#!/bin/bash

# Deploy to Netlify Script
# This script helps deploy the frontend connector to Netlify

echo "Preparing to deploy frontend connector to Netlify..."

# Check if Netlify CLI is installed
if ! command -v netlify &> /dev/null; then
    echo "Netlify CLI not found. Installing..."
    npm install -g netlify-cli
fi

# Create a temporary directory for deployment
mkdir -p netlify-deploy
cp frontend-connector.html netlify-deploy/index.html

# Create a netlify.toml file with configuration
cat > netlify-deploy/netlify.toml << EOL
[build]
  publish = "."

[[redirects]]
  from = "/*"
  to = "/index.html"
  status = 200
EOL

# Navigate to the deployment directory
cd netlify-deploy

# Initialize Netlify site
echo "Initializing Netlify site..."
netlify init

# Deploy to Netlify
echo "Deploying to Netlify..."
netlify deploy --prod

echo "Deployment complete!"
echo "Your frontend is now connected to the backend at https://osbackend-zl1h.onrender.com"
echo "You can update the backend URL in the deployed HTML file if needed."

# Clean up
cd ..
echo "Cleaning up temporary files..."
# Uncomment the line below to remove the temporary directory after deployment
# rm -rf netlify-deploy

echo "Done!"
