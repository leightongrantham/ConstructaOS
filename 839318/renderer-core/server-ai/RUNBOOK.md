# Server-AI Runbook

Operational procedures and troubleshooting guide for server-ai.

## Quick Reference

### Health Check

```bash
curl http://localhost:3001/health
```

### Disable LLM Quickly

```bash
# Set environment variable
export USE_LLM=false

# Restart server
# Docker:
docker restart server-ai

# Systemd:
sudo systemctl restart server-ai

# Fly.io:
fly secrets set USE_LLM=false
fly deploy

# Railway:
railway variables set USE_LLM=false
railway up
```

### Check Current Status

```bash
# Health endpoint includes LLM status
curl http://localhost:3001/health | jq '.llm'

# Metrics
curl http://localhost:3001/metrics | jq
```

## Rotating OPENAI_API_KEY

### Why Rotate?

- Security best practice
- Key compromised or exposed
- Key expired or revoked
- Switching to new key with different permissions

### Procedure

#### 1. Prepare New Key

1. Generate new API key in OpenAI dashboard: https://platform.openai.com/api-keys
2. Test the new key locally:
   ```bash
   export OPENAI_API_KEY=new_key_here
   export USE_LLM=true
   npm start
   # Test with curl request
   ```

#### 2. Update in Production

**Docker:**
```bash
# Stop container
docker stop server-ai

# Update environment variable
docker run -d \
  --name server-ai \
  -p 3001:3001 \
  -e OPENAI_API_KEY=new_key_here \
  -e USE_LLM=true \
  server-ai:latest
```

**Docker Compose:**
```bash
# Update .env file or docker-compose.yml
export OPENAI_API_KEY=new_key_here
docker-compose up -d
```

**Fly.io:**
```bash
fly secrets set OPENAI_API_KEY=new_key_here
fly deploy
```

**Railway:**
```bash
railway variables set OPENAI_API_KEY=new_key_here
railway up
```

**Vercel:**
```bash
vercel env rm OPENAI_API_KEY production
vercel env add OPENAI_API_KEY production
vercel --prod
```

#### 3. Verify

```bash
# Check health endpoint
curl http://your-server/health | jq '.llm.apiKeySet'

# Make test request
curl -X POST http://your-server/api/topology/ai-clean \
  -H "Content-Type: application/json" \
  -d '{"polylines": [{"points": [[0,0], [10,0], [10,10], [0,10]], "closed": true}], "metadata": {"imageSize": [100, 100]}}'
```

#### 4. Revoke Old Key

1. Go to OpenAI dashboard: https://platform.openai.com/api-keys
2. Revoke the old key
3. Monitor for any issues (should be none if rotation successful)

### Rollback Plan

If new key doesn't work:

1. **Immediate**: Disable LLM
   ```bash
   export USE_LLM=false
   # Restart server (see "Disable LLM Quickly" above)
   ```

2. **Restore old key**: Repeat rotation steps with old key

3. **Investigate**: Check logs for API errors

## Disabling LLM Quickly

### When to Disable

- API key issues or rate limits
- Unexpected costs
- Debugging issues
- Maintenance window

### Methods

#### Method 1: Environment Variable (Recommended)

```bash
# Set USE_LLM=false
export USE_LLM=false

# Restart server (method depends on deployment)
```

**Docker:**
```bash
docker stop server-ai
docker run -d --name server-ai -p 3001:3001 -e USE_LLM=false server-ai:latest
```

**Fly.io:**
```bash
fly secrets set USE_LLM=false
fly deploy
```

**Railway:**
```bash
railway variables set USE_LLM=false
railway up
```

#### Method 2: Remove API Key (Fallback)

If environment variable doesn't work:

```bash
# Unset OPENAI_API_KEY
unset OPENAI_API_KEY

# Server will automatically fall back to heuristic mode
# Restart server
```

#### Verification

```bash
# Check health endpoint
curl http://localhost:3001/health | jq '.llm.enabled'
# Should return: false

# Test request (should use heuristic)
curl -X POST http://localhost:3001/api/topology/ai-clean \
  -H "Content-Type: application/json" \
  -d '{"polylines": [{"points": [[0,0], [10,0], [10,10], [0,10]], "closed": true}], "metadata": {"imageSize": [100, 100]}}'
```

## Replaying Requests

### Request Logging

Requests are logged to `/tmp/ai-requests/` directory (if enabled).

#### Enable Request Logging

Set environment variable:
```bash
export REQUEST_LOG_ENABLED=true
export REQUEST_LOG_DIR=/tmp/ai-requests
```

#### Log Format

Each request is saved as a JSON file:
```
/tmp/ai-requests/
  ├── 2024-01-01/
  │   ├── request-1234567890-abc123.json
  │   └── request-1234567891-def456.json
  └── ...
```

Request log structure:
```json
{
  "requestId": "1234567890-abc123",
  "timestamp": "2024-01-01T00:00:00.000Z",
  "method": "POST",
  "path": "/api/topology/ai-clean",
  "body": {
    "polylines": [...],
    "metadata": {...}
  },
  "response": {
    "statusCode": 200,
    "body": {...}
  },
  "latency": 1250,
  "tokens": {
    "in": 50,
    "out": 200
  }
}
```

### Replay Script

Create `scripts/replay-request.js`:

```javascript
import { readFileSync } from 'fs';
import { join } from 'path';

const requestFile = process.argv[2];
if (!requestFile) {
  console.error('Usage: node scripts/replay-request.js <request-file.json>');
  process.exit(1);
}

const request = JSON.parse(readFileSync(requestFile, 'utf-8'));
const endpoint = process.env.ENDPOINT_URL || 'http://localhost:3001/api/topology/ai-clean';

const response = await fetch(endpoint, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(request.body)
});

const result = await response.json();
console.log(JSON.stringify(result, null, 2));
```

### Replay Procedure

1. **Find request log:**
   ```bash
   ls -lt /tmp/ai-requests/*/*.json | head -10
   ```

2. **Replay single request:**
   ```bash
   node scripts/replay-request.js /tmp/ai-requests/2024-01-01/request-123.json
   ```

3. **Replay all requests from a day:**
   ```bash
   for file in /tmp/ai-requests/2024-01-01/*.json; do
     echo "Replaying $file"
     node scripts/replay-request.js "$file"
     sleep 1
   done
   ```

4. **Replay with different endpoint:**
   ```bash
   ENDPOINT_URL=http://staging-server:3001/api/topology/ai-clean \
     node scripts/replay-request.js request.json
   ```

### Use Cases

- **Debugging**: Replay failed requests to reproduce issues
- **Testing**: Replay production requests against staging
- **Migration**: Replay requests after deploying fixes
- **Analysis**: Compare responses before/after changes

## Monitoring & Alerts

### Key Metrics to Monitor

1. **Success Rate** (`/metrics` endpoint)
   - Alert if < 95%
   - Check logs for error patterns

2. **Average Latency** (`/metrics` endpoint)
   - Alert if > 5 seconds
   - May indicate LLM API issues

3. **Token Usage** (from telemetry)
   - Monitor daily token consumption
   - Set budget alerts in OpenAI dashboard

4. **Rate Limit Hits** (429 responses)
   - Check rate limit configuration
   - Consider increasing `RATE_LIMIT_RPM`

### Health Check Monitoring

Set up monitoring to hit `/health` endpoint:

```bash
# Simple health check script
#!/bin/bash
response=$(curl -s http://localhost:3001/health)
status=$(echo $response | jq -r '.status')

if [ "$status" != "ok" ]; then
  echo "Health check failed: $response"
  exit 1
fi
```

## Emergency Procedures

### Server Unresponsive

1. **Check health:**
   ```bash
   curl http://localhost:3001/health
   ```

2. **Check logs:**
   ```bash
   # Docker
   docker logs server-ai --tail 100
   
   # Fly.io
   fly logs
   
   # Railway
   railway logs
   ```

3. **Restart server:**
   ```bash
   # Docker
   docker restart server-ai
   
   # Systemd
   sudo systemctl restart server-ai
   ```

### High Error Rate

1. **Disable LLM immediately:**
   ```bash
   export USE_LLM=false
   # Restart (see "Disable LLM Quickly")
   ```

2. **Check metrics:**
   ```bash
   curl http://localhost:3001/metrics | jq
   ```

3. **Review recent errors:**
   ```bash
   # Check telemetry logs
   tail -f /tmp/ai-telemetry/telemetry.log | grep '"success":false'
   ```

### Unexpected Costs

1. **Disable LLM:**
   ```bash
   export USE_LLM=false
   # Restart server
   ```

2. **Check token usage:**
   ```bash
   curl http://localhost:3001/metrics | jq '.totalTokensIn, .totalTokensOut'
   ```

3. **Review OpenAI dashboard:**
   - https://platform.openai.com/usage
   - Check for unusual patterns

4. **Set rate limits:**
   ```bash
   export RATE_LIMIT_RPM=5  # Lower limit
   # Restart server
   ```

## Maintenance Windows

### Scheduled Maintenance

1. **Notify users** (if applicable)
2. **Disable LLM** (optional, for zero-cost maintenance)
3. **Perform updates**
4. **Run tests**
5. **Re-enable LLM** (if disabled)
6. **Monitor for issues**

### Zero-Downtime Updates

1. **Deploy to staging** first
2. **Run smoke tests**
3. **Deploy to production** (platform handles rolling updates)
4. **Monitor health endpoint**
5. **Rollback if issues** (platform-specific)

## Contact & Support

- **Logs**: Check platform logs or `/tmp/ai-telemetry/telemetry.log`
- **Metrics**: `/metrics` endpoint
- **Health**: `/health` endpoint
- **OpenAI Issues**: https://status.openai.com

