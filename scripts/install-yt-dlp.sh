#!/bin/bash

# Install yt-dlp for voice cloning service
# This script installs yt-dlp which is required for extracting audio from YouTube/SoundCloud

echo "Installing yt-dlp for voice cloning service..."

# Check if Python is installed
if ! command -v python3 &> /dev/null; then
    echo "Python 3 is required but not installed. Please install Python 3 first."
    exit 1
fi

# Check if pip is installed
if ! command -v pip3 &> /dev/null; then
    echo "pip3 is required but not installed. Please install pip3 first."
    exit 1
fi

# Install yt-dlp
echo "Installing yt-dlp..."
pip3 install --upgrade yt-dlp

# Verify installation
if command -v yt-dlp &> /dev/null; then
    echo "yt-dlp installed successfully!"
    echo "Version: $(yt-dlp --version)"
else
    echo "Failed to install yt-dlp. Please try installing manually:"
    echo "pip3 install yt-dlp"
    exit 1
fi

# Install ffmpeg if not already installed (required for audio processing)
if ! command -v ffmpeg &> /dev/null; then
    echo ""
    echo "ffmpeg is not installed. It's required for audio processing."
    echo "Please install ffmpeg:"
    echo ""
    echo "On macOS: brew install ffmpeg"
    echo "On Ubuntu/Debian: sudo apt-get install ffmpeg"
    echo "On CentOS/RHEL: sudo yum install ffmpeg"
fi

echo ""
echo "Installation complete!"