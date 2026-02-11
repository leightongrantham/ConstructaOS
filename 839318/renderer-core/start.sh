#!/bin/bash
# Quick start script for renderer-core sandbox

echo "Starting Renderer Core Dev Server..."
echo ""
echo "The browser will open automatically at http://localhost:3000"
echo "Press Ctrl+C to stop the server"
echo ""

cd "$(dirname "$0")"
npm run dev
