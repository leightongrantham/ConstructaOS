# Testing with AI

This guide provides step-by-step instructions for testing the AI topology cleaning functionality.

## Prerequisites

1. **OpenAI API Key**
   - Sign up at https://platform.openai.com
   - Generate an API key at https://platform.openai.com/api-keys
   - Ensure you have credits available

2. **Node.js 20+**
   ```bash
   node --version  # Should be 20 or higher
   ```

3. **Server Dependencies**
   ```bash
   cd server-ai
   npm install
   ```

## Quick Start

### 1. Start Server with AI Enabled

```bash
cd server-ai

# Set environment variables
export OPENAI_API_KEY=sk-your-api-key-here
export USE_LLM=true

# Start server
npm start
```

You should see output like:
```
Server listening on http://0.0.0.0:3001
Health check: http://0.0.0.0:3001/health
AI clean endpoint: http://0.0.0.0:3001/api/topology/ai-clean
LLM mode: ENABLED (set USE_LLM=true to enable)
LLM model: gpt-4o-mini
OpenAI API key: SET
```

### 2. Verify AI is Enabled

```bash
curl http://localhost:3001/health | jq '.llm'
```

Expected output:
```json
{
  "enabled": true,
  "apiKeySet": true,
  "model": "gpt-4o-mini"
}
```

### 3. Make Your First AI Request

```bash
curl -X POST http://localhost:3001/api/topology/ai-clean \
  -H "Content-Type: application/json" \
  -d '{
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
  }' | jq
```

Expected response:
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
    ...
  ],
  "rooms": [
    {
      "id": "room-1",
      "polygon": [[0, 0], [10, 0], [10, 10], [0, 10]],
      "area_m2": 100.0
    }
  ],
  "openings": [],
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

## Test Cases

### Test Case 1: Simple Rectangle

**Input:**
```bash
curl -X POST http://localhost:3001/api/topology/ai-clean \
  -H "Content-Type: application/json" \
  -d '{
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
  }' | jq
```

**What to check:**
- ✅ Response has 4 walls (one for each side)
- ✅ All walls are type "exterior"
- ✅ One room with area = 100 m²
- ✅ Coordinates normalized (minX=0, minY=0)

### Test Case 2: Two Rooms with Door

**Input:**
```bash
curl -X POST http://localhost:3001/api/topology/ai-clean \
  -H "Content-Type: application/json" \
  -d '{
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
  }' | jq
```

**What to check:**
- ✅ Two rooms detected
- ✅ Interior wall between rooms
- ✅ Door opening detected at the gap
- ✅ Opening references correct wall ID

### Test Case 3: Complex Layout

**Input:**
```bash
curl -X POST http://localhost:3001/api/topology/ai-clean \
  -H "Content-Type: application/json" \
  -d '{
    "polylines": [
      {
        "points": [[0, 0], [20, 0], [20, 15], [0, 15]],
        "closed": true
      },
      {
        "points": [[10, 0], [10, 8]],
        "closed": false
      },
      {
        "points": [[10, 8], [10, 15]],
        "closed": false
      },
      {
        "points": [[0, 7], [10, 7]],
        "closed": false
      }
    ],
    "metadata": {
      "imageSize": [2000, 1500],
      "pxToMeters": 0.01
    }
  }' | jq
```

**What to check:**
- ✅ Multiple rooms detected
- ✅ Interior walls properly classified
- ✅ Room areas calculated correctly
- ✅ All walls have valid start/end points

## Comparing AI vs Heuristic

### Test with AI Enabled

```bash
# Terminal 1: Start with AI
export USE_LLM=true
export OPENAI_API_KEY=sk-your-key
npm start

# Terminal 2: Make request
curl -X POST http://localhost:3001/api/topology/ai-clean \
  -H "Content-Type: application/json" \
  -d @test-input.json > ai-output.json
```

### Test with Heuristic (No AI)

```bash
# Terminal 1: Start with heuristic
export USE_LLM=false
npm start

# Terminal 2: Make same request
curl -X POST http://localhost:3001/api/topology/ai-clean \
  -H "Content-Type: application/json" \
  -d @test-input.json > heuristic-output.json
```

### Compare Results

```bash
# Compare outputs
diff <(jq -S . ai-output.json) <(jq -S . heuristic-output.json)

# Or use a visual diff tool
code --diff ai-output.json heuristic-output.json
```

**Expected differences:**
- AI: More accurate room detection, better wall classification
- Heuristic: Simple bounding box approach, less accurate

## Testing with Request Files

### Create Test Input File

Create `test-input.json`:
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

### Make Request from File

```bash
curl -X POST http://localhost:3001/api/topology/ai-clean \
  -H "Content-Type: application/json" \
  -d @test-input.json | jq > output.json
```

## Monitoring AI Requests

### Check Request Logs

If request logging is enabled:
```bash
export REQUEST_LOG_ENABLED=true
export REQUEST_LOG_DIR=/tmp/ai-requests
npm start
```

View logs:
```bash
# List recent requests
ls -lt /tmp/ai-requests/*/*.json | head -5

# View specific request
cat /tmp/ai-requests/2024-01-01/request-*.json | jq

# Check LLM usage
cat /tmp/ai-requests/2024-01-01/request-*.json | jq '.llmInfo.usedLLM'
```

### Check Telemetry

```bash
# Get metrics
curl http://localhost:3001/metrics | jq

# Check token usage
curl http://localhost:3001/metrics | jq '{tokensIn: .totalTokensIn, tokensOut: .totalTokensOut}'

# Check success rate
curl http://localhost:3001/metrics | jq '.successRate'
```

## Testing Different Models

### Use GPT-4o-mini (Default, Fast & Cheap)

```bash
export LLM_MODEL=gpt-4o-mini
export USE_LLM=true
npm start
```

### Use GPT-4o (More Accurate, Slower & Expensive)

```bash
export LLM_MODEL=gpt-4o
export USE_LLM=true
npm start
```

### Compare Models

```bash
# Test with gpt-4o-mini
export LLM_MODEL=gpt-4o-mini
npm start
curl -X POST http://localhost:3001/api/topology/ai-clean \
  -H "Content-Type: application/json" \
  -d @test-input.json > output-mini.json

# Test with gpt-4o
export LLM_MODEL=gpt-4o
npm start
curl -X POST http://localhost:3001/api/topology/ai-clean \
  -H "Content-Type: application/json" \
  -d @test-input.json > output-4o.json

# Compare
diff output-mini.json output-4o.json
```

## Testing Error Handling

### Test Invalid Input

```bash
# Missing required fields
curl -X POST http://localhost:3001/api/topology/ai-clean \
  -H "Content-Type: application/json" \
  -d '{"polylines": []}' | jq

# Invalid polyline (too few points)
curl -X POST http://localhost:3001/api/topology/ai-clean \
  -H "Content-Type: application/json" \
  -d '{
    "polylines": [{"points": [[0, 0]], "closed": true}],
    "metadata": {"imageSize": [100, 100]}
  }' | jq
```

Expected: 400 Bad Request with error details

### Test Rate Limiting

```bash
# Make rapid requests
for i in {1..15}; do
  echo "Request $i:"
  curl -X POST http://localhost:3001/api/topology/ai-clean \
    -H "Content-Type: application/json" \
    -d '{
      "polylines": [{"points": [[0,0], [10,0]], "closed": false}],
      "metadata": {"imageSize": [100, 100]}
    }' -w "\nStatus: %{http_code}\n\n"
  sleep 0.1
done
```

Expected: After 10 requests, you'll get 429 Too Many Requests

## Testing with Client Headers

### Force Heuristic Mode (Even with AI Enabled)

```bash
curl -X POST http://localhost:3001/api/topology/ai-clean \
  -H "Content-Type: application/json" \
  -H "X-Use-LLM: false" \
  -d @test-input.json | jq
```

### Prefer Deterministic Mode

```bash
curl -X POST http://localhost:3001/api/topology/ai-clean \
  -H "Content-Type: application/json" \
  -H "X-Prefer-Deterministic: true" \
  -d @test-input.json | jq
```

## Debugging AI Responses

### Enable Verbose Logging

The server logs include:
- LLM API calls
- Response parsing
- Schema validation
- Fallback to heuristic

Watch logs:
```bash
# Docker
docker logs -f server-ai

# Manual
npm start  # Watch console output
```

### Check Sentry (If Configured)

```bash
export SENTRY_DSN=https://your-dsn@sentry.io/project-id
npm start
```

Check Sentry dashboard for:
- LLM API failures
- Parse errors
- Schema validation errors

### Inspect LLM Response

Add temporary logging in `server.js`:
```javascript
// In cleanTopologyWithLLM function, after getting response:
logContext.debug('LLM raw response', { responseText });
logContext.debug('Parsed response', { parsed });
```

## Performance Testing

### Measure Latency

```bash
time curl -X POST http://localhost:3001/api/topology/ai-clean \
  -H "Content-Type: application/json" \
  -d @test-input.json > /dev/null
```

### Batch Testing

Create `batch-test.sh`:
```bash
#!/bin/bash
for i in {1..10}; do
  echo "Test $i:"
  time curl -s -X POST http://localhost:3001/api/topology/ai-clean \
    -H "Content-Type: application/json" \
    -d @test-input.json > /dev/null
  sleep 1
done
```

Run:
```bash
chmod +x batch-test.sh
./batch-test.sh
```

## Troubleshooting

### AI Not Working

1. **Check API key:**
   ```bash
   echo $OPENAI_API_KEY  # Should show your key
   curl http://localhost:3001/health | jq '.llm.apiKeySet'
   ```

2. **Check LLM is enabled:**
   ```bash
   curl http://localhost:3001/health | jq '.llm.enabled'
   ```

3. **Test API key directly:**
   ```bash
   curl https://api.openai.com/v1/models \
     -H "Authorization: Bearer $OPENAI_API_KEY"
   ```

4. **Check server logs:**
   ```bash
   # Look for errors like:
   # - "OPENAI_API_KEY is not set"
   # - "OpenAI API call failed"
   # - "LLM topology cleaning failed, falling back to heuristic"
   ```

### Getting Fallback Responses

If you're getting heuristic responses instead of AI:

1. Check logs for fallback reason
2. Verify API key has credits
3. Check rate limits on OpenAI account
4. Review error messages in Sentry

### High Latency

- Normal: 1-4 seconds per request
- If > 10 seconds: Check network, OpenAI API status
- Consider using faster model (gpt-4o-mini)

### Invalid Responses

- Check response schema validation errors in logs
- Review LLM repair attempts
- Verify prompt is correct
- Check for JSON parsing errors

## Quick Test Checklist

- [ ] Server starts with `USE_LLM=true`
- [ ] Health endpoint shows `llm.enabled: true`
- [ ] Health endpoint shows `llm.apiKeySet: true`
- [ ] Simple request returns valid JSON
- [ ] Response has walls, rooms, openings, meta
- [ ] Response validates against schema
- [ ] Logs show "LLM topology cleaning succeeded"
- [ ] Metrics show token usage
- [ ] No fallback to heuristic (unless intentional)

## Example Test Script

Create `test-ai.sh`:
```bash
#!/bin/bash

BASE_URL="http://localhost:3001"

echo "Testing AI Topology Cleaning..."
echo ""

# Test 1: Health check
echo "1. Health check..."
HEALTH=$(curl -s $BASE_URL/health)
if echo $HEALTH | jq -e '.llm.enabled == true' > /dev/null; then
  echo "✓ LLM is enabled"
else
  echo "✗ LLM is not enabled"
  exit 1
fi

# Test 2: Simple request
echo ""
echo "2. Simple rectangle test..."
RESPONSE=$(curl -s -X POST $BASE_URL/api/topology/ai-clean \
  -H "Content-Type: application/json" \
  -d '{
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
  }')

if echo $RESPONSE | jq -e '.walls | length > 0' > /dev/null; then
  echo "✓ Got walls"
else
  echo "✗ No walls in response"
  exit 1
fi

if echo $RESPONSE | jq -e '.rooms | length > 0' > /dev/null; then
  echo "✓ Got rooms"
else
  echo "✗ No rooms in response"
  exit 1
fi

# Test 3: Check metrics
echo ""
echo "3. Check metrics..."
METRICS=$(curl -s $BASE_URL/metrics)
SUCCESS_RATE=$(echo $METRICS | jq -r '.successRate')
echo "Success rate: $SUCCESS_RATE"

echo ""
echo "All tests passed! ✓"
```

Run:
```bash
chmod +x test-ai.sh
./test-ai.sh
```

## Next Steps

- Review [AI_TOPOLOGY.md](./AI_TOPOLOGY.md) for architecture details
- Check [OPERATION.md](./OPERATION.md) for operational procedures
- See [TESTING.md](./TESTING.md) for comprehensive testing guide

