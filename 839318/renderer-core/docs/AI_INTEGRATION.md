# AI Backend Integration Guide

This guide explains how to integrate the AI topology cleaning backend (`server-ai`) into the renderer-core application.

## Overview

The AI backend provides intelligent topology cleaning that:
- Extracts walls, rooms, and openings from polylines
- Classifies wall types (exterior, interior, structural, partition)
- Detects doors and windows
- Normalizes and cleans geometry
- Falls back to heuristic processing if AI is unavailable

## Architecture

```
┌─────────────────────┐
│   renderer-core     │
│   (Frontend)        │
└──────────┬──────────┘
           │
           │ HTTP POST
           │ /api/topology/ai-clean
           ▼
┌─────────────────────┐
│   server-ai         │
│   (Backend)         │
│   - Fastify server  │
│   - OpenAI API      │
│   - Rate limiting   │
│   - Telemetry       │
└─────────────────────┘
```

## Setup

### 1. Start the AI Backend Server

```bash
cd server-ai

# Set your OpenAI API key
export OPENAI_API_KEY=sk-your-key-here
export USE_LLM=true

# Start server
npm start
```

The server will start on `http://localhost:3001` by default.

### 2. Configure Renderer to Use AI

The renderer uses the `aiClean` function from `src/topology/ai-clean.js` which connects to the backend.

**Default endpoint:** `http://localhost:3001/api/topology/ai-clean`

You can override this by passing options:

```javascript
import { aiClean } from './src/topology/ai-clean.js';

const result = await aiClean(polylines, metadata, {
  endpointUrl: 'http://your-server:3001/api/topology/ai-clean',
  useLLM: true,
  preferDeterministic: false,
  timeout: 30000
});
```

## Integration Methods

### Method 1: Direct Function Call

Use the `aiClean` function directly in your code:

```javascript
import { aiClean } from './src/topology/ai-clean.js';

// Prepare polylines from your vectorized paths
const polylines = paths.map(path => ({
  points: path.points || path,
  closed: path.closed || false
}));

// Prepare metadata
const metadata = {
  imageSize: [width, height],
  pxToMeters: 0.01  // Optional: conversion factor
};

// Call AI cleaning
try {
  const result = await aiClean(polylines, metadata, {
    endpointUrl: 'http://localhost:3001/api/topology/ai-clean',
    useLLM: true
  });
  
  // Use the result
  console.log('Walls:', result.walls);
  console.log('Rooms:', result.rooms);
  console.log('Openings:', result.openings);
  
} catch (error) {
  console.error('AI cleaning failed:', error);
  // Fall back to heuristic processing
}
```

### Method 2: Integration in Renderer Pipeline

Update your renderer pipeline to use AI cleaning:

```javascript
// In your renderer class or pipeline
async processTopology(paths, imageSize) {
  // Convert paths to polylines format
  const polylines = paths.map(path => ({
    points: path.points || path,
    closed: path.closed || false
  }));
  
  // Prepare metadata
  const metadata = {
    imageSize: imageSize,
    pxToMeters: this.options.pxToMeters || 0.01
  };
  
  // Try AI cleaning if enabled
  if (this.options.useAI && this.options.aiEndpointUrl) {
    try {
      const { aiClean } = await import('./src/topology/ai-clean.js');
      const aiResult = await aiClean(polylines, metadata, {
        endpointUrl: this.options.aiEndpointUrl,
        useLLM: this.options.useLLM !== false,
        timeout: this.options.aiTimeout || 30000
      });
      
      // Convert AI result to your internal format
      return this.convertAIResultToTopology(aiResult);
      
    } catch (error) {
      console.warn('AI cleaning failed, using heuristic:', error);
      // Fall through to heuristic
    }
  }
  
  // Fallback to heuristic processing
  return this.processTopologyHeuristic(paths);
}

convertAIResultToTopology(aiResult) {
  return {
    walls: aiResult.walls.map(wall => ({
      start: wall.start,
      end: wall.end,
      thickness: wall.thickness,
      type: wall.type
    })),
    rooms: aiResult.rooms.map(room => ({
      polygon: room.polygon,
      area: room.area_m2
    })),
    openings: aiResult.openings.map(opening => ({
      wallId: opening.wallId,
      type: opening.type,
      position: opening.position
    })),
    meta: aiResult.meta
  };
}
```

### Method 3: Using Renderer Class

The `Renderer` class in `index.js` has partial AI integration. Update it:

```javascript
// In Renderer class
async processTopology(paths, options = {}) {
  const {
    useAI = false,
    aiEndpointUrl = 'http://localhost:3001/api/topology/ai-clean',
    useLLM = true,
    imageSize = [1920, 1080],
    pxToMeters = 0.01
  } = options;
  
  // Convert paths to polylines
  const polylines = paths.map(path => ({
    points: Array.isArray(path) ? path : (path.points || []),
    closed: path.closed || false
  }));
  
  // Try AI if enabled
  if (useAI && aiEndpointUrl) {
    try {
      const { aiClean } = await import('./src/topology/ai-clean.js');
      const result = await aiClean(polylines, {
        imageSize,
        pxToMeters
      }, {
        endpointUrl: aiEndpointUrl,
        useLLM,
        timeout: 30000
      });
      
      // Store result
      this.state.topology = result;
      this.state.walls = result.walls;
      
      return result;
      
    } catch (error) {
      console.warn('AI processing failed:', error);
      // Continue to heuristic fallback
    }
  }
  
  // Heuristic fallback
  // ... existing heuristic code ...
}
```

## Complete Integration Example

Here's a complete example showing how to integrate AI into a renderer workflow:

```javascript
import { aiClean } from './src/topology/ai-clean.js';

class TopologyProcessor {
  constructor(options = {}) {
    this.options = {
      aiEndpointUrl: options.aiEndpointUrl || 'http://localhost:3001/api/topology/ai-clean',
      useAI: options.useAI !== false,
      useLLM: options.useLLM !== false,
      pxToMeters: options.pxToMeters || 0.01,
      ...options
    };
  }
  
  /**
   * Process vectorized paths into clean topology
   */
  async process(paths, imageSize) {
    // Step 1: Convert paths to polylines format
    const polylines = this.pathsToPolylines(paths);
    
    // Step 2: Prepare metadata
    const metadata = {
      imageSize: imageSize,
      pxToMeters: this.options.pxToMeters
    };
    
    // Step 3: Try AI cleaning
    if (this.options.useAI) {
      try {
        const aiResult = await this.processWithAI(polylines, metadata);
        return this.formatResult(aiResult);
      } catch (error) {
        console.warn('AI processing failed, using heuristic:', error);
        // Fall through to heuristic
      }
    }
    
    // Step 4: Fallback to heuristic
    return this.processHeuristic(paths);
  }
  
  /**
   * Process with AI backend
   */
  async processWithAI(polylines, metadata) {
    return await aiClean(polylines, metadata, {
      endpointUrl: this.options.aiEndpointUrl,
      useLLM: this.options.useLLM,
      timeout: 30000,
      maxRetries: 2
    });
  }
  
  /**
   * Convert paths to polylines format
   */
  pathsToPolylines(paths) {
    return paths.map((path, index) => ({
      points: Array.isArray(path) ? path : (path.points || []),
      closed: path.closed !== undefined ? path.closed : false
    }));
  }
  
  /**
   * Format AI result for use in renderer
   */
  formatResult(aiResult) {
    return {
      walls: aiResult.walls || [],
      rooms: aiResult.rooms || [],
      openings: aiResult.openings || [],
      meta: aiResult.meta || {},
      source: 'ai'
    };
  }
  
  /**
   * Heuristic fallback processing
   */
  processHeuristic(paths) {
    // Your existing heuristic processing code
    // ...
    return {
      walls: [],
      rooms: [],
      openings: [],
      meta: {},
      source: 'heuristic'
    };
  }
}

// Usage
const processor = new TopologyProcessor({
  aiEndpointUrl: 'http://localhost:3001/api/topology/ai-clean',
  useAI: true,
  useLLM: true,
  pxToMeters: 0.01
});

const result = await processor.process(vectorizedPaths, [1920, 1080]);
```

## Integration in sandbox.js

Update `sandbox.js` to use the new `aiClean` function:

```javascript
// Replace the old cleanTopology/mockAIClean calls with:
import { aiClean } from './src/topology/ai-clean.js';

// In your processing function:
if (aiEndpointUrl) {
  try {
    // Convert paths to polylines
    const polylines = workingPaths.map(path => ({
      points: Array.isArray(path) ? path : path.points,
      closed: path.closed || false
    }));
    
    // Prepare metadata
    const metadata = {
      imageSize: [imageWidth, imageHeight],
      pxToMeters: pxToMeters || 0.01
    };
    
    // Call AI backend
    const result = await aiClean(polylines, metadata, {
      endpointUrl: aiEndpointUrl,
      useLLM: true,
      timeout: 30000
    });
    
    // Convert result back to your format
    return this.convertAIResult(result);
    
  } catch (error) {
    console.warn('AI cleaning failed:', error);
    // Fall through to heuristic
  }
}
```

## Configuration Options

### Environment Variables

Set these in your environment or `.env` file:

```bash
# AI Backend URL (if different from default)
AI_ENDPOINT_URL=http://localhost:3001/api/topology/ai-clean

# Whether to use AI (default: false)
USE_AI=true

# Whether to use LLM (default: true if AI enabled)
USE_LLM=true

# Pixels to meters conversion
PX_TO_METERS=0.01
```

### Runtime Options

Pass options when calling `aiClean`:

```javascript
const result = await aiClean(polylines, metadata, {
  // Endpoint URL
  endpointUrl: 'http://localhost:3001/api/topology/ai-clean',
  
  // Use LLM (true) or heuristic (false)
  useLLM: true,
  
  // Prefer deterministic heuristic
  preferDeterministic: false,
  
  // Request timeout (ms)
  timeout: 30000,
  
  // Max retries
  maxRetries: 2,
  
  // Additional headers
  headers: {
    'X-API-Key': 'your-api-key'
  }
});
```

## Error Handling

The `aiClean` function includes automatic retry logic:

- **Retries on:** 429 (rate limit), 5xx (server errors), timeouts, network errors
- **No retry on:** 400 (bad request), 401 (unauthorized), JSON parse errors
- **Exponential backoff:** Delays increase with each retry

Handle errors in your code:

```javascript
try {
  const result = await aiClean(polylines, metadata);
  // Use result
} catch (error) {
  if (error.message.includes('timeout')) {
    console.error('AI request timed out');
  } else if (error.message.includes('429')) {
    console.error('Rate limited, try again later');
  } else if (error.message.includes('401') || error.message.includes('403')) {
    console.error('Authentication failed');
  } else {
    console.error('AI processing failed:', error);
  }
  
  // Always have a fallback
  const heuristicResult = processHeuristic(polylines);
  return heuristicResult;
}
```

## Testing Integration

### 1. Test AI Backend is Running

```bash
curl http://localhost:3001/health | jq '.llm.enabled'
```

Should return `true` if AI is enabled.

### 2. Test Direct Integration

```javascript
import { aiClean } from './src/topology/ai-clean.js';

const polylines = [
  {
    points: [[0, 0], [10, 0], [10, 10], [0, 10]],
    closed: true
  }
];

const metadata = {
  imageSize: [1000, 1000],
  pxToMeters: 0.01
};

const result = await aiClean(polylines, metadata);
console.log('Result:', result);
```

### 3. Test in Renderer

```javascript
// In your renderer
const processor = new TopologyProcessor({
  useAI: true,
  aiEndpointUrl: 'http://localhost:3001/api/topology/ai-clean'
});

const result = await processor.process(paths, [1920, 1080]);
console.log('Walls:', result.walls.length);
console.log('Rooms:', result.rooms.length);
```

## Performance Considerations

### Latency

- **AI requests:** 1-4 seconds (depending on model and complexity)
- **Heuristic:** <100ms

### Caching

Consider caching AI results for identical inputs:

```javascript
const cache = new Map();

async function getCachedOrAI(polylines, metadata) {
  const key = JSON.stringify({ polylines, metadata });
  
  if (cache.has(key)) {
    return cache.get(key);
  }
  
  const result = await aiClean(polylines, metadata);
  cache.set(key, result);
  return result;
}
```

### Rate Limiting

The backend has rate limiting (default: 10 requests/minute). For high-volume usage:
- Use API key authentication for higher limits
- Implement request queuing
- Cache results when possible
- Use heuristic for simple cases

## Troubleshooting

### Connection Errors

**Error:** `Failed to connect to AI endpoint`

**Solutions:**
1. Verify server is running: `curl http://localhost:3001/health`
2. Check endpoint URL is correct
3. Check CORS settings if calling from browser
4. Verify network connectivity

### Authentication Errors

**Error:** `401 Unauthorized` or `403 Forbidden`

**Solutions:**
1. Check API key is set in backend: `export OPENAI_API_KEY=...`
2. Verify API key is valid
3. Check API key has credits

### Timeout Errors

**Error:** `AI endpoint request timed out`

**Solutions:**
1. Increase timeout: `{ timeout: 60000 }`
2. Check server logs for slow processing
3. Use faster model (gpt-4o-mini)
4. Reduce input complexity

### Rate Limit Errors

**Error:** `429 Too Many Requests`

**Solutions:**
1. Wait before retrying
2. Implement request queuing
3. Use API key for higher limits
4. Cache results

## Best Practices

1. **Always have a fallback:** Use heuristic processing when AI fails
2. **Handle errors gracefully:** Don't crash on AI failures
3. **Cache when possible:** Cache AI results for identical inputs
4. **Monitor performance:** Track latency and success rates
5. **Use appropriate model:** Use gpt-4o-mini for speed, gpt-4o for accuracy
6. **Set reasonable timeouts:** Don't wait forever for AI responses
7. **Log AI usage:** Track when AI is used vs heuristic
8. **Test fallback:** Ensure heuristic works when AI is unavailable

## Next Steps

- See [TESTING_WITH_AI.md](../server-ai/docs/TESTING_WITH_AI.md) for testing the backend
- See [AI_TOPOLOGY.md](../server-ai/docs/AI_TOPOLOGY.md) for architecture details
- See [OPERATION.md](../server-ai/docs/OPERATION.md) for operational procedures

