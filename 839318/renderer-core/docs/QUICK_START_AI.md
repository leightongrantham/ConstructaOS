# Quick Start: AI Integration

Get AI topology cleaning working in 5 minutes.

## Step 1: Start AI Backend

```bash
cd server-ai
export OPENAI_API_KEY=sk-your-key-here
export USE_LLM=true
npm start
```

Server starts on `http://localhost:3001`

## Step 2: Use in Your Code

```javascript
import { aiClean } from './src/topology/ai-clean.js';

// Your vectorized paths
const paths = [
  { points: [[0, 0], [10, 0], [10, 10], [0, 10]], closed: true }
];

// Convert to polylines format
const polylines = paths.map(path => ({
  points: path.points,
  closed: path.closed || false
}));

// Prepare metadata
const metadata = {
  imageSize: [1000, 1000],
  pxToMeters: 0.01
};

// Call AI
const result = await aiClean(polylines, metadata);

// Use result
console.log('Walls:', result.walls);
console.log('Rooms:', result.rooms);
console.log('Openings:', result.openings);
```

## Step 3: Test It

```bash
# In another terminal
curl -X POST http://localhost:3001/api/topology/ai-clean \
  -H "Content-Type: application/json" \
  -d '{
    "polylines": [{
      "points": [[0, 0], [10, 0], [10, 10], [0, 10]],
      "closed": true
    }],
    "metadata": {
      "imageSize": [1000, 1000],
      "pxToMeters": 0.01
    }
  }' | jq
```

## That's It!

See [AI_INTEGRATION.md](./AI_INTEGRATION.md) for complete integration guide.

