#!/bin/bash

# VTracer Setup Script
# Downloads and sets up VTracer WASM files for the renderer-core

set -e

echo "🔧 VTracer Setup Script"
echo "======================"
echo ""

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Check if Rust is installed
if ! command -v rustc &> /dev/null; then
    echo -e "${RED}❌ Rust is not installed${NC}"
    echo "Please install Rust first:"
    echo "  curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh"
    exit 1
fi

# Check if wasm-pack is installed
if ! command -v wasm-pack &> /dev/null; then
    echo -e "${YELLOW}⚠️  wasm-pack is not installed${NC}"
    echo "Installing wasm-pack..."
    curl https://rustwasm.github.io/wasm-pack/installer/init.sh -sSf | sh
fi

# Create public directory if it doesn't exist
mkdir -p public

# Clone VTracer repository
if [ ! -d "vtracer" ]; then
    echo -e "${GREEN}📥 Cloning VTracer repository...${NC}"
    git clone https://github.com/visioncortex/vtracer.git
else
    echo -e "${YELLOW}⚠️  VTracer directory already exists, skipping clone${NC}"
fi

# Build VTracer WASM
echo -e "${GREEN}🔨 Building VTracer WASM...${NC}"
cd vtracer/webapp

# Check if pkg directory exists and is recent
if [ -d "pkg" ] && [ -f "pkg/vtracer_webapp_bg.wasm" ]; then
    echo -e "${YELLOW}⚠️  pkg directory exists. Rebuilding...${NC}"
fi

# Build for web target
wasm-pack build --target web --out-dir pkg

# Check if build was successful
if [ ! -f "pkg/vtracer_webapp_bg.wasm" ]; then
    echo -e "${RED}❌ Build failed: vtracer_webapp_bg.wasm not found${NC}"
    exit 1
fi

# Copy files to public directory
echo -e "${GREEN}📋 Copying WASM files to public directory...${NC}"
cp pkg/vtracer_webapp_bg.wasm ../../public/vtracer.wasm
cp pkg/vtracer_webapp.js ../../public/vtracer.js

# Check if files were copied
if [ -f "../public/vtracer.wasm" ] && [ -f "../public/vtracer.js" ]; then
    echo -e "${GREEN}✅ VTracer setup complete!${NC}"
    echo ""
    echo "Files copied to:"
    echo "  - public/vtracer.wasm"
    echo "  - public/vtracer.js"
    echo ""
    echo "You can now use VTracer in the renderer-core."
else
    echo -e "${RED}❌ Failed to copy files${NC}"
    exit 1
fi

cd ..

# Cleanup (optional - comment out if you want to keep the vtracer directory)
# echo -e "${YELLOW}🧹 Cleaning up...${NC}"
# rm -rf vtracer

echo ""
echo -e "${GREEN}✨ Setup complete!${NC}"

