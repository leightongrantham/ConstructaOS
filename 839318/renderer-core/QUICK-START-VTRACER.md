# Quick Start: VTracer Integration

## Setup VTracer WASM

### Option 1: Automated Setup (Recommended)

```bash
# Run the setup script
./setup-vtracer.sh
```

This script will:
1. Check for Rust and wasm-pack
2. Clone VTracer repository
3. Build WASM files
4. Copy to `public/` directory

### Option 2: Manual Setup

```bash
# 1. Install Rust (if not installed)
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh

# 2. Install wasm-pack
curl https://rustwasm.github.io/wasm-pack/installer/init.sh -sSf | sh

# 3. Clone and build VTracer
git clone https://github.com/visioncortex/vtracer.git
cd vtracer
wasm-pack build --target web --out-dir pkg

# 4. Copy to public directory
cp pkg/vtracer_bg.wasm ../public/vtracer.wasm
cp pkg/vtracer.js ../public/vtracer.js
```

## Usage in HTML

The HTML interface (`index.html`) automatically configures VTracer if the WASM files are present in the `public/` directory.

**Vectorizer Selection:**
- **Auto**: Tries VTracer first, falls back to Potrace
- **VTracer**: Use VTracer only (requires WASM files)
- **Potrace**: Use Potrace only

## Usage in Code

### Basic Usage

```javascript
import { configureVTracer, runSandbox } from './sandbox.js';

// Configure VTracer
configureVTracer('/vtracer.wasm', '/vtracer.js');

// Use VTracer
const result = await runSandbox(container, {
  imageData: myImageData,
  vectorizer: 'vtracer'
});
```

### Auto-Selection

```javascript
import { configureVTracer, configurePotrace, runSandbox } from './sandbox.js';

// Configure both
configureVTracer('/vtracer.wasm');
configurePotrace('/potrace.wasm');

// Auto-select (prefers VTracer)
const result = await runSandbox(container, {
  imageData: myImageData,
  vectorizer: 'auto' // Tries VTracer first, falls back to Potrace
});
```

### With Options

```javascript
const result = await runSandbox(container, {
  imageData: myImageData,
  vectorizer: 'vtracer',
  vtracer: {
    colors: 8,              // Number of colors
    filterSpeckle: 4,      // Filter speckle size
    colorPrecision: 6,     // Color precision
    cornerThreshold: 60,  // Corner threshold
    // ... more options
  }
});
```

## Renderer Class Usage

```javascript
import { Renderer } from './index.js';

const renderer = new Renderer({
  vtracerWasmUrl: '/vtracer.wasm',
  vtracerJsUrl: '/vtracer.js',
  vectorizer: 'auto' // or 'vtracer' or 'potrace'
});

const result = await renderer.render(imageFile, {
  vectorize: {
    vectorizer: 'vtracer',
    vtracer: {
      colors: 8,
      // ... options
    }
  }
});
```

## VTracer vs Potrace

| Feature | VTracer | Potrace |
|---------|---------|---------|
| Color Support | ✅ Yes | ❌ Binary only |
| Speed | Fast (O(n)) | Slower (O(n²)) |
| Output Quality | High | Good |
| Setup | Requires build | Simple |
| Best For | Color images, modern workflows | Binary images, simple setup |

## Troubleshooting

### "VTracer WASM URL not configured"

**Solution**: Ensure VTracer WASM files are in `public/` directory and paths are correct in `index.html`:

```javascript
const vtracerWasmUrl = '/vtracer.wasm';
const vtracerJsUrl = '/vtracer.js';
```

### "Failed to load VTracer WASM"

**Solutions**:
1. Check file exists: `ls public/vtracer.wasm`
2. Check CORS if loading from different origin
3. Check browser console for detailed errors
4. Verify WASM file is valid (try loading in browser)

### Build Errors

If `wasm-pack build` fails:
1. Ensure Rust is up to date: `rustup update`
2. Ensure wasm-pack is up to date: `wasm-pack self update`
3. Check VTracer repository for build requirements

## Next Steps

- See `VTRACER-SETUP.md` for detailed documentation
- See `index.html` for UI integration example
- See `sandbox.js` for programmatic usage

