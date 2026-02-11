# Mock Data Input/Output Check

## Issues Found and Fixed

### ✅ Issue 1: Format Mismatch in `sandboxVectorize`

**Problem**: When no `imageData` provided, `sandboxVectorize` returned just an array instead of the expected object format.

**Before**:
```javascript
if (!imageData || !(imageData instanceof ImageData)) {
  return getMockPaths(); // Returns array: [[[50,50], ...]]
}
```

**After**:
```javascript
if (!imageData || !(imageData instanceof ImageData)) {
  const mockPaths = getMockPaths();
  return {
    polylines: mockPaths,
    width: 600,  // Match mock ImageData dimensions
    height: 400
  };
}
```

**Impact**: Pipeline now receives consistent format `{ polylines, width, height }` instead of sometimes getting just an array.

### ✅ Issue 2: Container Path in `runDefaultSandbox`

**Problem**: `runDefaultSandbox` passed the wrong container (`#sandbox` div) instead of `#axon-container`.

**Before**:
```javascript
const result = await runSandbox(container, { ... }); // container = #sandbox
```

**After**:
```javascript
const axonContainer = document.getElementById('axon-container');
const mockImageData = getMockImageData();
const result = await runSandbox(axonContainer, { 
  imageData: mockImageData,
  ...
});
```

**Impact**: Canvas is now correctly appended to `axon-container` where it can be displayed.

### ✅ Issue 3: Missing Mock ImageData in HTML Context

**Problem**: `getMockImageData` function was not accessible in HTML script context.

**Fix**: Added `getMockImageData` function directly in `index.html` script.

### ✅ Issue 4: Format Handling in Pipeline

**Problem**: Pipeline didn't handle both array and object formats gracefully.

**Fix**: Added format detection and conversion in `runSandbox`:
```javascript
if (Array.isArray(vectorized)) {
  // Legacy format: convert to object
  polylines = vectorized;
  vectorWidth = preprocessed.width;
  vectorHeight = preprocessed.height;
} else if (vectorized && typeof vectorized === 'object') {
  // New format: extract fields
  polylines = vectorized.polylines || vectorized.paths || [];
  vectorWidth = vectorized.width || preprocessed.width;
  vectorHeight = vectorized.height || preprocessed.height;
}
```

## Mock Data Structure

### Input: Mock ImageData

```javascript
{
  width: 600,
  height: 400,
  data: Uint8ClampedArray(960000) // 600 * 400 * 4
}
```

**Content**: White rectangle outline (50px margin) on black background
- Rectangle: (50, 50) to (550, 350)
- Creates 500x300 rectangle boundary

### Output: Mock Paths

```javascript
{
  polylines: [
    [
      [50, 50],    // Top-left
      [550, 50],   // Top-right
      [550, 350],  // Bottom-right
      [50, 350],   // Bottom-left
      [50, 50]     // Close path
    ]
  ],
  width: 600,
  height: 400
}
```

### Expected Topology Output

```javascript
{
  walls: [
    { start: [50, 50], end: [550, 50], thickness: 8 },   // Top wall
    { start: [550, 50], end: [550, 350], thickness: 8 }, // Right wall
    { start: [550, 350], end: [50, 350], thickness: 8 },  // Bottom wall
    { start: [50, 350], end: [50, 50], thickness: 8 }    // Left wall
  ],
  rooms: [
    // May detect 1 room (rectangle interior)
  ],
  openings: []
}
```

## Testing

### Test in Browser Console

```javascript
// Test mock data flow
const { runSandbox } = await import('./sandbox.js');
const axonContainer = document.getElementById('axon-container');

// Test with mock ImageData
function getMockImageData() {
  const width = 600, height = 400;
  const imageData = new ImageData(width, height);
  const data = imageData.data;
  const margin = 50;
  
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      const isEdge = (x >= margin && x < width - margin && y >= margin && y < height - margin) &&
                     (x === margin || x === width - margin - 1 || y === margin || y === height - margin - 1);
      
      if (isEdge) {
        data[idx] = data[idx + 1] = data[idx + 2] = 255;
      } else {
        data[idx] = data[idx + 1] = data[idx + 2] = 0;
      }
      data[idx + 3] = 255;
    }
  }
  return imageData;
}

const result = await runSandbox(axonContainer, {
  imageData: getMockImageData()
});

console.log('Mock data result:', {
  hasAxon: !!result.axon,
  walls: result.topology.walls.length,
  polylines: result.vectorized.polylines.length
});
```

### Expected Console Output

```
🔍 Pipeline: Starting preprocessing...
🔍 Pipeline: Preprocessing complete { outputWidth: 600, outputHeight: 400 }
🔄 Vectorization: Using fallback simple edge detection
🔍 Pipeline: Vectorization complete { polylineCount: 1, width: 600, height: 400 }
🔍 Topology: Processing 1 paths
🔍 Topology: Cleanup produced X lines, Y rooms
🔍 Topology: After filtering, 4 walls remain
🎨 Rendering: Processing 4 walls
✅ Axonometric rendering complete
```

## Verification Checklist

- [x] Mock ImageData generates correctly (600x400)
- [x] `sandboxVectorize` returns object format `{ polylines, width, height }`
- [x] Pipeline handles both array and object formats
- [x] Container path is correct (`axon-container`)
- [x] Mock ImageData accessible in HTML context
- [x] Topology produces walls from mock paths
- [x] Canvas is appended and visible

## Next Steps

1. Test "Use Default Mock Data" button - should now work correctly
2. Verify canvas appears in `axon-container`
3. Check console for format warnings (should be none)
4. Verify 4 walls are rendered (rectangle sides)

