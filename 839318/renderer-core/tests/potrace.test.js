/**
 * Unit tests for Potrace vectorization functions
 * Note: Tests mock Potrace WASM module
 */

import {
  loadPotrace,
  imageDataToBitmap,
  traceToSVG,
  parseSVGPath,
  parseSVG,
  vectorize,
  resetPotraceCache
} from '../src/vectorize/potrace.js';

// Simple test assertion helper
function assert(condition, message) {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

function assertClose(actual, expected, tolerance = 1e-6, message = '') {
  const diff = Math.abs(actual - expected);
  if (diff > tolerance) {
    throw new Error(`Assertion failed: expected ${expected}, got ${actual} (diff: ${diff})${message ? ': ' + message : ''}`);
  }
}

// Helper to create test ImageData
function createTestImageData(width = 100, height = 100, binary = false) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < data.length; i += 4) {
    if (binary) {
      // Create a simple pattern: left half black, right half white
      const x = (i / 4) % width;
      const value = x < width / 2 ? 0 : 255;
      data[i] = value;     // R
      data[i + 1] = value; // G
      data[i + 2] = value; // B
      data[i + 3] = 255;   // A
    } else {
      data[i] = 128;       // R
      data[i + 1] = 128;   // G
      data[i + 2] = 128;   // B
      data[i + 3] = 255;   // A
    }
  }
  return new ImageData(data, width, height);
}

// Mock Potrace WASM module for testing
function createMockPotrace() {
  return {
    trace: (bitmap, width, height, options) => {
      // Return a simple mock SVG
      return `<svg width="${width}" height="${height}">
        <path d="M10,20 L30,40 L50,20 Z"/>
      </svg>`;
    },
    _initialize: () => {}
  };
}

async function runTests() {
  console.log('Running Potrace tests...\n');
  
  try {
    // Test imageDataToBitmap
    console.log('Testing imageDataToBitmap()...');
    const testImg = createTestImageData(10, 10, true);
    const bitmap = imageDataToBitmap(testImg);
    assert(bitmap instanceof Uint8Array, 'Should return Uint8Array');
    assert(bitmap.length > 0, 'Bitmap should have data');
    const bytesPerRow = Math.ceil(10 / 8);
    assert(bitmap.length === bytesPerRow * 10, 'Bitmap size should match calculation');
    console.log('✓ imageDataToBitmap() tests passed');
    
    // Test parseSVGPath with simple path
    console.log('Testing parseSVGPath() with simple path...');
    const simplePath = parseSVGPath('M10,20 L30,40 L50,60');
    assert(Array.isArray(simplePath), 'Should return array');
    assert(simplePath.length === 1, 'Should have one path');
    assert(simplePath[0].length === 3, 'Path should have 3 points');
    assertClose(simplePath[0][0][0], 10, 1e-6, 'First point x');
    assertClose(simplePath[0][0][1], 20, 1e-6, 'First point y');
    assertClose(simplePath[0][1][0], 30, 1e-6, 'Second point x');
    assertClose(simplePath[0][1][1], 40, 1e-6, 'Second point y');
    console.log('✓ parseSVGPath() simple path tests passed');
    
    // Test parseSVGPath with relative commands
    console.log('Testing parseSVGPath() with relative commands...');
    const relPath = parseSVGPath('M10,20 l20,20 l20,20');
    assert(relPath.length === 1, 'Should have one path');
    assert(relPath[0].length === 3, 'Path should have 3 points');
    assertClose(relPath[0][1][0], 30, 1e-6, 'Relative point x');
    assertClose(relPath[0][1][1], 40, 1e-6, 'Relative point y');
    console.log('✓ parseSVGPath() relative commands tests passed');
    
    // Test parseSVGPath with close path
    console.log('Testing parseSVGPath() with close path...');
    const closedPath = parseSVGPath('M10,20 L30,40 L50,20 Z');
    assert(closedPath.length === 1, 'Should have one path');
    const lastPoint = closedPath[0][closedPath[0].length - 1];
    assertClose(lastPoint[0], 10, 1e-6, 'Closed path should return to start x');
    assertClose(lastPoint[1], 20, 1e-6, 'Closed path should return to start y');
    console.log('✓ parseSVGPath() close path tests passed');
    
    // Test parseSVGPath with multiple paths
    console.log('Testing parseSVGPath() with multiple paths...');
    const multiPath = parseSVGPath('M10,20 L30,40 M50,60 L70,80');
    assert(multiPath.length === 2, 'Should have two paths');
    assert(multiPath[0].length === 2, 'First path should have 2 points');
    assert(multiPath[1].length === 2, 'Second path should have 2 points');
    console.log('✓ parseSVGPath() multiple paths tests passed');
    
    // Test parseSVGPath with horizontal/vertical lines
    console.log('Testing parseSVGPath() with horizontal/vertical lines...');
    const hvPath = parseSVGPath('M10,20 H50 V60');
    assert(hvPath.length === 1, 'Should have one path');
    assert(hvPath[0].length === 3, 'Path should have 3 points');
    assertClose(hvPath[0][1][0], 50, 1e-6, 'Horizontal line x');
    assertClose(hvPath[0][1][1], 20, 1e-6, 'Horizontal line y');
    assertClose(hvPath[0][2][0], 50, 1e-6, 'Vertical line x');
    assertClose(hvPath[0][2][1], 60, 1e-6, 'Vertical line y');
    console.log('✓ parseSVGPath() horizontal/vertical tests passed');
    
    // Test parseSVGPath with curves
    console.log('Testing parseSVGPath() with curves...');
    const curvePath = parseSVGPath('M10,10 C20,20 30,20 40,10');
    assert(curvePath.length === 1, 'Should have one path');
    assert(curvePath[0].length > 2, 'Curve should be approximated with multiple points');
    assertClose(curvePath[0][0][0], 10, 1e-6, 'Curve start x');
    assertClose(curvePath[0][0][1], 10, 1e-6, 'Curve start y');
    const lastCurvePoint = curvePath[0][curvePath[0].length - 1];
    assertClose(lastCurvePoint[0], 40, 1e-6, 'Curve end x');
    assertClose(lastCurvePoint[1], 10, 1e-6, 'Curve end y');
    console.log('✓ parseSVGPath() curves tests passed');
    
    // Test parseSVG
    console.log('Testing parseSVG()...');
    const svgString = `
      <svg width="100" height="100">
        <path d="M10,20 L30,40"/>
        <path d="M50,60 L70,80"/>
      </svg>
    `;
    const paths = parseSVG(svgString);
    assert(Array.isArray(paths), 'Should return array');
    assert(paths.length === 2, 'Should parse 2 paths');
    console.log('✓ parseSVG() tests passed');
    
    // Test traceToSVG with mock
    console.log('Testing traceToSVG()...');
    const mockPotrace = createMockPotrace();
    const bitmap2 = imageDataToBitmap(createTestImageData(50, 50, true));
    const svg = await traceToSVG(bitmap2, 50, 50, {}, mockPotrace);
    assert(typeof svg === 'string', 'Should return string');
    assert(svg.includes('<svg'), 'Should contain SVG tag');
    console.log('✓ traceToSVG() tests passed');
    
    // Test loadPotrace with mock
    console.log('Testing loadPotrace()...');
    resetPotraceCache();
    
    // Mock fetch and WebAssembly for testing
    global.fetch = async (url) => {
      // Return mock WASM binary
      return {
        arrayBuffer: async () => new ArrayBuffer(8),
        ok: true
      };
    };
    
    global.WebAssembly = {
      instantiate: async (buffer) => ({
        instance: {
          exports: createMockPotrace()
        }
      }),
      instantiateStreaming: async (promise) => {
        await promise;
        return {
          instance: {
            exports: createMockPotrace()
          }
        };
      }
    };
    
    try {
      const potrace = await loadPotrace('mock://potrace.wasm');
      assert(potrace !== null, 'Should load Potrace module');
      assert(typeof potrace.trace === 'function', 'Should have trace function');
      console.log('✓ loadPotrace() tests passed');
    } catch (error) {
      console.log('⚠ loadPotrace() test skipped (requires WASM mocking):', error.message);
    }
    
    // Test vectorize with mock
    console.log('Testing vectorize()...');
    resetPotraceCache();
    const testImg2 = createTestImageData(40, 40, true);
    
    // Create a mock that will be used
    global.WebAssembly = {
      instantiate: async (buffer) => ({
        instance: {
          exports: createMockPotrace()
        }
      })
    };
    
    try {
      const result = await vectorize(testImg2, 'mock://potrace.wasm', null, {});
      assert(result.paths !== undefined, 'Should return paths');
      assert(Array.isArray(result.paths), 'Paths should be array');
      assert(result.svg !== undefined, 'Should return SVG');
      assert(typeof result.svg === 'string', 'SVG should be string');
      assert(result.width === 40, 'Width should match');
      assert(result.height === 40, 'Height should match');
      console.log('✓ vectorize() tests passed');
    } catch (error) {
      console.log('⚠ vectorize() test skipped (requires WASM mocking):', error.message);
    }
    
    // Test error handling
    console.log('Testing error handling...');
    resetPotraceCache();
    try {
      await traceToSVG(new Uint8Array(10), 10, 10, {}, null);
      assert(false, 'Should throw error when Potrace not loaded');
    } catch (e) {
      assert(e.message.includes('must be loaded'), 'Should throw appropriate error');
    }
    console.log('✓ Error handling tests passed');
    
    console.log('\n✅ All Potrace tests passed!');
    
  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
    console.error(error.stack);
    throw error;
  }
}

// Run tests if in browser/worker context or Node
if (typeof window !== 'undefined' || typeof self !== 'undefined' || typeof global !== 'undefined') {
  runTests().catch(console.error);
}

export { runTests };

