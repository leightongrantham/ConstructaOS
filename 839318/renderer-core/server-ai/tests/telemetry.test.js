import { recordMetric, getAggregatedMetrics, getRecentMetrics, clearMetrics } from '../lib/telemetry.js';

// Test helper functions
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

console.log('Running telemetry tests...\n');

// Clear metrics before tests
clearMetrics();

test('Record metric and retrieve aggregated metrics', () => {
  recordMetric({
    requestId: 'test-1',
    model: 'gpt-4o-mini',
    latency: 100,
    tokens_in: 50,
    tokens_out: 30,
    success: true,
    inputSize: 1024
  });

  const metrics = getAggregatedMetrics();
  assert(metrics.totalRequests === 1, 'Should have 1 request');
  assert(metrics.successRate === 1, 'Should have 100% success rate');
  assert(metrics.avgLatency === 100, 'Should have correct average latency');
  assert(metrics.totalTokensIn === 50, 'Should have correct tokens in');
  assert(metrics.totalTokensOut === 30, 'Should have correct tokens out');
});

test('Record multiple metrics', () => {
  clearMetrics();
  
  recordMetric({ latency: 100, success: true, inputSize: 100 });
  recordMetric({ latency: 200, success: true, inputSize: 200 });
  recordMetric({ latency: 150, success: false, inputSize: 150 });

  const metrics = getAggregatedMetrics();
  assert(metrics.totalRequests === 3, 'Should have 3 requests');
  assert(metrics.successRate === 2/3, 'Should have 2/3 success rate');
  assert(metrics.avgLatency === 150, 'Should have correct average latency');
  assert(metrics.errors === 1, 'Should have 1 error');
});

test('Get recent metrics', () => {
  clearMetrics();
  
  recordMetric({ requestId: 'test-1', latency: 100, success: true, inputSize: 100 });
  recordMetric({ requestId: 'test-2', latency: 200, success: true, inputSize: 200 });
  recordMetric({ requestId: 'test-3', latency: 150, success: true, inputSize: 150 });

  const recent = getRecentMetrics(2);
  assert(recent.length === 2, 'Should return 2 recent metrics');
  assert(recent[recent.length - 1].requestId === 'test-3', 'Should return most recent first');
});

test('Metrics by model', () => {
  clearMetrics();
  
  recordMetric({ model: 'gpt-4o-mini', latency: 100, success: true, inputSize: 100 });
  recordMetric({ model: 'gpt-4o-mini', latency: 150, success: true, inputSize: 200 });
  recordMetric({ model: 'gpt-4', latency: 200, success: true, inputSize: 300 });

  const metrics = getAggregatedMetrics();
  assert(metrics.requestsByModel['gpt-4o-mini'] !== undefined, 'Should have gpt-4o-mini stats');
  assert(metrics.requestsByModel['gpt-4o-mini'].count === 2, 'Should have 2 requests for gpt-4o-mini');
  assert(metrics.requestsByModel['gpt-4o-mini'].avgLatency === 125, 'Should calculate avg latency');
  assert(metrics.requestsByModel['gpt-4'].count === 1, 'Should have 1 request for gpt-4');
});

test('Ring buffer limits to 1000 entries', () => {
  clearMetrics();
  
  // Add more than 1000 entries
  for (let i = 0; i < 1005; i++) {
    recordMetric({ requestId: `test-${i}`, latency: 100, success: true, inputSize: 100 });
  }

  const metrics = getAggregatedMetrics();
  assert(metrics.totalRequests === 1000, 'Should limit to 1000 entries');
});

test('Handle missing optional fields', () => {
  clearMetrics();
  
  recordMetric({
    latency: 100,
    success: true,
    inputSize: 100
    // Missing model, tokens, etc.
  });

  const metrics = getAggregatedMetrics();
  assert(metrics.totalRequests === 1, 'Should record metric');
  assert(metrics.totalTokensIn === 0, 'Should handle missing tokens');
});

console.log('\nAll tests passed! ✓');

