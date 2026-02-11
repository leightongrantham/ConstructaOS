# Testing Guide

This document describes how to run tests for server-ai, including unit tests, integration tests, end-to-end tests, and prompt evaluation.

## Table of Contents

- [Test Structure](#test-structure)
- [Running Tests](#running-tests)
- [Unit Tests](#unit-tests)
- [Integration Tests](#integration-tests)
- [End-to-End Tests](#end-to-end-tests)
- [Prompt Evaluation](#prompt-evaluation)
- [Writing New Tests](#writing-new-tests)
- [Test Best Practices](#test-best-practices)

## Test Structure

```
server-ai/
├── tests/
│   ├── schema.test.js          # Schema validation tests
│   ├── llm.mock.test.js        # LLM module tests (mocked)
│   ├── validator.test.js       # Geometry validator tests
│   ├── telemetry.test.js       # Telemetry module tests
│   └── rate-limiter.test.js    # Rate limiter tests
├── scripts/
│   └── replay-request.js      # Request replay utility
└── docs/
    └── TESTING.md              # This file
```

## Running Tests

### Run All Tests

```bash
npm run test:all
```

This runs all test suites in sequence:
- Schema validation tests
- LLM mock tests
- Validator tests
- Telemetry tests
- Rate limiter tests

### Run Individual Test Suites

```bash
# Schema validation
npm test

# LLM module (mocked)
npm run test:llm

# Validator
npm run test:validator

# Telemetry
npm run test:telemetry

# Rate limiter
npm run test:ratelimit
```

### Run Tests Manually

```bash
# Run specific test file
node tests/schema.test.js
node tests/llm.mock.test.js
node tests/validator.test.js
node tests/telemetry.test.js
node tests/rate-limiter.test.js
```

## Unit Tests

### Schema Validation Tests

**File:** `tests/schema.test.js`

**What it tests:**
- Input schema validation (polylines, metadata)
- Output schema validation (walls, rooms, openings, meta)
- Required fields
- Data types and constraints
- Enum values

**Run:**
```bash
npm test
```

**Example test:**
```javascript
test('Valid input 1 (with pxToMeters)', () => {
  const valid = validateInput(validInput1);
  assert(valid, 'Should be valid');
});
```

### LLM Module Tests

**File:** `tests/llm.mock.test.js`

**What it tests:**
- LLM API client creation
- Retry logic
- Error handling
- Timeout handling
- Token usage tracking

**Run:**
```bash
npm run test:llm
```

**Note:** These tests mock the OpenAI API to avoid actual API calls.

### Validator Tests

**File:** `tests/validator.test.js`

**What it tests:**
- Geometry validation
- Wall validation
- Room validation
- Opening validation
- Geometry repair functions

**Run:**
```bash
npm run test:validator
```

### Telemetry Tests

**File:** `tests/telemetry.test.js`

**What it tests:**
- Metric recording
- Aggregation functions
- Time window filtering
- Ring buffer functionality

**Run:**
```bash
npm run test:telemetry
```

### Rate Limiter Tests

**File:** `tests/rate-limiter.test.js`

**What it tests:**
- Token bucket algorithm
- Rate limit enforcement
- Key-based rate limiting
- Cleanup of old buckets

**Run:**
```bash
npm run test:ratelimit
```

## Integration Tests

### Manual Integration Testing

**1. Start the server:**
```bash
npm start
# Or with LLM enabled:
USE_LLM=true OPENAI_API_KEY=your_key npm start
```

**2. Test health endpoint:**
```bash
curl http://localhost:3001/health | jq
```

**3. Test metrics endpoint:**
```bash
curl http://localhost:3001/metrics | jq
```

**4. Test AI clean endpoint:**
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

**5. Test rate limiting:**
```bash
# Make multiple rapid requests
for i in {1..15}; do
  curl -X POST http://localhost:3001/api/topology/ai-clean \
    -H "Content-Type: application/json" \
    -d '{"polylines": [{"points": [[0,0], [10,0]], "closed": false}], "metadata": {"imageSize": [100, 100]}}' \
    -w "\nStatus: %{http_code}\n"
  sleep 0.1
done
```

**6. Test error handling:**
```bash
# Invalid input
curl -X POST http://localhost:3001/api/topology/ai-clean \
  -H "Content-Type: application/json" \
  -d '{"invalid": "data"}' | jq

# Missing required fields
curl -X POST http://localhost:3001/api/topology/ai-clean \
  -H "Content-Type: application/json" \
  -d '{"polylines": []}' | jq
```

### Automated Integration Test Script

Create `tests/integration.test.js`:

```javascript
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const BASE_URL = process.env.TEST_BASE_URL || 'http://localhost:3001';

async function testHealth() {
  const response = await fetch(`${BASE_URL}/health`);
  const data = await response.json();
  
  if (data.status !== 'ok') {
    throw new Error('Health check failed');
  }
  
  console.log('✓ Health check passed');
}

async function testMetrics() {
  const response = await fetch(`${BASE_URL}/metrics`);
  const data = await response.json();
  
  if (typeof data.totalRequests !== 'number') {
    throw new Error('Metrics response invalid');
  }
  
  console.log('✓ Metrics endpoint passed');
}

async function testAIClean() {
  const requestBody = {
    polylines: [
      {
        points: [[0, 0], [10, 0], [10, 10], [0, 10]],
        closed: true
      }
    ],
    metadata: {
      imageSize: [1000, 1000],
      pxToMeters: 0.01
    }
  };
  
  const response = await fetch(`${BASE_URL}/api/topology/ai-clean`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(requestBody)
  });
  
  if (!response.ok) {
    throw new Error(`Request failed: ${response.status}`);
  }
  
  const data = await response.json();
  
  // Validate response structure
  if (!Array.isArray(data.walls) || !Array.isArray(data.rooms) || !Array.isArray(data.openings)) {
    throw new Error('Invalid response structure');
  }
  
  console.log('✓ AI clean endpoint passed');
}

async function runTests() {
  try {
    await testHealth();
    await testMetrics();
    await testAIClean();
    console.log('\nAll integration tests passed!');
  } catch (error) {
    console.error('Integration test failed:', error.message);
    process.exit(1);
  }
}

runTests();
```

**Run:**
```bash
node tests/integration.test.js
```

## End-to-End Tests

### E2E Test with Real Server

**1. Start server in test mode:**
```bash
# Terminal 1
USE_LLM=false npm start
```

**2. Run E2E test script:**
```bash
# Terminal 2
node tests/e2e.test.js
```

**Example E2E test (`tests/e2e.test.js`):**

```javascript
import { readFileSync } from 'fs';

const BASE_URL = process.env.TEST_BASE_URL || 'http://localhost:3001';

const testCases = [
  {
    name: 'Simple rectangle',
    input: {
      polylines: [
        {
          points: [[0, 0], [10, 0], [10, 10], [0, 10]],
          closed: true
        }
      ],
      metadata: {
        imageSize: [1000, 1000],
        pxToMeters: 0.01
      }
    },
    validate: (response) => {
      if (response.walls.length < 4) {
        throw new Error('Expected at least 4 walls');
      }
      if (response.rooms.length < 1) {
        throw new Error('Expected at least 1 room');
      }
    }
  },
  // Add more test cases...
];

async function runE2ETests() {
  console.log('Running E2E tests...\n');
  
  for (const testCase of testCases) {
    try {
      console.log(`Testing: ${testCase.name}`);
      
      const response = await fetch(`${BASE_URL}/api/topology/ai-clean`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(testCase.input)
      });
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      
      const data = await response.json();
      
      // Run validation
      if (testCase.validate) {
        testCase.validate(data);
      }
      
      console.log(`✓ ${testCase.name} passed\n`);
    } catch (error) {
      console.error(`✗ ${testCase.name} failed:`, error.message);
      process.exit(1);
    }
  }
  
  console.log('All E2E tests passed!');
}

runE2ETests();
```

### E2E Test with Request Replay

**1. Enable request logging:**
```bash
export REQUEST_LOG_ENABLED=true
export REQUEST_LOG_DIR=/tmp/ai-requests
npm start
```

**2. Make some requests:**
```bash
curl -X POST http://localhost:3001/api/topology/ai-clean \
  -H "Content-Type: application/json" \
  -d @test-request.json
```

**3. Replay requests:**
```bash
# Replay all requests from a day
for file in /tmp/ai-requests/2024-01-01/*.json; do
  echo "Replaying $file"
  node scripts/replay-request.js "$file"
done
```

## Prompt Evaluation

### Manual Prompt Testing

**1. Create test input file (`test-input.json`):**
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

**2. Test with LLM enabled:**
```bash
USE_LLM=true OPENAI_API_KEY=your_key npm start

# In another terminal
curl -X POST http://localhost:3001/api/topology/ai-clean \
  -H "Content-Type: application/json" \
  -d @test-input.json | jq
```

**3. Compare with heuristic:**
```bash
USE_LLM=false npm start

# In another terminal
curl -X POST http://localhost:3001/api/topology/ai-clean \
  -H "Content-Type: application/json" \
  -d @test-input.json | jq
```

### Prompt Evaluation Harness

Create `tests/prompt-eval.js`:

```javascript
import { readFileSync, writeFileSync } from 'fs';
import { readdirSync } from 'fs';

const BASE_URL = process.env.TEST_BASE_URL || 'http://localhost:3001';
const TEST_CASES_DIR = './tests/prompt-eval-cases';

// Load test cases
const testCases = readdirSync(TEST_CASES_DIR)
  .filter(f => f.endsWith('.json'))
  .map(file => ({
    name: file.replace('.json', ''),
    input: JSON.parse(readFileSync(`${TEST_CASES_DIR}/${file}`, 'utf-8'))
  }));

async function evaluatePrompt(testCase) {
  const startTime = Date.now();
  
  const response = await fetch(`${BASE_URL}/api/topology/ai-clean`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(testCase.input)
  });
  
  const latency = Date.now() - startTime;
  const data = await response.json();
  
  return {
    testCase: testCase.name,
    latency,
    status: response.status,
    walls: data.walls?.length || 0,
    rooms: data.rooms?.length || 0,
    openings: data.openings?.length || 0,
    response: data
  };
}

async function runEvaluation() {
  console.log('Running prompt evaluation...\n');
  
  const results = [];
  
  for (const testCase of testCases) {
    try {
      console.log(`Evaluating: ${testCase.name}`);
      const result = await evaluatePrompt(testCase);
      results.push(result);
      console.log(`  Latency: ${result.latency}ms`);
      console.log(`  Walls: ${result.walls}, Rooms: ${result.rooms}, Openings: ${result.openings}\n`);
    } catch (error) {
      console.error(`  Error: ${error.message}\n`);
      results.push({
        testCase: testCase.name,
        error: error.message
      });
    }
  }
  
  // Generate report
  const report = {
    timestamp: new Date().toISOString(),
    totalTests: testCases.length,
    results: results,
    summary: {
      avgLatency: results.reduce((sum, r) => sum + (r.latency || 0), 0) / results.length,
      totalWalls: results.reduce((sum, r) => sum + (r.walls || 0), 0),
      totalRooms: results.reduce((sum, r) => sum + (r.rooms || 0), 0),
      totalOpenings: results.reduce((sum, r) => sum + (r.openings || 0), 0)
    }
  };
  
  writeFileSync('./tests/prompt-eval-results.json', JSON.stringify(report, null, 2));
  console.log('Evaluation complete! Results saved to tests/prompt-eval-results.json');
}

runEvaluation();
```

**Setup test cases:**
```bash
mkdir -p tests/prompt-eval-cases

# Create test case files
cat > tests/prompt-eval-cases/simple-rectangle.json << EOF
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
EOF
```

**Run evaluation:**
```bash
# Start server
USE_LLM=true OPENAI_API_KEY=your_key npm start

# Run evaluation
node tests/prompt-eval.js
```

### Comparing Prompt Versions

**1. Test with current prompt:**
```bash
USE_LLM=true OPENAI_API_KEY=your_key npm start
node tests/prompt-eval.js
mv tests/prompt-eval-results.json tests/prompt-eval-baseline.json
```

**2. Modify prompt:**
```bash
# Edit prompts/topology.system.txt
```

**3. Test with new prompt:**
```bash
# Restart server
npm start
node tests/prompt-eval.js
mv tests/prompt-eval-results.json tests/prompt-eval-new.json
```

**4. Compare results:**
```bash
# Use jq to compare
jq '.summary' tests/prompt-eval-baseline.json
jq '.summary' tests/prompt-eval-new.json
```

## Writing New Tests

### Test File Structure

```javascript
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Test helper
function assert(condition, message) {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

function test(name, fn) {
  try {
    fn();
    console.log(`✓ ${name}`);
  } catch (error) {
    console.error(`✗ ${name}`);
    console.error(`  ${error.message}`);
    throw error;
  }
}

// Test cases
test('Test name', () => {
  // Test code
  assert(condition, 'Error message');
});

console.log('\nAll tests passed! ✓');
```

### Adding to package.json

```json
{
  "scripts": {
    "test:new": "node tests/new.test.js"
  }
}
```

## Test Best Practices

### 1. Test Isolation

- Each test should be independent
- Don't rely on test execution order
- Clean up after tests if needed

### 2. Use Mocks

- Mock external APIs (OpenAI)
- Mock file system operations if needed
- Use deterministic test data

### 3. Test Edge Cases

- Empty inputs
- Invalid inputs
- Boundary conditions
- Error conditions

### 4. Test Performance

- Measure latency
- Test with various input sizes
- Check memory usage if applicable

### 5. Keep Tests Fast

- Unit tests should be < 1 second
- Integration tests should be < 10 seconds
- E2E tests can be longer but should be run separately

### 6. Document Test Cases

- Add comments explaining test purpose
- Include expected behavior
- Note any assumptions

### 7. Continuous Integration

Set up CI to run tests automatically:

```yaml
# .github/workflows/test.yml
name: Tests
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      - uses: actions/setup-node@v2
      - run: npm install
      - run: npm run test:all
```

## Troubleshooting Tests

### Tests Failing

1. **Check environment:**
   ```bash
   node --version  # Should be 20+
   npm --version
   ```

2. **Reinstall dependencies:**
   ```bash
   rm -rf node_modules package-lock.json
   npm install
   ```

3. **Check test output:**
   ```bash
   node tests/schema.test.js 2>&1 | tee test-output.log
   ```

### LLM Tests Failing

- Ensure mocks are working correctly
- Check that OpenAI API is not being called
- Verify test isolation

### Integration Tests Failing

- Ensure server is running
- Check BASE_URL is correct
- Verify network connectivity
- Check server logs for errors

## Quick Reference

```bash
# Run all tests
npm run test:all

# Run specific test
npm test
npm run test:llm

# Manual test
node tests/schema.test.js

# Integration test
node tests/integration.test.js

# E2E test
node tests/e2e.test.js

# Prompt evaluation
node tests/prompt-eval.js
```

