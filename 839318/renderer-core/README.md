# Renderer Core

Core rendering engine for processing and rendering architectural drawings. Converts rough sketch images into 2.5D axonometric views.

## Quick Start

```bash
# Install dependencies
npm install

# Start dev server
npm run dev

# Browser opens automatically at http://localhost:3000
```

**Important:** You must use a web server (not open HTML directly) due to ES module CORS restrictions. See `START-HERE.md` for detailed instructions.

## Features

- **Image Processing**: Convert sketches/images to vector geometry
- **Dual Vectorization**: Support for both Potrace and VTracer (auto-select or manual)
- **Topology Cleanup**: Snap to orthogonal, merge parallel lines, detect walls
- **2.5D Rendering**: Generate axonometric views using Paper.js
- **Deterministic**: Same input always produces same output

## Project Structure

### Preprocess
- `opencv-clean.js` - Image cleaning and noise removal
- `opencv-transform.js` - Geometric transformations
- `threshold.js` - Image thresholding operations
- `vector-guide-detect.js` - Vector guide and grid detection

### Vectorize
- `potrace.js` - Raster to vector conversion (Potrace WASM)
- `vtracer.js` - Modern raster to vector conversion (VTracer WASM, supports color images)
- `simplify-paths.js` - Path simplification algorithms

### Topology
- `ai-clean.js` - AI-powered topology cleaning
- `snap-orthogonal.js` - Orthogonal snapping
- `merge-parallel.js` - Parallel line merging
- `wall-detection.js` - Wall detection and extraction

### Render
- `axon.js` - Axonometric view rendering (2.5D)
- `plan.js` - Plan view rendering (2D)
- `section.js` - Section view rendering (2D slice)
- `style.js` - Rendering styles and themes
- `export.js` - Export to various formats

### Utils
- `geom.js` - Geometry utilities
- `matrix.js` - Transformation matrices
- `timing.js` - Performance measurement
- `debug.js` - Debugging utilities

## Usage

### Browser (Sandbox)
```html
<!-- See index.html for complete example -->
<script type="module">
  import { runSandbox } from './sandbox.js';
  const result = await runSandbox(container);
</script>
```

### Programmatic
```javascript
import { Renderer } from './index.js';

const renderer = new Renderer();
const result = await renderer.render(imageFile, {
  preprocess: { /* options */ },
  vectorize: { /* options */ },
  topology: { /* options */ },
  axon: { /* options */ }
});

// result.axon contains the rendered 2.5D view
```

## Testing

```bash
# Run unit tests
npm test

# Start dev server for manual testing
npm run dev
```

## AI Integration

The renderer supports AI-powered topology cleaning via the `server-ai` backend.

**Quick Start:**
```bash
# 1. Start AI backend
cd server-ai
export OPENAI_API_KEY=sk-your-key
export USE_LLM=true
npm start

# 2. Use in your code
import { Renderer } from './index.js';
const renderer = new Renderer({
  aiEndpointUrl: 'http://localhost:3001/api/topology/ai-clean'
});

const result = await renderer.render(imageFile, {
  topology: { aiClean: true }
});
```

See `docs/AI_INTEGRATION.md` for complete integration guide.

## Documentation

- `START-HERE.md` - Complete setup and testing guide
- `sandbox.js` - Sandbox renderer for testing without external dependencies
- `index.js` - Main Renderer class for production use
- `docs/AI_INTEGRATION.md` - Guide for integrating AI backend into renderer
- `docs/QUICK_START_AI.md` - Quick start guide for AI integration
- `examples/ai-integration-example.js` - Complete code examples
- `server-ai/README.md` - AI backend server documentation

