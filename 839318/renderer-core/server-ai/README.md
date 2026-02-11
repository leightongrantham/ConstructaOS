# AI Topology Cleaning Server

Backend server for AI-powered topology cleaning of architectural drawings.

## Quick Start

```bash
# Install dependencies
npm install

# Start server (heuristic mode, no API key needed)
npm start

# Start with LLM enabled (requires OPENAI_API_KEY)
USE_LLM=true OPENAI_API_KEY=your_key npm start
```

## Documentation

- **[DEPLOYMENT.md](./DEPLOYMENT.md)** - Deployment guides for Docker, Fly.io, Railway, Vercel
- **[RUNBOOK.md](./RUNBOOK.md)** - Operational procedures and troubleshooting
- **[OPS.md](./OPS.md)** - Monitoring setup, alerting, and operational procedures
- **[docs/AI_TOPOLOGY.md](./docs/AI_TOPOLOGY.md)** - Architecture, data contracts, prompts, examples, debugging
- **[docs/OPERATION.md](./docs/OPERATION.md)** - Runbook: restart server, toggle LLM, rotate keys, inspect telemetry
- **[docs/TESTING.md](./docs/TESTING.md)** - Testing guide: unit, integration, e2e tests, prompt evaluation
- **[docs/TESTING_WITH_AI.md](./docs/TESTING_WITH_AI.md)** - Step-by-step guide for testing AI functionality

## Setup

1. Install dependencies:
```bash
npm install
```

2. Create a `.env` file (optional):
```bash
OPENAI_API_KEY=your_api_key_here
PORT=3001
HOST=0.0.0.0
USE_LLM=true
SENTRY_DSN=https://your-dsn@sentry.io/project-id  # Optional: for error tracking
```

## Running

### Development mode (with auto-reload):
```bash
npm run dev
```

### Production mode:
```bash
npm start
```

The server will start on `http://localhost:3001` by default.

## API Endpoints

### POST `/api/topology/ai-clean`

Cleans topology from polylines using AI (currently returns mock response).

**Request Body:**
```json
{
  "polylines": [
    [[0, 0], [10, 0], [10, 10], [0, 10]],
    [[5, 5], [15, 5], [15, 15]]
  ],
  "metadata": {
    "source": "test",
    "timestamp": 1234567890
  }
}
```

**Response:**
```json
{
  "walls": [
    {
      "start": [0, 0],
      "end": [10, 0],
      "thickness": 0.2
    }
  ],
  "rooms": [
    {
      "boundary": [[0, 0], [10, 0], [10, 10], [0, 10]]
    }
  ],
  "openings": [
    {
      "start": [4.55, 0],
      "end": [5.45, 0],
      "type": "door",
      "width": 0.9
    }
  ],
  "meta": {
    "processedAt": "2024-01-01T00:00:00.000Z",
    "polylineCount": 2,
    "pointCount": 7
  }
}
```

### GET `/health`

Health check endpoint.

## Example Usage

### Using curl:

```bash
curl -X POST http://localhost:3001/api/topology/ai-clean \
  -H "Content-Type: application/json" \
  -d '{
    "polylines": [
      [[0, 0], [10, 0], [10, 10], [0, 10]],
      [[5, 5], [15, 5], [15, 15]]
    ],
    "metadata": {
      "source": "test"
    }
  }'
```

### Using JavaScript:

```javascript
const response = await fetch('http://localhost:3001/api/topology/ai-clean', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    polylines: [
      [[0, 0], [10, 0], [10, 10], [0, 10]],
      [[5, 5], [15, 5], [15, 15]]
    ],
    metadata: { source: 'test' }
  })
});

const result = await response.json();
console.log(result);
```

## Validation

The endpoint validates input using JSON Schema:
- `polylines`: Required array of arrays of [x, y] coordinate pairs
- `metadata`: Optional object with any properties

Invalid requests return a 400 status with error details.

## Notes

- Currently returns a deterministic mock response
- `OPENAI_API_KEY` is read from environment but not used yet
- Request timing is logged (start/finish)
- All requests are logged with Fastify's built-in logger

## Monitoring

Server-ai includes comprehensive monitoring and alerting:

- **Sentry Integration**: Automatic exception tracking (set `SENTRY_DSN` env var)
- **Uptime Monitoring**: Health check ping script (`scripts/uptime-ping.js`)
- **Success Rate Alerts**: Automated alerting for degraded performance (`scripts/check-alerts.js`)
- **Telemetry**: Request metrics via `/metrics` endpoint

See [OPS.md](./OPS.md) for detailed monitoring setup and operational procedures.

