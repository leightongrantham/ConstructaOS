# AI Topology Cleaning Architecture

This document describes the architecture, data contracts, prompts, and debugging procedures for the AI-powered topology cleaning system.

## Architecture Overview

```
┌─────────────────┐
│   Client App    │
│  (renderer-core)│
└────────┬────────┘
         │ HTTP POST
         │ /api/topology/ai-clean
         ▼
┌─────────────────────────────────────┐
│         server-ai                   │
│                                     │
│  ┌─────────────────────────────┐  │
│  │  Request Validation          │  │
│  │  (JSON Schema)               │  │
│  └───────────┬───────────────────┘  │
│              │                       │
│  ┌───────────▼───────────────────┐  │
│  │  Rate Limiting               │  │
│  │  (Token Bucket)              │  │
│  └───────────┬───────────────────┘  │
│              │                       │
│  ┌───────────▼───────────────────┐  │
│  │  LLM Processing              │  │
│  │  ┌─────────────────────────┐ │  │
│  │  │ 1. Build Prompt          │ │  │
│  │  │ 2. Call OpenAI API       │ │  │
│  │  │ 3. Parse JSON Response   │ │  │
│  │  │ 4. Validate Schema       │ │  │
│  │  │ 5. Retry on Failure      │ │  │
│  │  └─────────────────────────┘ │  │
│  └───────────┬───────────────────┘  │
│              │                       │
│  ┌───────────▼───────────────────┐  │
│  │  Output Validation            │  │
│  │  (JSON Schema)                │  │
│  └───────────┬───────────────────┘  │
│              │                       │
│  ┌───────────▼───────────────────┐  │
│  │  Telemetry Recording          │  │
│  │  (Metrics, Logs)              │  │
│  └───────────┬───────────────────┘  │
│              │                       │
└──────────────┼───────────────────────┘
               │
               ▼
         ┌──────────┐
         │ Response │
         │ (JSON)   │
         └──────────┘
```

### Components

1. **Request Handler** (`server.js`)
   - Validates input using JSON Schema
   - Handles rate limiting
   - Routes to LLM or heuristic processing
   - Validates output
   - Records telemetry

2. **LLM Module** (`lib/llm.js`)
   - OpenAI API client
   - Retry logic with exponential backoff
   - Timeout handling
   - Token usage tracking

3. **Topology Cleaner** (`server.js:cleanTopologyWithLLM`)
   - Prompt construction
   - Response parsing
   - Schema validation
   - Repair/retry logic

4. **Heuristic Fallback** (`server.js:mockClean`)
   - Deterministic mock response
   - Used when LLM is disabled or fails
   - Creates bounding box walls and rooms

## Data Contracts

### Input Schema

**Endpoint:** `POST /api/topology/ai-clean`

**Request Body:**
```json
{
  "polylines": [
    {
      "points": [[x, y], [x, y], ...],
      "closed": boolean
    }
  ],
  "metadata": {
    "imageSize": [width, height],
    "pxToMeters": number  // optional
  }
}
```

**Field Descriptions:**

- `polylines` (required, array)
  - Array of polyline objects
  - Each polyline has:
    - `points`: Array of [x, y] coordinate pairs (min 2 points)
    - `closed`: Boolean indicating if polyline forms a closed polygon

- `metadata` (required, object)
  - `imageSize` (required): [width, height] in pixels
  - `pxToMeters` (optional): Conversion factor from pixels to meters (must be > 0)

**Example Input:**
```json
{
  "polylines": [
    {
      "points": [[0, 0], [10, 0], [10, 10], [0, 10]],
      "closed": true
    },
    {
      "points": [[5, 5], [15, 5], [15, 15]],
      "closed": false
    }
  ],
  "metadata": {
    "imageSize": [1920, 1080],
    "pxToMeters": 0.01
  }
}
```

### Output Schema

**Response Body:**
```json
{
  "walls": [
    {
      "id": "wall-1",
      "start": [x, y],
      "end": [x, y],
      "thickness": 0.25,
      "type": "exterior" | "interior" | "structural" | "partition"
    }
  ],
  "rooms": [
    {
      "id": "room-1",
      "polygon": [[x, y], [x, y], ...],
      "area_m2": 15.5
    }
  ],
  "openings": [
    {
      "id": "opening-1",
      "wallId": "wall-1",
      "type": "door" | "window" | "opening",
      "position": 0.5
    }
  ],
  "meta": {
    "scale": 0.01,
    "bounds": {
      "minX": 0,
      "maxX": 10.5,
      "minY": 0,
      "maxY": 8.2
    }
  }
}
```

**Field Descriptions:**

- `walls` (required, array)
  - `id`: Unique string identifier
  - `start`: [x, y] start point in meters
  - `end`: [x, y] end point in meters
  - `thickness`: Wall thickness in meters (must be > 0)
  - `type`: One of: "exterior", "interior", "structural", "partition"

- `rooms` (required, array)
  - `id`: Unique string identifier
  - `polygon`: Array of [x, y] points forming closed boundary (min 3 points)
  - `area_m2`: Room area in square meters

- `openings` (required, array)
  - `id`: Unique string identifier
  - `wallId`: Reference to wall ID
  - `type`: One of: "door", "window", "opening"
  - `position`: Position along wall (0.0 = start, 1.0 = end)

- `meta` (required, object)
  - `scale`: Pixels to meters conversion factor
  - `bounds`: Bounding box {minX, maxX, minY, maxY}

**Example Output:**
```json
{
  "walls": [
    {
      "id": "wall-1",
      "start": [0, 0],
      "end": [10, 0],
      "thickness": 0.25,
      "type": "exterior"
    },
    {
      "id": "wall-2",
      "start": [10, 0],
      "end": [10, 10],
      "thickness": 0.25,
      "type": "exterior"
    }
  ],
  "rooms": [
    {
      "id": "room-1",
      "polygon": [[0, 0], [10, 0], [10, 10], [0, 10]],
      "area_m2": 100.0
    }
  ],
  "openings": [
    {
      "id": "opening-1",
      "wallId": "wall-1",
      "type": "door",
      "position": 0.5
    }
  ],
  "meta": {
    "scale": 0.01,
    "bounds": {
      "minX": 0,
      "maxX": 10,
      "minY": 0,
      "maxY": 10
    }
  }
}
```

## Prompt Engineering

### System Prompt

The system prompt (`prompts/topology.system.txt`) defines the AI's role and processing rules:

**Key Instructions:**
1. **Output Format**: Must output ONLY valid JSON, no markdown or explanatory text
2. **Angle Snapping**: Snap angles to 90° or 45° increments (within 5° tolerance)
3. **Wall Merging**: Merge parallel walls within 0.1m, remove duplicates
4. **Wall Classification**: Classify as exterior/interior/structural/partition
5. **Room Detection**: Identify closed polygons, minimum 2.0 m² area
6. **Opening Detection**: Identify doors/windows along walls
7. **Normalization**: Translate coordinates so minX=0, minY=0
8. **Deterministic**: Same input must produce same output

### User Prompt Template

The user prompt (`prompts/topology.user.template.txt`) is populated with actual data:

```
Analyze the following architectural polylines and extract the building topology.

POLYLINES:
{{POLYLINES_JSON}}

METADATA:
{{METADATA_JSON}}

Extract walls, rooms, and openings according to the rules. Output only the JSON response matching the schema.
```

### Response Schema

The LLM response is validated against `prompts/topology.response.schema.json`, which matches the output schema described above.

## Processing Flow

### LLM Processing Steps

1. **Prompt Construction**
   - Load system prompt from file
   - Load user template
   - Replace `{{POLYLINES_JSON}}` with formatted polylines
   - Replace `{{METADATA_JSON}}` with formatted metadata

2. **LLM API Call**
   - Send messages to OpenAI API
   - Model: `gpt-4o-mini` (default) or `LLM_MODEL` env var
   - Temperature: 0.7
   - Max tokens: 4000
   - Timeout: 30 seconds

3. **Response Parsing**
   - Extract JSON from response (handles markdown code blocks)
   - Parse JSON
   - If parsing fails, retry with repair prompt

4. **Schema Validation**
   - Validate against response schema
   - If validation fails, retry with repair prompt including error details
   - Maximum 2 repair attempts

5. **Fallback**
   - If all retries fail, fall back to heuristic (`mockClean`)
   - Log error to Sentry (if configured)
   - Return deterministic mock response

### Retry Logic

- **Initial Attempt**: Direct LLM call
- **JSON Parse Failure**: Retry with repair prompt
- **Schema Validation Failure**: Retry with repair prompt + validation errors
- **Final Fallback**: Use heuristic if all retries fail

## Examples

### Example 1: Simple Rectangle

**Input:**
```json
{
  "polylines": [
    {
      "points": [[0, 0], [10, 0], [10, 10], [0, 10]],
      "closed": true
    }
  ],
  "metadata": {
    "imageSize": [1000, 1000],
    "pxToMeters": 0.01
  }
}
```

**Expected Output:**
```json
{
  "walls": [
    {"id": "wall-1", "start": [0, 0], "end": [10, 0], "thickness": 0.25, "type": "exterior"},
    {"id": "wall-2", "start": [10, 0], "end": [10, 10], "thickness": 0.25, "type": "exterior"},
    {"id": "wall-3", "start": [10, 10], "end": [0, 10], "thickness": 0.25, "type": "exterior"},
    {"id": "wall-4", "start": [0, 10], "end": [0, 0], "thickness": 0.25, "type": "exterior"}
  ],
  "rooms": [
    {"id": "room-1", "polygon": [[0, 0], [10, 0], [10, 10], [0, 10]], "area_m2": 100.0}
  ],
  "openings": [],
  "meta": {
    "scale": 0.01,
    "bounds": {"minX": 0, "maxX": 10, "minY": 0, "maxY": 10}
  }
}
```

### Example 2: Two Rooms with Door

**Input:**
```json
{
  "polylines": [
    {
      "points": [[0, 0], [10, 0], [10, 5], [0, 5]],
      "closed": true
    },
    {
      "points": [[0, 5], [10, 5], [10, 10], [0, 10]],
      "closed": true
    },
    {
      "points": [[4.5, 5], [5.5, 5]],
      "closed": false
    }
  ],
  "metadata": {
    "imageSize": [1000, 1000],
    "pxToMeters": 0.01
  }
}
```

**Expected Output:**
```json
{
  "walls": [
    {"id": "wall-1", "start": [0, 0], "end": [10, 0], "thickness": 0.25, "type": "exterior"},
    {"id": "wall-2", "start": [10, 0], "end": [10, 5], "thickness": 0.25, "type": "exterior"},
    {"id": "wall-3", "start": [10, 5], "end": [10, 10], "thickness": 0.25, "type": "exterior"},
    {"id": "wall-4", "start": [10, 10], "end": [0, 10], "thickness": 0.25, "type": "exterior"},
    {"id": "wall-5", "start": [0, 10], "end": [0, 5], "thickness": 0.25, "type": "exterior"},
    {"id": "wall-6", "start": [0, 5], "end": [0, 0], "thickness": 0.25, "type": "exterior"},
    {"id": "wall-7", "start": [0, 5], "end": [4.5, 5], "thickness": 0.15, "type": "interior"},
    {"id": "wall-8", "start": [5.5, 5], "end": [10, 5], "thickness": 0.15, "type": "interior"}
  ],
  "rooms": [
    {"id": "room-1", "polygon": [[0, 0], [10, 0], [10, 5], [0, 5]], "area_m2": 50.0},
    {"id": "room-2", "polygon": [[0, 5], [10, 5], [10, 10], [0, 10]], "area_m2": 50.0}
  ],
  "openings": [
    {"id": "opening-1", "wallId": "wall-7", "type": "door", "position": 1.0}
  ],
  "meta": {
    "scale": 0.01,
    "bounds": {"minX": 0, "maxX": 10, "minY": 0, "maxY": 10}
  }
}
```

## Debugging Tips

### 1. Enable Request Logging

Set environment variables:
```bash
export REQUEST_LOG_ENABLED=true
export REQUEST_LOG_DIR=/tmp/ai-requests
```

This logs all requests to `/tmp/ai-requests/YYYY-MM-DD/request-*.json` for replay.

### 2. Check LLM Responses

Enable verbose logging:
```bash
# In server.js, check logs for:
# - "Calling LLM for topology cleaning"
# - "LLM topology cleaning succeeded"
# - "LLM topology cleaning failed, falling back to heuristic"
```

### 3. Validate Input/Output

Use the schema test:
```bash
npm test  # Runs schema validation tests
```

### 4. Test with Mock Data

Use the replay script:
```bash
node scripts/replay-request.js /tmp/ai-requests/2024-01-01/request-123.json
```

### 5. Inspect LLM Prompts

Add logging to see the exact prompt sent:
```javascript
// In server.js, add:
fastify.log.debug('LLM prompt', { messages });
```

### 6. Check Sentry

If Sentry is configured, check the dashboard for:
- LLM API failures
- Schema validation errors
- Parse errors

### 7. Test Heuristic Fallback

Disable LLM to test fallback:
```bash
export USE_LLM=false
npm start
```

### 8. Monitor Metrics

Check success rates and latency:
```bash
curl http://localhost:3001/metrics | jq
```

### 9. Common Issues

**Issue: LLM returns invalid JSON**
- Check system prompt emphasizes JSON-only output
- Review repair prompt logic
- Check for markdown code blocks in response

**Issue: Schema validation fails**
- Check response schema matches output schema
- Review validation errors in logs
- Verify all required fields are present

**Issue: High latency**
- Check OpenAI API status
- Review token usage (may need to reduce prompt size)
- Consider using faster model (gpt-4o-mini)

**Issue: Inconsistent results**
- Ensure deterministic prompt (no randomness)
- Check temperature setting (should be 0.7)
- Verify same input produces same output

### 10. Debugging Checklist

- [ ] Check server logs for errors
- [ ] Verify OPENAI_API_KEY is set
- [ ] Check USE_LLM environment variable
- [ ] Review request logs if enabled
- [ ] Check Sentry for exceptions
- [ ] Validate input schema
- [ ] Test with simple input first
- [ ] Check rate limiting (429 errors)
- [ ] Review telemetry metrics
- [ ] Test heuristic fallback

## Performance Considerations

### Token Usage

- **System Prompt**: ~1,200 tokens
- **User Prompt**: Varies with polyline count
- **Response**: ~500-2000 tokens depending on complexity
- **Total**: ~2,000-4,000 tokens per request

### Latency

- **LLM API Call**: 1-3 seconds (gpt-4o-mini)
- **Parsing/Validation**: <100ms
- **Total**: 1-4 seconds per request

### Cost Estimation

Using `gpt-4o-mini`:
- Input: $0.15 per 1M tokens
- Output: $0.60 per 1M tokens
- Average request: ~3,000 tokens = $0.002 per request

## Best Practices

1. **Always validate input** before sending to LLM
2. **Use appropriate model** for your use case (gpt-4o-mini for cost, gpt-4 for accuracy)
3. **Monitor token usage** to control costs
4. **Set up alerts** for high error rates
5. **Test with simple cases** before complex ones
6. **Keep prompts deterministic** for consistent results
7. **Log requests** for debugging and replay
8. **Use fallback** when LLM is unavailable
9. **Monitor latency** and optimize if needed
10. **Review errors** in Sentry regularly

