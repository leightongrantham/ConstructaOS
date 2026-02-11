# Operations Runbook

This document provides step-by-step procedures for common operational tasks on server-ai.

## Table of Contents

- [Restarting the Server](#restarting-the-server)
- [Toggling LLM Mode](#toggling-llm-mode)
- [Rotating API Keys](#rotating-api-keys)
- [Inspecting Telemetry](#inspecting-telemetry)
- [Monitoring Health](#monitoring-health)
- [Troubleshooting](#troubleshooting)

## Restarting the Server

### Docker

**Stop and restart:**
```bash
docker stop server-ai
docker start server-ai
```

**Restart (one command):**
```bash
docker restart server-ai
```

**View logs:**
```bash
docker logs server-ai
docker logs -f server-ai  # Follow logs
docker logs --tail 100 server-ai  # Last 100 lines
```

**Full restart with new image:**
```bash
docker stop server-ai
docker rm server-ai
docker run -d \
  --name server-ai \
  -p 3001:3001 \
  -e OPENAI_API_KEY=your_key \
  -e USE_LLM=true \
  server-ai:latest
```

### Docker Compose

**Restart service:**
```bash
docker-compose restart server-ai
```

**Restart with rebuild:**
```bash
docker-compose up -d --build server-ai
```

**View logs:**
```bash
docker-compose logs -f server-ai
```

### Systemd

**Restart service:**
```bash
sudo systemctl restart server-ai
```

**Check status:**
```bash
sudo systemctl status server-ai
```

**View logs:**
```bash
sudo journalctl -u server-ai -f
sudo journalctl -u server-ai --tail 100
```

### Fly.io

**Restart app:**
```bash
fly apps restart server-ai
```

**View logs:**
```bash
fly logs
fly logs --app server-ai
```

### Railway

**Restart service:**
```bash
railway restart
```

**View logs:**
```bash
railway logs
```

### Manual (Development)

**Stop:**
```bash
# Press Ctrl+C in terminal
# Or find and kill process:
ps aux | grep "node server.js"
kill <PID>
```

**Start:**
```bash
npm start
# Or with nodemon:
npm run dev
```

## Toggling LLM Mode

### Enable LLM Mode

**Docker:**
```bash
docker stop server-ai
docker run -d \
  --name server-ai \
  -p 3001:3001 \
  -e OPENAI_API_KEY=your_key \
  -e USE_LLM=true \
  server-ai:latest
```

**Docker Compose:**
```bash
# Edit docker-compose.yml or .env file
USE_LLM=true
OPENAI_API_KEY=your_key

docker-compose up -d
```

**Systemd:**
```bash
# Edit /etc/systemd/system/server-ai.service
# Add:
Environment="USE_LLM=true"
Environment="OPENAI_API_KEY=your_key"

sudo systemctl daemon-reload
sudo systemctl restart server-ai
```

**Fly.io:**
```bash
fly secrets set USE_LLM=true
fly secrets set OPENAI_API_KEY=your_key
fly deploy
```

**Railway:**
```bash
railway variables set USE_LLM=true
railway variables set OPENAI_API_KEY=your_key
railway up
```

**Manual:**
```bash
export USE_LLM=true
export OPENAI_API_KEY=your_key
npm start
```

### Disable LLM Mode (Use Heuristic)

**Docker:**
```bash
docker stop server-ai
docker run -d \
  --name server-ai \
  -p 3001:3001 \
  -e USE_LLM=false \
  server-ai:latest
```

**Docker Compose:**
```bash
# Edit docker-compose.yml or .env file
USE_LLM=false

docker-compose up -d
```

**Systemd:**
```bash
# Edit /etc/systemd/system/server-ai.service
# Change:
Environment="USE_LLM=false"
# Remove OPENAI_API_KEY if present

sudo systemctl daemon-reload
sudo systemctl restart server-ai
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

**Manual:**
```bash
export USE_LLM=false
npm start
```

### Verify LLM Status

**Check health endpoint:**
```bash
curl http://localhost:3001/health | jq '.llm'
```

**Expected output (enabled):**
```json
{
  "enabled": true,
  "apiKeySet": true,
  "model": "gpt-4o-mini"
}
```

**Expected output (disabled):**
```json
{
  "enabled": false,
  "apiKeySet": false,
  "model": "gpt-4o-mini"
}
```

## Rotating API Keys

### OpenAI API Key Rotation

#### 1. Prepare New Key

1. Generate new key in OpenAI dashboard: https://platform.openai.com/api-keys
2. Test locally:
   ```bash
   export OPENAI_API_KEY=new_key_here
   export USE_LLM=true
   npm start
   
   # Test request
   curl -X POST http://localhost:3001/api/topology/ai-clean \
     -H "Content-Type: application/json" \
     -d '{"polylines": [{"points": [[0,0], [10,0], [10,10], [0,10]], "closed": true}], "metadata": {"imageSize": [100, 100]}}'
   ```

#### 2. Update in Production

**Docker:**
```bash
docker stop server-ai
docker run -d \
  --name server-ai \
  -p 3001:3001 \
  -e OPENAI_API_KEY=new_key_here \
  -e USE_LLM=true \
  server-ai:latest
```

**Docker Compose:**
```bash
# Update .env file
OPENAI_API_KEY=new_key_here

docker-compose up -d
```

**Systemd:**
```bash
# Edit /etc/systemd/system/server-ai.service
Environment="OPENAI_API_KEY=new_key_here"

sudo systemctl daemon-reload
sudo systemctl restart server-ai
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

#### 3. Verify

```bash
# Check health endpoint
curl http://localhost:3001/health | jq '.llm.apiKeySet'
# Should return: true

# Make test request
curl -X POST http://localhost:3001/api/topology/ai-clean \
  -H "Content-Type: application/json" \
  -d '{"polylines": [{"points": [[0,0], [10,0], [10,10], [0,10]], "closed": true}], "metadata": {"imageSize": [100, 100]}}'
```

#### 4. Revoke Old Key

1. Go to OpenAI dashboard: https://platform.openai.com/api-keys
2. Revoke the old key
3. Monitor for any issues (should be none if rotation successful)

### API Key Authentication (Server API Keys)

If using API key authentication for the server itself:

**Set API keys:**
```bash
export API_KEYS=key1,key2,key3
export API_KEY_REQUIRED=true  # Optional: require API key for all requests
```

**Test with API key:**
```bash
curl -X POST http://localhost:3001/api/topology/ai-clean \
  -H "Content-Type: application/json" \
  -H "X-API-Key: key1" \
  -d '{"polylines": [...], "metadata": {...}}'
```

## Inspecting Telemetry

### Metrics Endpoint

**Get all-time metrics:**
```bash
curl http://localhost:3001/metrics | jq
```

**Get metrics for last 5 minutes:**
```bash
curl "http://localhost:3001/metrics?window=300" | jq
```

**Get metrics for last hour:**
```bash
curl "http://localhost:3001/metrics?window=3600" | jq
```

### Metrics Response Format

```json
{
  "totalRequests": 100,
  "successRate": 0.95,
  "avgLatency": 1250,
  "totalTokensIn": 5000,
  "totalTokensOut": 20000,
  "requestsByModel": {
    "gpt-4o-mini": {
      "count": 100,
      "avgLatency": 1250
    }
  },
  "errors": 5,
  "windowMs": 300000,
  "timestamp": "2024-01-01T12:00:00.000Z"
}
```

### Telemetry Log Files

**If telemetry file logging is enabled:**
```bash
export TELEMETRY_DUMP_FILE=true
export TELEMETRY_FILE_PATH=/tmp/ai-telemetry.log
```

**View telemetry logs:**
```bash
tail -f /tmp/ai-telemetry.log | jq

# Filter by success/failure
grep '"success":true' /tmp/ai-telemetry.log | wc -l
grep '"success":false' /tmp/ai-telemetry.log | wc -l

# Filter by model
grep '"model":"gpt-4o-mini"' /tmp/ai-telemetry.log | jq

# Calculate average latency
cat /tmp/ai-telemetry.log | jq -s 'map(.latency) | add / length'
```

### Request Logs

**If request logging is enabled:**
```bash
export REQUEST_LOG_ENABLED=true
export REQUEST_LOG_DIR=/tmp/ai-requests
```

**View request logs:**
```bash
# List all request logs
ls -lt /tmp/ai-requests/*/*.json | head -10

# View specific request
cat /tmp/ai-requests/2024-01-01/request-123.json | jq

# Replay request
node scripts/replay-request.js /tmp/ai-requests/2024-01-01/request-123.json
```

### Analyzing Metrics

**Success rate over time:**
```bash
# Get metrics every minute for 10 minutes
for i in {1..10}; do
  echo "Minute $i:"
  curl -s "http://localhost:3001/metrics?window=60" | jq '.successRate'
  sleep 60
done
```

**Token usage:**
```bash
curl -s http://localhost:3001/metrics | jq '{tokensIn: .totalTokensIn, tokensOut: .totalTokensOut, total: (.totalTokensIn + .totalTokensOut)}'
```

**Error analysis:**
```bash
# Count errors by type (from Sentry or logs)
# Check telemetry for error count
curl -s http://localhost:3001/metrics | jq '.errors'

# Check recent failed requests
grep '"success":false' /tmp/ai-telemetry.log | tail -10 | jq
```

## Monitoring Health

### Health Check Endpoint

**Basic check:**
```bash
curl http://localhost:3001/health
```

**Pretty print:**
```bash
curl http://localhost:3001/health | jq
```

**Check specific fields:**
```bash
curl -s http://localhost:3001/health | jq '.status'
curl -s http://localhost:3001/health | jq '.llm.enabled'
curl -s http://localhost:3001/health | jq '.telemetry.successRate'
```

### Health Response Format

```json
{
  "status": "ok",
  "timestamp": "2024-01-01T12:00:00.000Z",
  "version": "1.0.0",
  "llm": {
    "enabled": true,
    "apiKeySet": true,
    "model": "gpt-4o-mini"
  },
  "telemetry": {
    "requestsLast5Min": 10,
    "successRate": 0.95,
    "avgLatency": 1250
  },
  "uptime": 3600
}
```

### Automated Health Checks

**Using uptime ping script:**
```bash
# Run manually
node scripts/uptime-ping.js

# Set up cron (every 5 minutes)
*/5 * * * * cd /path/to/server-ai && node scripts/uptime-ping.js >> /var/log/server-ai-uptime.log 2>&1
```

**Using monitoring tools:**
- Prometheus: Scrape `/health` endpoint
- Grafana: Create dashboard from health metrics
- Nagios/Zabbix: HTTP check on `/health`

## Troubleshooting

### Server Won't Start

1. **Check port availability:**
   ```bash
   lsof -i :3000
   # Or
   netstat -an | grep 3000
   ```

2. **Check environment variables:**
   ```bash
   env | grep -E "(USE_LLM|OPENAI_API_KEY|PORT|HOST)"
   ```

3. **Check logs:**
   ```bash
   # Docker
   docker logs server-ai
   
   # Systemd
   sudo journalctl -u server-ai
   
   # Manual
   npm start  # Check console output
   ```

4. **Check dependencies:**
   ```bash
   npm install
   ```

### LLM Requests Failing

1. **Verify API key:**
   ```bash
   curl -s http://localhost:3001/health | jq '.llm.apiKeySet'
   ```

2. **Check OpenAI API status:**
   - https://status.openai.com

3. **Test API key directly:**
   ```bash
   curl https://api.openai.com/v1/models \
     -H "Authorization: Bearer $OPENAI_API_KEY"
   ```

4. **Check rate limits:**
   - Review OpenAI dashboard: https://platform.openai.com/usage
   - Check for 429 errors in logs

5. **Disable LLM temporarily:**
   ```bash
   export USE_LLM=false
   # Restart server
   ```

### High Error Rate

1. **Check metrics:**
   ```bash
   curl -s http://localhost:3001/metrics | jq '.successRate, .errors'
   ```

2. **Review Sentry:**
   - Check Sentry dashboard for error patterns
   - Review recent exceptions

3. **Check request logs:**
   ```bash
   # Find failed requests
   grep '"success":false' /tmp/ai-telemetry.log | tail -20 | jq
   ```

4. **Review server logs:**
   ```bash
   docker logs server-ai --tail 100 | grep -i error
   ```

### High Latency

1. **Check average latency:**
   ```bash
   curl -s http://localhost:3001/metrics | jq '.avgLatency'
   ```

2. **Check by model:**
   ```bash
   curl -s http://localhost:3001/metrics | jq '.requestsByModel'
   ```

3. **Review token usage:**
   - High token counts = longer processing
   - Consider reducing prompt size
   - Use faster model (gpt-4o-mini)

4. **Check network:**
   ```bash
   # Test OpenAI API latency
   time curl -s https://api.openai.com/v1/models \
     -H "Authorization: Bearer $OPENAI_API_KEY" > /dev/null
   ```

### Rate Limiting Issues

1. **Check rate limit headers:**
   ```bash
   curl -v -X POST http://localhost:3001/api/topology/ai-clean \
     -H "Content-Type: application/json" \
     -d '{"polylines": [...], "metadata": {...}}' 2>&1 | grep -i "rate"
   ```

2. **Adjust rate limit:**
   ```bash
   export RATE_LIMIT_RPM=20  # Increase from default 10
   # Restart server
   ```

3. **Disable rate limiting (not recommended):**
   ```bash
   export RATE_LIMIT_ENABLED=false
   # Restart server
   ```

### Debugging Specific Request

1. **Enable request logging:**
   ```bash
   export REQUEST_LOG_ENABLED=true
   export REQUEST_LOG_DIR=/tmp/ai-requests
   # Restart server
   ```

2. **Make request:**
   ```bash
   curl -X POST http://localhost:3001/api/topology/ai-clean \
     -H "Content-Type: application/json" \
     -d @request.json
   ```

3. **Find log file:**
   ```bash
   ls -lt /tmp/ai-requests/*/*.json | head -1
   ```

4. **Review log:**
   ```bash
   cat /tmp/ai-requests/2024-01-01/request-*.json | jq
   ```

5. **Replay request:**
   ```bash
   node scripts/replay-request.js /tmp/ai-requests/2024-01-01/request-*.json
   ```

## Quick Reference

### Environment Variables

```bash
# Core
PORT=3001
HOST=0.0.0.0
USE_LLM=true
OPENAI_API_KEY=sk-...
LLM_MODEL=gpt-4o-mini

# Monitoring
SENTRY_DSN=https://...
TELEMETRY_DUMP_FILE=true
REQUEST_LOG_ENABLED=true

# Rate Limiting
RATE_LIMIT_ENABLED=true
RATE_LIMIT_RPM=10

# API Keys
API_KEYS=key1,key2,key3
API_KEY_REQUIRED=false
```

### Common Commands

```bash
# Health check
curl http://localhost:3001/health | jq

# Metrics
curl http://localhost:3001/metrics | jq

# Test request
curl -X POST http://localhost:3001/api/topology/ai-clean \
  -H "Content-Type: application/json" \
  -d '{"polylines": [{"points": [[0,0], [10,0], [10,10], [0,10]], "closed": true}], "metadata": {"imageSize": [100, 100]}}'

# View logs (Docker)
docker logs -f server-ai

# Restart (Docker)
docker restart server-ai
```

