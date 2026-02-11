# VTracer Setup Guide

VTracer is a modern alternative to Potrace for vectorization. It offers better color support and more efficient algorithms.

## Overview

VTracer converts raster images (PNG, JPEG) to vector graphics (SVG) using Rust-based algorithms compiled to WebAssembly. It can handle both binary and color images.

## Features

- **Color Support**: Unlike Potrace (binary-only), VTracer can process colored images
- **Efficient Algorithms**: O(n) complexity curve fitting
- **Corner-Preserving Smoothing**: Maintains sharp corners during smoothing
- **Compact Output**: Produces fewer shapes with stacking strategy

## Installation

### Option 1: Build VTracer WASM from Source

1. **Install Rust and wasm-pack**:
   ```bash
   # Install Rust (if not installed)
   curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
   
   # Install wasm-pack
   curl https://rustwasm.github.io/wasm-pack/installer/init.sh -sSf | sh
   ```

2. **Clone and Build VTracer**:
   ```bash
   git clone https://github.com/visioncortex/vtracer.git
   cd vtracer
   
   # Build WebAssembly target
   wasm-pack build --target web --out-dir pkg
   ```

3. **Copy WASM files to your project**:
   ```bash
   # Copy to public directory (or appropriate location)
   cp pkg/vtracer_bg.wasm /path/to/renderer-core/public/vtracer.wasm
   cp pkg/vtracer.js /path/to/renderer-core/public/vtracer.js
   ```

### Option 2: Use Pre-built WASM (if available)

Check the [VTracer releases](https://github.com/visioncortex/vtracer/releases) for pre-built WASM files.

### Option 3: Use CDN (if available)

If VTracer WASM is hosted on a CDN, use the CDN URLs directly.

## Configuration

### Basic Setup

In your HTML or JavaScript initialization:

```javascript
import { configureVTracer, runSandbox } from './sandbox.js';

// Configure VTracer WASM URLs
configureVTracer(
  '/vtracer.wasm',           // WASM file URL
  '/vtracer.js'              // Optional: JS loader/wrapper
);

// Use VTracer for vectorization
const result = await runSandbox(container, {
  imageData: myImageData,
  vectorizer: 'vtracer',     // Explicitly use VTracer
  // OR
  vectorizer: 'auto'         // Auto-select (VTracer preferred if configured)
});
```

### Configuration Options

VTracer supports various options:

```javascript
const result = await runSandbox(container, {
  imageData: myImageData,
  vectorizer: 'vtracer',
  vtracer: {
    colors: 8,                // Number of colors (default: 8)
    filterSpeckle: 4,         // Filter speckle size (default: 4)
    colorPrecision: 6,        // Color precision (default: 6)
    layerDifference: 16,      // Layer difference threshold (default: 16)
    cornerThreshold: 60,      // Corner threshold (default: 60)
    lengthThreshold: 4.0,     // Length threshold (default: 4.0)
    maxIterations: 10,        // Max iterations (default: 10)
    spliceThreshold: 45,      // Splice threshold (default: 45)
    pathPrecision: 8          // Path precision (default: 8)
  }
});
```

## Usage Examples

### Example 1: Basic Usage

```javascript
import { configureVTracer, sandboxVectorize } from './sandbox.js';

// Configure
configureVTracer('/vtracer.wasm', '/vtracer.js');

// Vectorize
const result = await sandboxVectorize(imageData, {
  vectorizer: 'vtracer'
});

console.log('Polylines:', result.polylines);
console.log('Dimensions:', result.width, 'x', result.height);
```

### Example 2: Auto-Selection (VTracer or Potrace)

```javascript
import { configureVTracer, configurePotrace, runSandbox } from './sandbox.js';

// Configure both (VTracer preferred when both are available)
configureVTracer('/vtracer.wasm');
configurePotrace('/potrace.wasm');

// Auto-select (will prefer VTracer)
const result = await runSandbox(container, {
  imageData: myImageData,
  vectorizer: 'auto'  // Tries VTracer first, falls back to Potrace
});
```

### Example 3: Explicit Fallback

```javascript
try {
  const result = await runSandbox(container, {
    imageData: myImageData,
    vectorizer: 'vtracer'  // Explicitly use VTracer
  });
} catch (error) {
  // Fallback to Potrace
  const result = await runSandbox(container, {
    imageData: myImageData,
    vectorizer: 'potrace'
  });
}
```

## API Reference

### `configureVTracer(wasmUrl, jsUrl?)`

Configure VTracer WASM module URLs.

**Parameters:**
- `wasmUrl` (string): URL to VTracer WASM file
- `jsUrl` (string, optional): URL to VTracer JS loader/wrapper

**Example:**
```javascript
configureVTracer('/vtracer.wasm', '/vtracer.js');
```

### `sandboxVectorize(imageData, options)`

Vectorize ImageData using the configured vectorizer.

**Parameters:**
- `imageData` (ImageData): Input image data
- `options` (object):
  - `vectorizer` (string): `'potrace'`, `'vtracer'`, or `'auto'` (default: `'auto'`)
  - `vtracer` (object): VTracer-specific options (see Configuration Options above)
  - `simplify` (object): Path simplification options

**Returns:**
- `Promise<{ polylines: Array, width: number, height: number }>`

## VTracer vs Potrace

| Feature | VTracer | Potrace |
|---------|---------|---------|
| Color Support | ✅ Yes | ❌ Binary only |
| Algorithm Complexity | O(n) | O(n²) |
| Corner Preservation | ✅ Yes | Partial |
| Output Size | Compact | Larger |
| Browser Support | WASM | WASM |
| Setup Complexity | Medium | Low |

## Troubleshooting

### Error: "VTracer WASM URL not configured"

**Solution**: Call `configureVTracer()` with the WASM file URL before using VTracer.

```javascript
configureVTracer('/vtracer.wasm');
```

### Error: "Failed to load VTracer WASM"

**Solutions**:
1. Verify the WASM file exists at the specified URL
2. Check CORS headers if loading from a different origin
3. Ensure the WASM file is compatible with the browser
4. Check browser console for detailed error messages

### VTracer returns empty SVG

**Possible causes**:
1. Input image is empty or invalid
2. Color threshold too strict
3. Filter settings too aggressive

**Solutions**:
- Adjust `colorPrecision` and `layerDifference` options
- Check input ImageData is valid
- Try different `colors` values

### Performance Issues

VTracer can be slower than Potrace for very large images. Consider:
- Reducing image dimensions before vectorization
- Adjusting `maxIterations` to limit processing time
- Using Potrace for simple binary images

## Integration with Pipeline

VTracer integrates seamlessly with the renderer-core pipeline:

```javascript
// Preprocess → Vectorize (VTracer) → Topology → Render
const result = await runSandbox(container, {
  imageData: preprocessedImage,
  vectorizer: 'vtracer',
  topology: {
    aiClean: false,
    // ... topology options
  }
});
```

The vectorized polylines are then processed by the topology cleanup modules (snap, merge, detect) just like Potrace output.

## References

- [VTracer GitHub](https://github.com/visioncortex/vtracer)
- [VTracer Documentation](https://www.visioncortex.org/vtracer-docs)
- [VTracer Web App](https://www.visioncortex.org/vtracer/)

