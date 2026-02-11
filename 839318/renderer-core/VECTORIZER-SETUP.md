# Vectorizer Setup Guide

## Error: "No vectorizer available"

The pipeline now requires a working vectorizer (Potrace or VTracer). If you see this error, you need to set up at least one vectorizer.

## Quick Solutions

### Option 1: Use VTracer (Recommended)

VTracer is easier to set up and supports color images:

```bash
cd /Users/leightongrantham/Freelance/constructaos-m1/839318/renderer-core
./setup-vtracer.sh
```

Then in the UI, select "VTracer" from the vectorizer dropdown.

### Option 2: Use Potrace

Potrace requires building from source or finding a pre-built WASM file:

1. **Download/Build Potrace WASM** (see `POTRACE-SETUP.md`)
2. **Place in public directory**:
   ```bash
   cp potrace.wasm public/potrace.wasm
   ```

3. **Select Potrace** in the UI dropdown

### Option 3: Configure Programmatically

```javascript
// For VTracer
import { configureVTracer } from './sandbox.js';
configureVTracer('/vtracer.wasm', '/vtracer.js');

// For Potrace
import { configurePotrace } from './sandbox.js';
configurePotrace('/potrace.wasm', '/potrace.js');
```

## Vectorizer Selection

The pipeline supports three modes:

- **Auto**: Tries VTracer first, then Potrace (if both configured)
- **VTracer**: Uses VTracer only (fails if not configured)
- **Potrace**: Uses Potrace only (fails if not configured)

### Current Configuration

Check what's configured:

```javascript
// In browser console
const { getPotraceConfig, getVTracerConfig } = await import('./sandbox.js');
console.log('Potrace:', getPotraceConfig());
console.log('VTracer:', getVTracerConfig());
```

### Check File Availability

```javascript
// In browser console
const check = async (url) => {
  try {
    const r = await fetch(url, { method: 'HEAD' });
    return r.ok ? '✅ Found' : '❌ Not found';
  } catch {
    return '❌ Not found';
  }
};

console.log('Potrace:', await check('/potrace.wasm'));
console.log('VTracer WASM:', await check('/vtracer.wasm'));
console.log('VTracer JS:', await check('/vtracer.js'));
```

## Recommended Setup

1. **Set up VTracer** (easiest):
   ```bash
   ./setup-vtracer.sh
   ```

2. **Set vectorizer to 'vtracer'** in UI or code:
   ```javascript
   await runSandbox(container, {
     vectorizer: 'vtracer',
     ...
   });
   ```

3. **Verify it works**: Check console for "✅ VTracer: Vectorization complete"

## Troubleshooting

### "VTracer WASM URL not configured"

**Solution**: Run `./setup-vtracer.sh` or configure manually:
```javascript
configureVTracer('/vtracer.wasm', '/vtracer.js');
```

### "Potrace WASM file not found"

**Solution**: Download/build `potrace.wasm` and place in `public/potrace.wasm`, or switch to VTracer.

### "No vectorizer available"

**Solution**: Set up at least one vectorizer:
- VTracer: `./setup-vtracer.sh`
- Potrace: Download `potrace.wasm` to `public/`

### "Vectorization quality threshold exceeded"

This means the vectorizer produced too many polylines (>500 by default). Possible causes:
- Poor input image quality
- Preprocessing failed
- Need to adjust vectorization parameters

**Solution**: 
- Check preprocessing output
- Adjust `maxPolylines` threshold:
  ```javascript
  await runSandbox(container, {
    maxPolylines: 1000,  // Increase threshold
    ...
  });
  ```

## File Locations

- **VTracer WASM**: `public/vtracer.wasm`
- **VTracer JS**: `public/vtracer.js`
- **Potrace WASM**: `public/potrace.wasm`

All files should be in the `public/` directory to be served by Vite.

