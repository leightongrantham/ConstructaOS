#!/bin/bash

# Manual VTracer Setup Script
# Attempts to download pre-built WASM or provides instructions

set -e

echo "🔧 VTracer Manual Setup"
echo "======================"
echo ""

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m'

# Create public directory if it doesn't exist
mkdir -p public

# Check if Rust is installed
if command -v rustc &> /dev/null; then
    echo -e "${GREEN}✅ Rust is installed${NC}"
    echo "Running automated setup..."
    ./setup-vtracer.sh
    exit $?
fi

echo -e "${YELLOW}⚠️  Rust is not installed${NC}"
echo ""
echo "VTracer requires Rust to build. You have two options:"
echo ""
echo -e "${BLUE}Option 1: Install Rust and build VTracer${NC}"
echo "  1. Install Rust:"
echo "     curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh"
echo "     source ~/.cargo/env"
echo ""
echo "  2. Install wasm-pack:"
echo "     curl https://rustwasm.github.io/wasm-pack/installer/init.sh -sSf | sh"
echo ""
echo "  3. Run setup script:"
echo "     ./setup-vtracer.sh"
echo ""
echo -e "${BLUE}Option 2: Download pre-built WASM (if available)${NC}"
echo ""

# Try to find pre-built WASM files
echo "Checking for pre-built VTracer WASM files..."

# Check if vtracer directory exists with built files
if [ -d "vtracer/pkg" ] && [ -f "vtracer/pkg/vtracer_bg.wasm" ]; then
    echo -e "${GREEN}✅ Found existing VTracer build!${NC}"
    echo "Copying existing files..."
    cp vtracer/pkg/vtracer_bg.wasm public/vtracer.wasm
    cp vtracer/pkg/vtracer.js public/vtracer.js
    echo -e "${GREEN}✅ VTracer files copied to public/${NC}"
    exit 0
fi

# Check if files already exist in public
if [ -f "public/vtracer.wasm" ] && [ -f "public/vtracer.js" ]; then
    echo -e "${GREEN}✅ VTracer files already exist in public/${NC}"
    echo "Files:"
    ls -lh public/vtracer.*
    exit 0
fi

echo -e "${RED}❌ No pre-built files found${NC}"
echo ""
echo "To proceed, you need to:"
echo "1. Install Rust (see instructions above)"
echo "2. Build VTracer using: ./setup-vtracer.sh"
echo ""
echo "Or manually download VTracer WASM files if available from:"
echo "  https://github.com/visioncortex/vtracer/releases"
echo ""
exit 1

