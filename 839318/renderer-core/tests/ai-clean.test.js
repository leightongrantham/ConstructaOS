/**
 * Unit tests for AI topology cleaning functions
 * Note: Tests mock fetch API
 */

import {
  cleanTopology,
  detectErrors,
  fixTopology
} from '../src/topology/ai-clean.js';

// Simple test assertion helper
function assert(condition, message) {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

// Helper to create test paths
function createTestPaths() {
  return [
    [[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]], // Closed rectangle
    [[20, 20], [30, 20], [30, 30]] // Open path
  ];
}

// Mock fetch for testing
let mockFetch = null;
function setupMockFetch(responseData, status = 200, delay = 0) {
  mockFetch = async (url, options) => {
    if (delay > 0) {
      await new Promise(resolve => setTimeout(resolve, delay));
    }
    
    return {
      ok: status >= 200 && status < 300,
      status: status,
      json: async () => responseData,
      text: async () => JSON.stringify(responseData)
    };
  };
  
  global.fetch = mockFetch;
}

function restoreFetch() {
  if (typeof global.fetch !== 'undefined') {
    delete global.fetch;
  }
  mockFetch = null;
}

async function runTests() {
  console.log('Running AI cleanup tests...\n');
  
  try {
    // Test detectErrors with valid paths
    console.log('Testing detectErrors() with valid paths...');
    const validPaths = createTestPaths();
    const errors = detectErrors(validPaths);
    assert(errors.length === 0, 'Valid paths should produce no errors');
    console.log('✓ detectErrors() valid paths test passed');
    
    // Test detectErrors with invalid paths
    console.log('Testing detectErrors() with invalid paths...');
    const invalidPaths = [
      [[0, 0]], // Too few points
      [[0, 0], [NaN, 5]], // Invalid point
      'not an array', // Wrong type
      [[0, 0], [10, 10]] // This one is valid
    ];
    const invalidErrors = detectErrors(invalidPaths);
    assert(invalidErrors.length > 0, 'Invalid paths should produce errors');
    console.log('✓ detectErrors() invalid paths test passed');
    
    // Test fixTopology
    console.log('Testing fixTopology()...');
    const brokenPaths = [
      [[0, 0], [10, 10]], // Valid
      [[NaN, NaN], [20, 20]], // Invalid point
      [[0, 0]], // Too short
      [[5, 5], [15, 15], [25, 25]] // Valid
    ];
    const fixed = fixTopology(brokenPaths);
    assert(fixed.length === 2, 'Should fix and return valid paths');
    assert(fixed.every(path => path.length >= 2), 'All fixed paths should have >= 2 points');
    console.log('✓ fixTopology() test passed');
    
    // Test cleanTopology with valid response
    console.log('Testing cleanTopology() with valid response...');
    const validResponse = {
      walls: [
        { start: [0, 0], end: [10, 0], thickness: 2 },
        { start: [10, 0], end: [10, 10], thickness: 2 }
      ],
      openings: [
        { start: [5, 0], end: [7, 0], type: 'door', width: 2 }
      ],
      rooms: [
        { boundary: [[0, 0], [10, 0], [10, 10], [0, 10]] }
      ]
    };
    
    setupMockFetch(validResponse, 200);
    
    const paths = createTestPaths();
    const result = await cleanTopology(paths, 'https://api.example.com/clean', {
      validateResponse: true
    });
    
    assert(Array.isArray(result.walls), 'Result should have walls array');
    assert(result.walls.length === 2, 'Should have 2 walls');
    assert(Array.isArray(result.openings), 'Result should have openings array');
    assert(Array.isArray(result.rooms), 'Result should have rooms array');
    
    // Validate wall structure
    const wall = result.walls[0];
    assert(Array.isArray(wall.start) && wall.start.length === 2, 'Wall should have start [x,y]');
    assert(Array.isArray(wall.end) && wall.end.length === 2, 'Wall should have end [x,y]');
    assert(typeof wall.thickness === 'number' && wall.thickness > 0, 'Wall should have thickness > 0');
    
    console.log('✓ cleanTopology() valid response test passed');
    
    // Test cleanTopology with missing arrays (should default to empty)
    console.log('Testing cleanTopology() with missing arrays...');
    const partialResponse = {
      walls: [{ start: [0, 0], end: [10, 0], thickness: 2 }]
      // openings and rooms missing
    };
    
    setupMockFetch(partialResponse, 200);
    const result2 = await cleanTopology(paths, 'https://api.example.com/clean');
    assert(Array.isArray(result2.walls) && result2.walls.length === 1, 'Should have walls');
    assert(Array.isArray(result2.openings) && result2.openings.length === 0, 'Should default openings to empty array');
    assert(Array.isArray(result2.rooms) && result2.rooms.length === 0, 'Should default rooms to empty array');
    console.log('✓ cleanTopology() missing arrays test passed');
    
    // Test cleanTopology validation errors
    console.log('Testing cleanTopology() validation errors...');
    const invalidResponse = {
      walls: [
        { start: [0, 0], end: [10, 0] } // Missing thickness
      ]
    };
    
    setupMockFetch(invalidResponse, 200);
    try {
      await cleanTopology(paths, 'https://api.example.com/clean', {
        validateResponse: true
      });
      assert(false, 'Should throw validation error');
    } catch (error) {
      assert(error.message.includes('validation failed'), 'Should throw validation error');
    }
    console.log('✓ cleanTopology() validation error test passed');
    
    // Test cleanTopology with HTTP error
    console.log('Testing cleanTopology() with HTTP error...');
    setupMockFetch({ error: 'Server error' }, 500);
    try {
      await cleanTopology(paths, 'https://api.example.com/clean');
      assert(false, 'Should throw error for HTTP 500');
    } catch (error) {
      assert(error.message.includes('status 500'), 'Should throw HTTP error');
    }
    console.log('✓ cleanTopology() HTTP error test passed');
    
    // Test cleanTopology with timeout
    console.log('Testing cleanTopology() with timeout...');
    setupMockFetch({ walls: [] }, 200, 100); // 100ms delay
    try {
      await cleanTopology(paths, 'https://api.example.com/clean', {
        timeout: 50 // 50ms timeout
      });
      assert(false, 'Should throw timeout error');
    } catch (error) {
      assert(error.message.includes('timed out'), 'Should throw timeout error');
    }
    console.log('✓ cleanTopology() timeout test passed');
    
    // Test cleanTopology with invalid input paths
    console.log('Testing cleanTopology() with invalid input...');
    setupMockFetch({ walls: [] }, 200);
    try {
      await cleanTopology(null, 'https://api.example.com/clean');
      assert(false, 'Should throw error for null paths');
    } catch (error) {
      assert(error.message.includes('must be an array'), 'Should throw input validation error');
    }
    
    try {
      await cleanTopology([], 'https://api.example.com/clean');
      assert(false, 'Should throw error for empty paths');
    } catch (error) {
      assert(error.message.includes('cannot be empty'), 'Should throw error for empty array');
    }
    console.log('✓ cleanTopology() input validation test passed');
    
    // Test cleanTopology with invalid JSON response
    console.log('Testing cleanTopology() with invalid JSON...');
    const invalidJsonFetch = async () => {
      return {
        ok: true,
        status: 200,
        json: async () => {
          throw new Error('Invalid JSON');
        },
        text: async () => 'not json'
      };
    };
    global.fetch = invalidJsonFetch;
    
    try {
      await cleanTopology(paths, 'https://api.example.com/clean');
      assert(false, 'Should throw JSON parse error');
    } catch (error) {
      assert(error.message.includes('Failed to parse'), 'Should throw JSON parse error');
    }
    console.log('✓ cleanTopology() invalid JSON test passed');
    
    // Test cleanTopology with custom headers
    console.log('Testing cleanTopology() with custom headers...');
    let capturedHeaders = null;
    const headerCaptureFetch = async (url, options) => {
      capturedHeaders = options.headers;
      return {
        ok: true,
        status: 200,
        json: async () => ({ walls: [] }),
        text: async () => '{}'
      };
    };
    global.fetch = headerCaptureFetch;
    
    await cleanTopology(paths, 'https://api.example.com/clean', {
      headers: { 'Authorization': 'Bearer token123', 'X-Custom': 'value' }
    });
    
    assert(capturedHeaders['Content-Type'] === 'application/json', 'Should set Content-Type');
    assert(capturedHeaders['Authorization'] === 'Bearer token123', 'Should include custom headers');
    assert(capturedHeaders['X-Custom'] === 'value', 'Should include custom headers');
    console.log('✓ cleanTopology() custom headers test passed');
    
    console.log('\n✅ All AI cleanup tests passed!');
    
  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
    console.error(error.stack);
    throw error;
  } finally {
    restoreFetch();
  }
}

// Run tests if in browser/worker context or Node
if (typeof window !== 'undefined' || typeof self !== 'undefined' || typeof global !== 'undefined') {
  runTests().catch(console.error);
}

export { runTests };

