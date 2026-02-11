# Deployment Guide

This guide covers deploying server-ai to various platforms.

## Prerequisites

- Node.js 20+
- Docker (for containerized deployments)
- OpenAI API key (optional, for LLM features)

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `PORT` | No | `3001` | Server port |
| `HOST` | No | `0.0.0.0` | Server host |
| `OPENAI_API_KEY` | Yes* | - | OpenAI API key (*required if USE_LLM=true) |
| `USE_LLM` | No | `false` | Enable LLM mode |
| `LLM_MODEL` | No | `gpt-4o-mini` | OpenAI model to use |
| `RATE_LIMIT_ENABLED` | No | `true` | Enable rate limiting |
| `RATE_LIMIT_RPM` | No | `10` | Requests per minute limit |
| `TELEMETRY_DUMP_FILE` | No | `false` | Dump telemetry to file |
| `TELEMETRY_FILE_PATH` | No | `/tmp/ai-telemetry.log` | Telemetry log path |

## Docker Deployment

### Build Image

```bash
cd server-ai
docker build -t server-ai:latest .
```

### Run Container

```bash
docker run -d \
  --name server-ai \
  -p 3001:3001 \
  -e OPENAI_API_KEY=your_key_here \
  -e USE_LLM=true \
  -v $(pwd)/logs:/tmp/ai-telemetry \
  server-ai:latest
```

### Docker Compose

```bash
# Copy example file
cp docker-compose.example.yml docker-compose.yml

# Edit environment variables
nano docker-compose.yml

# Start services
docker-compose up -d

# View logs
docker-compose logs -f server-ai
```

## Fly.io Deployment

### Prerequisites

```bash
# Install Fly CLI
curl -L https://fly.io/install.sh | sh

# Login
fly auth login
```

### Deploy

```bash
cd server-ai

# Initialize Fly app (first time only)
fly launch --name server-ai

# Set secrets
fly secrets set OPENAI_API_KEY=your_key_here
fly secrets set USE_LLM=true
fly secrets set LLM_MODEL=gpt-4o-mini

# Deploy
fly deploy

# Check status
fly status

# View logs
fly logs
```

### Fly.toml Configuration

Create `fly.toml`:

```toml
app = "server-ai"
primary_region = "iad"

[build]
  dockerfile = "Dockerfile"

[env]
  NODE_ENV = "production"
  PORT = "3001"

[http_service]
  internal_port = 3001
  force_https = true
  auto_stop_machines = true
  auto_start_machines = true
  min_machines_running = 0
  processes = ["app"]

[[http_service.checks]]
  grace_period = "1s"
  interval = "30s"
  method = "GET"
  timeout = "3s"
  path = "/health"

[[vm]]
  cpu_kind = "shared"
  cpus = 1
  memory_mb = 512
```

## Railway Deployment

### Prerequisites

1. Sign up at [railway.app](https://railway.app)
2. Install Railway CLI: `npm i -g @railway/cli`

### Deploy

```bash
cd server-ai

# Login
railway login

# Initialize project
railway init

# Link to existing project (or create new)
railway link

# Set environment variables
railway variables set OPENAI_API_KEY=your_key_here
railway variables set USE_LLM=true
railway variables set LLM_MODEL=gpt-4o-mini

# Deploy
railway up

# View logs
railway logs
```

### Railway Configuration

Railway automatically detects the Dockerfile. You can also use `railway.json`:

```json
{
  "$schema": "https://railway.app/railway.schema.json",
  "build": {
    "builder": "DOCKERFILE",
    "dockerfilePath": "Dockerfile"
  },
  "deploy": {
    "startCommand": "node server.js",
    "healthcheckPath": "/health",
    "healthcheckTimeout": 100,
    "restartPolicyType": "ON_FAILURE",
    "restartPolicyMaxRetries": 10
  }
}
```

## Vercel Deployment (Serverless)

### Prerequisites

```bash
npm i -g vercel
```

### Configuration

Create `vercel.json`:

```json
{
  "version": 2,
  "builds": [
    {
      "src": "server.js",
      "use": "@vercel/node"
    }
  ],
  "routes": [
    {
      "src": "/health",
      "methods": ["GET"],
      "dest": "/server.js"
    },
    {
      "src": "/metrics",
      "methods": ["GET"],
      "dest": "/server.js"
    },
    {
      "src": "/api/topology/ai-clean",
      "methods": ["POST"],
      "dest": "/server.js"
    }
  ],
  "env": {
    "NODE_ENV": "production"
  }
}
```

### Deploy

```bash
cd server-ai

# Login
vercel login

# Deploy
vercel

# Set environment variables
vercel env add OPENAI_API_KEY
vercel env add USE_LLM
vercel env add LLM_MODEL

# Deploy to production
vercel --prod
```

**Note:** Vercel has a 10-second timeout for serverless functions. For long-running LLM requests, consider:
- Using Vercel Pro (60s timeout)
- Implementing request queuing
- Using a different platform for LLM workloads

## Health Check

The `/health` endpoint returns:

```json
{
  "status": "ok",
  "timestamp": "2024-01-01T00:00:00.000Z",
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

## Monitoring

### Metrics Endpoint

```bash
curl http://localhost:3001/metrics
curl http://localhost:3001/metrics?window=300  # Last 5 minutes
```

### Logs

- Telemetry logs: `/tmp/ai-telemetry/telemetry.log` (if enabled)
- Request logs: `/tmp/ai-requests/` (if enabled)
- Application logs: stdout/stderr (captured by platform)

## Troubleshooting

### Server won't start

1. Check environment variables are set correctly
2. Verify port is not in use: `lsof -i :3001`
3. Check logs: `docker logs server-ai` or platform logs

### LLM requests failing

1. Verify `OPENAI_API_KEY` is set and valid
2. Check API key has credits: https://platform.openai.com/usage
3. Review server logs for error messages
4. Test with `USE_LLM=false` to use heuristic fallback

### Rate limiting issues

1. Check `RATE_LIMIT_RPM` setting
2. Verify rate limit headers in response
3. Use API key authentication for higher limits

