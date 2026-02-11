# Mock Data Flow Analysis

## Overview

This document describes the mock data structure and how it flows through the pipeline.

## Mock Data Structure

### 1. Mock ImageData (`getMockImageData()`)

**Location**: `sandbox.js:72-102`

**Structure**:
- Dimensions: 600x400 pixels
- Content: White rectangle outline (wall) on black background
- Margin: 50 pixels from edges
- Format: `ImageData` object

**Visual Representation**:
```
┌─────────────────────────────────────┐
│  Black background (50px margin)     │
│  ┌───────────────────────────────┐ │
│  │ White rectangle outline       │ │
│  │ (wall boundary)               │ │
│  └───────────────────────────────┘ │
│  Black background (50px margin)     │
└─────────────────────────────────────┘
```

**Coordinates**:
- Rectangle: (50, 50) to (550, 350)
- Creates a 500x300 rectangle outline

### 2. Mock Paths (`getMockPaths()`)

**Location**: `sandbox.js:460-468`

**Structure**:
```javascript
[
  [
    [50, 50],    // Top-left corner
    [550, 50],   // Top-right corner
    [550, 350],  // Bottom-right corner
    [50, 350],   // Bottom-left corner
    [50, 50]     // Close path (back to start)
  ]
]
```

**Format**: Array of polylines, where each polyline is an array of `[x, y]` points.

**Note**: This matches the rectangle outline from `getMockImageData()`.

## Pipeline Flow

### Step 1: Preprocessing

**Input**: `ImageData` (mock or real)
**Function**: `sandboxPreprocess(imageData)`
**Output**: `ImageData` (binary mask)

**Mock Data Flow**:
- If `imageData` is `null` or invalid → Uses `getMockImageData()`
- Processes through OpenCV (if available) or simple thresholding
- Returns binary `ImageData` (600x400)

**Expected Output**:
- Valid `ImageData` with width=600, height=400
- Binary mask (black/white)

### Step 2: Vectorization

**Input**: `ImageData` (preprocessed)
**Function**: `sandboxVectorize(imageData, options)`
**Output**: `{ polylines: [...], width: number, height: number }`

**Mock Data Flow**:
- If `imageData` is `null` → Returns mock paths in correct format:
  ```javascript
  {
    polylines: [[[50,50], [550,50], [550,350], [50,350], [50,50]]],
    width: 600,
    height: 400
  }
  ```
- If `imageData` provided → Uses Potrace/VTracer or fallback edge detection
- Always returns object format (not just array)

**Expected Output**:
- Object with `polylines`, `width`, `height`
- At least one polyline (rectangle outline)

### Step 3: Topology Processing

**Input**: `{ polylines, width, height }` or array of paths
**Function**: `sandboxTopology(paths, options)`
**Output**: `{ walls: [...], rooms: [...], openings: [...] }`

**Mock Data Flow**:
- Accepts both formats:
  - Object: `{ polylines: [...] }`
  - Array: `[[[x,y], ...], ...]`
- If no paths provided → Uses `getMockPaths()`
- Processes through cleanup modules:
  - Snap to orthogonal
  - Merge parallel lines
  - Extract walls
- Returns topology object

**Expected Output**:
- `walls`: Array of `{ start: [x,y], end: [x,y], thickness: number }`
- `rooms`: Array of detected rooms (may be empty)
- `openings`: Array of openings (may be empty)

**For Mock Rectangle**:
- Should produce 4 walls (one per side)
- May detect 1 room (the rectangle interior)

### Step 4: Rendering

**Input**: `{ walls, rooms, openings }`
**Function**: `sandboxRenderAxon(container, topology, rough)`
**Output**: `HTMLCanvasElement`

**Mock Data Flow**:
- Creates canvas (800x600 default)
- Transforms walls using axonometric matrix
- Draws walls with thickness
- Appends canvas to container

**Expected Output**:
- Canvas element with rendered 2.5D view
- Canvas appended to `axon-container`
- Visible walls in axonometric projection

## Format Consistency Issues Fixed

### Issue 1: `sandboxVectorize` Return Format

**Problem**: When no `imageData` provided, returned array instead of object.

**Fix**: Now returns:
```javascript
{
  polylines: getMockPaths(),
  width: 600,
  height: 400
}
```

### Issue 2: Container Path

**Problem**: `runDefaultSandbox` passed wrong container.

**Fix**: Now passes `axon-container` directly to `runSandbox`.

### Issue 3: Mock ImageData in HTML

**Problem**: `getMockImageData` not accessible in HTML context.

**Fix**: Added `getMockImageData` function to HTML script.

## Testing Mock Data Flow

### In Browser Console

```javascript
// Test full pipeline with mock data
const { runSandbox } = await import('./sandbox.js');
const axonContainer = document.getElementById('axon-container');
const result = await runSandbox(axonContainer, {});

console.log('Result:', {
  hasAxon: !!result.axon,
  walls: result.topology.walls.length,
  polylines: result.vectorized.polylines.length
});
```

### Expected Results

**With Mock Data**:
- Preprocessing: ✅ 600x400 ImageData
- Vectorization: ✅ 1 polyline (rectangle)
- Topology: ✅ 4 walls (rectangle sides)
- Rendering: ✅ Canvas with 2.5D view

**Console Output**:
```
🔍 Pipeline: Starting preprocessing...
🔍 Pipeline: Preprocessing complete { outputWidth: 600, outputHeight: 400 }
🔍 Pipeline: Vectorization complete { polylineCount: 1, ... }
🔍 Pipeline: Topology complete { wallCount: 4, ... }
🎨 Rendering: Processing 4 walls
✅ Axonometric rendering complete
```

## Validation

### Input Validation

```javascript
// Validate mock ImageData
const mockImageData = getMockImageData();
console.assert(mockImageData.width === 600, 'Width should be 600');
console.assert(mockImageData.height === 400, 'Height should be 400');
console.assert(mockImageData.data.length === 600 * 400 * 4, 'Data length should match');
```

### Output Validation

```javascript
// Validate topology output
const topology = await sandboxTopology({ polylines: getMockPaths() });
console.assert(Array.isArray(topology.walls), 'Walls should be array');
console.assert(topology.walls.length > 0, 'Should have at least one wall');
console.assert(topology.walls[0].start, 'Wall should have start point');
console.assert(topology.walls[0].end, 'Wall should have end point');
```

## Common Issues

### Issue: "No walls to render"

**Cause**: Topology processing failed or produced empty walls array.

**Check**:
1. Verify polylines are generated: `console.log(vectorized.polylines)`
2. Check topology processing: `console.log(topology)`
3. Verify wall extraction: `console.log(topology.walls)`

### Issue: "Vectorization returned array instead of object"

**Cause**: Legacy format or fallback path used.

**Fix**: `sandboxVectorize` now always returns object format.

### Issue: "Canvas not visible"

**Cause**: Container not found or canvas not appended.

**Check**:
1. Verify container exists: `document.getElementById('axon-container')`
2. Check canvas in DOM: `result.axon.parentNode`
3. Verify visibility: `result.axon.style.display`

## Debugging

Use the test script:

```javascript
// Load test script
import('./test-mock-data.js').then(({ testMockDataFlow }) => {
  testMockDataFlow();
});
```

Or use browser console:

```javascript
// Quick check
const { sandboxPreprocess, sandboxVectorize, sandboxTopology } = await import('./sandbox.js');
const mockImageData = getMockImageData();
const preprocessed = await sandboxPreprocess(mockImageData);
const vectorized = await sandboxVectorize(preprocessed);
const topology = await sandboxTopology(vectorized);
console.log('Mock data flow:', { preprocessed, vectorized, topology });
```

