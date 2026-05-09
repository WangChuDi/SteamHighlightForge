#!/bin/bash

echo "=== Steam Highlight Forge - Quick Start ==="
echo ""

# Check FFmpeg
if ! command -v ffmpeg &> /dev/null; then
    echo "❌ FFmpeg not found. Please install FFmpeg first:"
    echo "   Ubuntu/Debian: sudo apt install ffmpeg"
    echo "   macOS: brew install ffmpeg"
    echo "   Windows: Download from https://ffmpeg.org/download.html"
    exit 1
fi

echo "✓ FFmpeg found"

# Check Python
if ! command -v python3 &> /dev/null; then
    echo "❌ Python 3 not found. Please install Python 3.9+"
    exit 1
fi

echo "✓ Python 3 found"

# Install dependencies
echo ""
echo "Installing dependencies..."
pip3 install -r requirements.txt

# List available timelines
echo ""
echo "=== Available Timelines ==="
python3 -m steam_highlight_forge.cli list-timelines

echo ""
echo "=== Quick Start Commands ==="
echo ""
echo "1. List all timelines:"
echo "   python3 -m steam_highlight_forge.cli list-timelines"
echo ""
echo "2. View rounds in a timeline:"
echo "   python3 -m steam_highlight_forge.cli list-rounds <timeline>"
echo ""
echo "3. Export highlights (kills + multi-kills):"
echo "   python3 -m steam_highlight_forge.cli export <timeline>"
echo ""
echo "4. Export specific round:"
echo "   python3 -m steam_highlight_forge.cli export <timeline> --round 5"
echo ""
echo "5. Export all highlight types:"
echo "   python3 -m steam_highlight_forge.cli export <timeline> -t all"
echo ""
echo "6. Export kill streaks:"
echo "   python3 -m steam_highlight_forge.cli export-streaks <timeline> --min-kills 3"
echo ""
echo "See README.md and EXAMPLES.md for more details!"
