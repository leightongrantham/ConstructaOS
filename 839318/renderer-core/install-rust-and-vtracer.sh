#!/bin/bash

# One-command installer for Rust and VTracer
# This script installs Rust, wasm-pack, and builds VTracer

set -e

echo "🚀 Installing Rust and VTracer"
echo "=============================="
echo ""

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

# Check if Rust is already installed
if command -v rustc &> /dev/null; then
    echo -e "${GREEN}✅ Rust is already installed${NC}"
    rustc --version
else
    echo -e "${YELLOW}📦 Installing Rust...${NC}"
    echo "This may take a few minutes..."
    
    # Install Rust (non-interactive mode)
    curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y
    
    # Source cargo environment
    if [ -f "$HOME/.cargo/env" ]; then
        source "$HOME/.cargo/env"
        echo -e "${GREEN}✅ Rust installed successfully${NC}"
        rustc --version
    else
        echo -e "${RED}❌ Rust installation may have failed${NC}"
        echo "Please run manually: curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh"
        exit 1
    fi
fi

# Ensure cargo is in PATH
if [ -f "$HOME/.cargo/env" ]; then
    source "$HOME/.cargo/env"
fi

# Check if wasm-pack is installed
if command -v wasm-pack &> /dev/null; then
    echo -e "${GREEN}✅ wasm-pack is already installed${NC}"
    wasm-pack --version
else
    echo -e "${YELLOW}📦 Installing wasm-pack...${NC}"
    curl https://rustwasm.github.io/wasm-pack/installer/init.sh -sSf | sh
    
    # Source cargo environment again (wasm-pack installs to cargo)
    if [ -f "$HOME/.cargo/env" ]; then
        source "$HOME/.cargo/env"
    fi
    
    if command -v wasm-pack &> /dev/null; then
        echo -e "${GREEN}✅ wasm-pack installed successfully${NC}"
        wasm-pack --version
    else
        echo -e "${RED}❌ wasm-pack installation may have failed${NC}"
        echo "Please run manually: curl https://rustwasm.github.io/wasm-pack/installer/init.sh -sSf | sh"
        exit 1
    fi
fi

# Now build VTracer
echo ""
echo -e "${YELLOW}🔨 Building VTracer...${NC}"
cd "$(dirname "$0")"
./setup-vtracer.sh

echo ""
echo -e "${GREEN}✨ All done! VTracer is ready to use.${NC}"
echo ""
echo "Next steps:"
echo "1. Restart your dev server (if running)"
echo "2. Select 'VTracer' from the vectorizer dropdown in the UI"
echo "3. Process an image - VTracer will be used automatically"

