# Pipeline Debugging Guide

## Quick Debug Commands

### In Browser Console

After loading `index.html`, the debugging tools are available at `window.debugPipeline`:

```javascript
// Run full diagnostics
await window.debugPipeline.run()

// Check specific components
await window.debugPipeline.checkAI()
await window.debugPipeline.checkVectorizers()
await window.debugPipeline.checkOpenCV()

// Validate data structures
window.debugPipeline.validateImageData(myImageData)
window.debugPipeline.validateTopology(myTopology)
```

## Diagnostic Checks

### 1. AI Endpoint Check

```javascript
// Check if AI server is accessible
await window.debugPipeline.checkAI('http://localhost:3001/api/topology/ai-clean')
```

**What it checks:**
- Server connectivity
- Health endpoint response
- LLM configuration status
- API key availability

**Common issues:**
- ❌ "Failed to connect" → Server not running
- ⚠️ "LLM not enabled" → Server running but LLM disabled
- ⚠️ "API key not set" → LLM enabled but no API key configured

### 2. Vectorizer Check

```javascript
// Check vectorizer WASM files
await window.debugPipeline.checkVectorizers({
  potraceWasmUrl: '/potrace.wasm',
  vtracerWasmUrl: '/vtracer.wasm'
})
```

**What it checks:**
- WASM file accessibility
- File size
- HTTP status codes

**Common issues:**
- ❌ "File not accessible" → File missing or wrong path
- ❌ "Status 404" → File not found
- ⚠️ "URL not configured" → Not set up

### 3. OpenCV Check

```javascript
// Check OpenCV.js availability
await window.debugPipeline.checkOpenCV('/opencv.js')
```

**What it checks:**
- OpenCV.js file accessibility
- Content type validation
- File size

### 4. Data Validation

```javascript
// Validate ImageData
const imageDataValidation = window.debugPipeline.validateImageData(myImageData);
console.log(imageDataValidation);

// Validate Topology
const topologyValidation = window.debugPipeline.validateTopology(myTopology);
console.log(topologyValidation);
```

## Enhanced Error Logging

The pipeline now includes enhanced error logging that provides:

1. **Component Context**: Which part of the pipeline failed
2. **Error Details**: Full error message, stack trace, and context
3. **Troubleshooting Hints**: Specific suggestions based on error type

### Example Enhanced Errors

When AI cleaning fails, you'll see:

```
❌ AI cleaning failed: {
  message: "Failed to connect to AI endpoint: Network request failed",
  name: "TypeError",
  endpointUrl: "http://localhost:3001/api/topology/ai-clean",
  polylinesCount: 42,
  ...
}
   → Network error: Check if AI server is running and accessible
   → Try: curl http://localhost:3001/health
```

## Common Problems and Solutions

### Problem: "AI cleaning failed, falling back to deterministic processing"

**Diagnosis:**
```javascript
await window.debugPipeline.checkAI()
```

**Solutions:**

1. **Server not running:**
   ```bash
   cd server-ai
   npm start
   ```

2. **API key not set:**
   ```bash
   export OPENAI_API_KEY=sk-your-key-here
   export USE_LLM=true
   ```

3. **Wrong endpoint URL:**
   - Check `index.html` for `aiEndpointUrl`
   - Verify server is on correct port

4. **CORS issues:**
   - Check server CORS configuration
   - Verify request origin

### Problem: "No walls to render"

**Diagnosis:**
```javascript
// Check topology after processing
const validation = window.debugPipeline.validateTopology(result.topology);
console.log(validation);
```

**Solutions:**

1. **Check preprocessing:**
   - Verify ImageData is valid
   - Check threshold values
   - Ensure image has visible content

2. **Check vectorization:**
   - Verify polylines are generated
   - Check vectorizer configuration
   - Review path simplification settings

3. **Check topology processing:**
   - Verify cleanup parameters
   - Check minimum wall length
   - Review filtering thresholds

### Problem: "VTracer/Potrace WASM not found"

**Diagnosis:**
```javascript
await window.debugPipeline.checkVectorizers()
```

**Solutions:**

1. **Build WASM files:**
   ```bash
   # For VTracer
   ./setup-vtracer.sh
   
   # For Potrace
   # Download and place in public/ directory
   ```

2. **Update paths:**
   - Check `index.html` for WASM URLs
   - Verify files are in `public/` directory
   - Check file permissions

### Problem: "OpenCV.js not available"

**Diagnosis:**
```javascript
await window.debugPipeline.checkOpenCV()
```

**Solutions:**

1. **Download OpenCV.js:**
   ```bash
   curl -o public/opencv.js https://docs.opencv.org/4.x/opencv.js
   ```

2. **Check file path:**
   - Verify file is in `public/` directory
   - Check worker script paths

## Pipeline Flow Debugging

Add these checks at key points:

```javascript
// After preprocessing
const preprocessValidation = window.debugPipeline.validateImageData(preprocessed);
console.log('Preprocessing result:', preprocessValidation);

// After vectorization
console.log('Vectorization:', {
  polylineCount: vectorized.polylines.length,
  width: vectorized.width,
  height: vectorized.height
});

// After topology
const topologyValidation = window.debugPipeline.validateTopology(topology);
console.log('Topology result:', topologyValidation);

// Before rendering
if (!topology.walls || topology.walls.length === 0) {
  console.error('No walls to render!', {
    topology,
    validation: topologyValidation
  });
}
```

## Debugging in Code

### Import debugging utilities:

```javascript
import { 
  logWithContext,
  PipelineError,
  validateImageData,
  validateTopology 
} from './src/utils/debug-pipeline.js';

// Use enhanced logging
logWithContext('error', 'topology', 'Processing failed', { 
  pathsCount: paths.length,
  options 
});

// Use custom errors
throw new PipelineError('vectorization', 'WASM load failed', {
  wasmUrl,
  error: error.message
});

// Validate data
const validation = validateImageData(imageData);
if (!validation.isOk()) {
  console.error('Invalid ImageData:', validation.details);
}
```

## Automated Diagnostics

The HTML interface automatically runs diagnostics on load. To disable:

```javascript
// In index.html, comment out or remove:
setTimeout(async () => {
  await window.debugPipeline.run({...});
}, 1000);
```

## Manual Testing

### Test AI Endpoint Manually:

```bash
# Health check
curl http://localhost:3001/health

# Test AI endpoint
curl -X POST http://localhost:3001/api/topology/ai-clean \
  -H "Content-Type: application/json" \
  -H "X-Use-LLM: true" \
  -d '{
    "polylines": [[{"points": [[0,0],[100,0],[100,100],[0,100]]}]],
    "metadata": {"imageSize": [200, 200]}
  }'
```

### Test WASM Files:

```bash
# Check if files exist
ls -lh public/*.wasm

# Test accessibility
curl -I http://localhost:3000/potrace.wasm
curl -I http://localhost:3000/vtracer.wasm
```

## Performance Debugging

Add timing around operations:

```javascript
console.time('preprocessing');
const preprocessed = await sandboxPreprocess(imageData);
console.timeEnd('preprocessing');

console.time('vectorization');
const vectorized = await sandboxVectorize(preprocessed);
console.timeEnd('vectorization');

console.time('topology');
const topology = await sandboxTopology(vectorized);
console.timeEnd('topology');
```

## Getting Help

If diagnostics don't reveal the issue:

1. **Check browser console** for detailed error logs
2. **Review enhanced error messages** for troubleshooting hints
3. **Run full diagnostics** and share results
4. **Check server logs** if using AI endpoint
5. **Verify all dependencies** are correctly configured

