#!/usr/bin/env node
/**
 * Replay a saved request from request logs
 * Usage: node scripts/replay-request.js <request-file.json> [endpoint-url]
 */

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const requestFile = process.argv[2];
const endpointUrl = process.argv[3] || process.env.ENDPOINT_URL || 'http://localhost:3001/api/topology/ai-clean';

if (!requestFile) {
  console.error('Usage: node scripts/replay-request.js <request-file.json> [endpoint-url]');
  console.error('   or: ENDPOINT_URL=http://... node scripts/replay-request.js <request-file.json>');
  process.exit(1);
}

try {
  const request = JSON.parse(readFileSync(requestFile, 'utf-8'));
  
  console.log(`Replaying request: ${request.requestId}`);
  console.log(`Timestamp: ${request.timestamp}`);
  console.log(`Endpoint: ${endpointUrl}\n`);
  
  const startTime = Date.now();
  const response = await fetch(endpointUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request.body)
  });
  
  const duration = Date.now() - startTime;
  const result = await response.json();
  
  console.log(`Status: ${response.status}`);
  console.log(`Duration: ${duration}ms`);
  console.log(`Original latency: ${request.latency}ms`);
  console.log('\nResponse:');
  console.log(JSON.stringify(result, null, 2));
  
  if (response.status !== 200) {
    process.exit(1);
  }
  
} catch (error) {
  console.error('Error replaying request:', error.message);
  process.exit(1);
}

