# Installing VTracer - Quick Guide

## Current Status

VTracer setup requires Rust to build from source. You have a few options:

## Option 1: Install Rust and Build (Recommended)

This is the most reliable way to get VTracer working:

### Step 1: Install Rust

```bash
# Install Rust (this will prompt for confirmation)
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh

# Activate Rust in current shell
source ~/.cargo/env

# Verify installation
rustc --version
```

### Step 2: Install wasm-pack

```bash
curl https://rustwasm.github.io/wasm-pack/installer/init.sh -sSf | sh
```

### Step 3: Run Setup Script

```bash
cd /Users/leightongrantham/Freelance/constructaos-m1/839318/renderer-core
./setup-vtracer.sh
```

This will:
- Clone the VTracer repository
- Build the WASM files
- Copy them to `public/vtracer.wasm` and `public/vtracer.js`

## Option 2: Check for Pre-built Files

You can check if someone has already built VTracer files:

```bash
cd /Users/leightongrantham/Freelance/constructaos-m1/839318/renderer-core

# Check if files exist
ls -la public/vtracer.*
ls -la vtracer/pkg/vtracer_bg.wasm
```

If files exist, copy them:
```bash
cp vtracer/pkg/vtracer_bg.wasm public/vtracer.wasm
cp vtracer/pkg/vtracer.js public/vtracer.js
```

## Option 3: Download from Releases (If Available)

Check the VTracer GitHub releases for pre-built WASM:
- https://github.com/visioncortex/vtracer/releases

Look for files ending in `.wasm` and `.js`.

## Option 4: Use Without VTracer (Fallback)

If you can't install Rust right now, you can:

1. **Use Potrace instead** (if you have `potrace.wasm`)
2. **Wait for Rust installation** to complete VTracer setup

## Quick Install Commands

If you want to install Rust now, run:

```bash
# Install Rust (interactive - follow prompts)
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh

# Activate Rust
source ~/.cargo/env

# Install wasm-pack
curl https://rustwasm.github.io/wasm-pack/installer/init.sh -sSf | sh

# Build VTracer
cd /Users/leightongrantham/Freelance/constructaos-m1/839318/renderer-core
./setup-vtracer.sh
```

## Verification

After setup, verify files exist:

```bash
ls -lh public/vtracer.wasm
ls -lh public/vtracer.js
```

Both files should be present. Then restart your dev server and select "VTracer" from the vectorizer dropdown.

## Troubleshooting

### "Rust is not installed"
- Follow Option 1 above to install Rust

### "wasm-pack is not installed"
- Install it: `curl https://rustwasm.github.io/wasm-pack/installer/init.sh -sSf | sh`

### "Build failed"
- Check Rust version: `rustc --version` (should be 1.70+)
- Update Rust: `rustup update`
- Check wasm-pack: `wasm-pack --version`

### "Files not copied"
- Manually copy:
  ```bash
  cp vtracer/pkg/vtracer_bg.wasm public/vtracer.wasm
  cp vtracer/pkg/vtracer.js public/vtracer.js
  ```

