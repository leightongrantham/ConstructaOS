/**
 * Unit tests for aiClean client wrapper
 * Mocks fetch() to test various response scenarios
 */

import { aiClean } from '../ai-clean.js';

// Mock fetch globally
let mockFetch = null;
let fetchCallCount = 0;
let fetchCalls = [];

// Save original fetch if it exists
const originalFetch = globalThis.fetch;

// Setup function to reset mocks
function setupMocks() {
  fetchCallCount = 0;
  fetchCalls = [];
  mockFetch = null;
  
  globalThis.fetch = async (url, options) => {
    fetchCallCount++;
    fetchCalls.push({ url, options });
    
    if (mockFetch) {
      return mockFetch(url, options);
    }
    
    // Default: return success
    return {
      ok: true,
      status: 200,
      json: async () => ({
        walls: [],
        rooms: [],
        openings: [],
        meta: {
          scale: 0.01,
          bounds: { minX: 0, maxX: 0, minY: 0, maxY: 0 }
        }
      })
    };
  };
}

// Cleanup function
function cleanupMocks() {
  mockFetch = null;
  globalThis.fetch = originalFetch;
}

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

async function asyncTest(name, fn) {
  try {
    await fn();
    console.log(`✓ ${name}`);
  } catch (error) {
    console.error(`✗ ${name}`);
    console.error(`  ${error.message}`);
    throw error;
  }
}

console.log('Running aiClean client tests...\n');

// Test data
const testPolylines = [
  {
    points: [[0, 0], [10, 0], [10, 10], [0, 10]],
    closed: true
  }
];

const testMetadata = {
  imageSize: [1920, 1080],
  pxToMeters: 0.01
};

const successResponse = {
  walls: [
    {
      id: 'wall-1',
      start: [0, 0],
      end: [10, 0],
      thickness: 0.25,
      type: 'exterior'
    }
  ],
  rooms: [
    {
      id: 'room-1',
      polygon: [[0, 0], [10, 0], [10, 10], [0, 10]],
      area_m2: 100
    }
  ],
  openings: [],
  meta: {
    scale: 0.01,
    bounds: { minX: 0, maxX: 10, minY: 0, maxY: 10 }
  }
};

// Test: Successful request
await asyncTest('Successful request returns geometry', async () => {
  setupMocks();
  mockFetch = async () => ({
    ok: true,
    status: 200,
    json: async () => successResponse
  });

  const result = await aiClean(testPolylines, testMetadata);
  
  assert(Array.isArray(result.walls), 'Should have walls array');
  assert(Array.isArray(result.rooms), 'Should have rooms array');
  assert(Array.isArray(result.openings), 'Should have openings array');
  assert(result.meta !== undefined, 'Should have meta');
  assert(result.walls.length === 1, 'Should have 1 wall');
  cleanupMocks();
});

// Test: Invalid JSON response
await asyncTest('Invalid JSON response throws error', async () => {
  setupMocks();
  mockFetch = async () => ({
    ok: true,
    status: 200,
    json: async () => {
      throw new Error('Invalid JSON');
    }
  });

  try {
    await aiClean(testPolylines, testMetadata);
    assert(false, 'Should have thrown an error');
  } catch (error) {
    assert(error.message.includes('parse') || error.message.includes('JSON'), 
      'Error should mention JSON parsing');
  }
  cleanupMocks();
});

// Test: 500 error with retry
await asyncTest('500 error retries with exponential backoff', async () => {
  setupMocks();
  let attemptCount = 0;
  
  mockFetch = async () => {
    attemptCount++;
    if (attemptCount < 3) {
      return {
        ok: false,
        status: 500,
        text: async () => 'Internal Server Error'
      };
    }
    // Succeed on third attempt
    return {
      ok: true,
      status: 200,
      json: async () => successResponse
    };
  };

  const result = await aiClean(testPolylines, testMetadata, { maxRetries: 2 });
  
  assert(attemptCount === 3, 'Should have retried 2 times (3 total attempts)');
  assert(result.walls.length === 1, 'Should eventually succeed');
  cleanupMocks();
});

// Test: 429 rate limit error
await asyncTest('429 rate limit error retries with backoff', async () => {
  setupMocks();
  let attemptCount = 0;
  
  mockFetch = async () => {
    attemptCount++;
    if (attemptCount < 2) {
      return {
        ok: false,
        status: 429,
        text: async () => 'Rate limit exceeded'
      };
    }
    return {
      ok: true,
      status: 200,
      json: async () => successResponse
    };
  };

  const result = await aiClean(testPolylines, testMetadata, { maxRetries: 2 });
  
  assert(attemptCount === 2, 'Should have retried once');
  assert(result.walls.length === 1, 'Should eventually succeed');
  cleanupMocks();
});

// Test: All retries exhausted
await asyncTest('All retries exhausted throws error', async () => {
  setupMocks();
  mockFetch = async () => ({
    ok: false,
    status: 500,
    text: async () => 'Internal Server Error'
  });

  try {
    await aiClean(testPolylines, testMetadata, { maxRetries: 2 });
    assert(false, 'Should have thrown an error');
  } catch (error) {
    assert(error.message.includes('500') || error.message.includes('status'), 
      'Error should mention status code');
  }
  
  assert(fetchCallCount === 3, 'Should have made 3 attempts (1 initial + 2 retries)');
  cleanupMocks();
});

// Test: Timeout handling
await asyncTest('Request timeout retries', async () => {
  setupMocks();
  let attemptCount = 0;
  
  mockFetch = async (url, options) => {
    attemptCount++;
    
    // Simulate timeout on first two attempts
    if (attemptCount < 3) {
      // Wait a bit then abort
      await new Promise(resolve => setTimeout(resolve, 10));
      const abortError = new Error('Aborted');
      abortError.name = 'AbortError';
      throw abortError;
    }
    
    // Succeed on third attempt
    return {
      ok: true,
      status: 200,
      json: async () => successResponse
    };
  };

  const result = await aiClean(testPolylines, testMetadata, { 
    maxRetries: 2, 
    timeout: 50 
  });
  
  assert(attemptCount === 3, 'Should have retried after timeout');
  assert(result.walls.length === 1, 'Should eventually succeed');
  cleanupMocks();
});

// Test: Network error retries
await asyncTest('Network error retries', async () => {
  setupMocks();
  let attemptCount = 0;
  
  mockFetch = async () => {
    attemptCount++;
    if (attemptCount < 2) {
      throw new TypeError('Failed to fetch');
    }
    return {
      ok: true,
      status: 200,
      json: async () => successResponse
    };
  };

  const result = await aiClean(testPolylines, testMetadata, { maxRetries: 2 });
  
  assert(attemptCount === 2, 'Should have retried after network error');
  assert(result.walls.length === 1, 'Should eventually succeed');
  cleanupMocks();
});

// Test: Options - useLLM header
await asyncTest('useLLM option adds header', async () => {
  setupMocks();
  mockFetch = async (url, options) => {
    assert(options.headers['X-Use-LLM'] === 'true', 'Should include X-Use-LLM header');
    return {
      ok: true,
      status: 200,
      json: async () => successResponse
    };
  };

  await aiClean(testPolylines, testMetadata, { useLLM: true });
  cleanupMocks();
});

// Test: Options - preferDeterministic header
await asyncTest('preferDeterministic option adds header', async () => {
  setupMocks();
  mockFetch = async (url, options) => {
    assert(options.headers['X-Prefer-Deterministic'] === 'true', 
      'Should include X-Prefer-Deterministic header');
    return {
      ok: true,
      status: 200,
      json: async () => successResponse
    };
  };

  await aiClean(testPolylines, testMetadata, { preferDeterministic: true });
  cleanupMocks();
});

// Test: Input validation
await asyncTest('Invalid polylines throws error', async () => {
  setupMocks();
  try {
    await aiClean('not an array', testMetadata);
    assert(false, 'Should have thrown an error');
  } catch (error) {
    assert(error.message.includes('Polylines'), 'Error should mention polylines');
  }
  cleanupMocks();
});

await asyncTest('Invalid metadata throws error', async () => {
  setupMocks();
  try {
    await aiClean(testPolylines, {});
    assert(false, 'Should have thrown an error');
  } catch (error) {
    assert(error.message.includes('imageSize') || error.message.includes('Metadata'), 
      'Error should mention imageSize or metadata');
  }
  cleanupMocks();
});

// Test: Response with missing fields uses defaults
await asyncTest('Response with missing fields uses defaults', async () => {
  setupMocks();
  mockFetch = async () => ({
    ok: true,
    status: 200,
    json: async () => ({
      // Missing some fields
      walls: []
    })
  });

  const result = await aiClean(testPolylines, testMetadata);
  
  assert(Array.isArray(result.walls), 'Should have walls array');
  assert(Array.isArray(result.rooms), 'Should have rooms array (default)');
  assert(Array.isArray(result.openings), 'Should have openings array (default)');
  assert(result.meta !== undefined, 'Should have meta (default)');
  cleanupMocks();
});

console.log('\nAll tests passed! ✓');

