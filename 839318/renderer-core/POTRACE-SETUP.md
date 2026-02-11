# Potrace WASM Setup Guide

## Error: "Failed to load Potrace WASM"

If you see this error:
```
Failed to load Potrace WASM from /potrace.wasm: WebAssembly.instantiate(): 
expected magic word 00 61 73 6d, found 3c 21 44 4f
```

This means the Potrace WASM file doesn't exist at `/potrace.wasm` and the server is returning an HTML 404 page instead.

## Solution

### Option 1: Download Potrace WASM (Recommended)

Potrace WASM files are not commonly available as pre-built downloads. You'll need to build them from source or use an alternative.

**Note**: The pipeline will automatically fall back to simple edge detection if Potrace WASM is not available. This works but may produce less accurate results.

### Option 2: Use Simple Edge Detection (Current Fallback)

The pipeline already falls back to simple edge detection when Potrace is unavailable. This works for basic cases but:
- Less accurate than Potrace
- May miss some details
- Suitable for simple sketches

**No action needed** - the fallback is automatic.

### Option 3: Use VTracer Instead

VTracer is a modern alternative to Potrace with better color support:

```bash
./setup-vtracer.sh
```

Then select "VTracer" in the vectorizer dropdown.

### Option 4: Build Potrace WASM (Advanced)

If you need Potrace specifically:

1. **Install Emscripten**:
   ```bash
   git clone https://github.com/emscripten-core/emsdk.git
   cd emsdk
   ./emsdk install latest
   ./emsdk activate latest
   source ./emsdk_env.sh
   ```

2. **Build Potrace**:
   ```bash
   git clone https://gitlab.com/potrace/potrace.git
   cd potrace
   # Configure for WASM build
   emconfigure ./configure
   emmake make
   # Potrace WASM build is complex - may need custom build script
   ```

3. **Copy to public/**: Place `potrace.wasm` in `public/potrace.wasm`

**Note**: Potrace WASM builds are not officially supported and may require significant setup.

## Current Status

✅ **Fallback Working**: Simple edge detection is active and working
⚠️ **Potrace Missing**: Potrace WASM file not found (expected if not installed)
✅ **Pipeline Functional**: Full pipeline works with fallback vectorization

## Verification

Check if Potrace is available:

```javascript
// In browser console
fetch('/potrace.wasm', { method: 'HEAD' })
  .then(r => console.log('Potrace WASM:', r.ok ? 'Found' : 'Not found'))
  .catch(() => console.log('Potrace WASM: Not found'));
```

## Recommendation

For most use cases, **the simple edge detection fallback is sufficient**. If you need higher quality vectorization:

1. **Use VTracer** (recommended): Better quality, color support, easier setup
2. **Keep using fallback**: Works for simple sketches
3. **Build Potrace**: Only if you specifically need Potrace compatibility

The error you're seeing is **informational** - the pipeline continues to work with the fallback.

