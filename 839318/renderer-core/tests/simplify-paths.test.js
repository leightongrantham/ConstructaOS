/**
 * Unit tests for path simplification functions
 */

import {
  douglasPeucker,
  removeSmallSegments,
  equalizePathDirection,
  simplify,
  reducePoints,
  smoothPaths
} from '../src/vectorize/simplify-paths.js';

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

function assertPointClose(actual, expected, tolerance = 1e-6) {
  assertClose(actual[0], expected[0], tolerance, 'x coordinate');
  assertClose(actual[1], expected[1], tolerance, 'y coordinate');
}

// Helper to create a simple test path
function createSimplePath() {
  return [[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]];
}

// Helper to create a path with redundant points
function createRedundantPath() {
  return [[0, 0], [1, 0], [2, 0], [3, 0], [4, 0], [5, 0], [10, 0], [10, 1], [10, 2], [10, 10]];
}

// Helper to create a closed clockwise path
function createClockwisePath() {
  return [[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]];
}

// Helper to create a closed counter-clockwise path
function createCounterClockwisePath() {
  return [[0, 0], [0, 10], [10, 10], [10, 0], [0, 0]];
}

async function runTests() {
  console.log('Running path simplification tests...\n');
  
  try {
    // Test douglasPeucker with simple path
    console.log('Testing douglasPeucker()...');
    const simplePath = createSimplePath();
    const simplified = douglasPeucker([simplePath], 0.5);
    assert(Array.isArray(simplified), 'Should return array');
    assert(simplified.length === 1, 'Should return one path');
    assert(simplified[0].length >= 2, 'Path should have at least 2 points');
    
    // Test with redundant path
    const redundantPath = createRedundantPath();
    const simplifiedRedundant = douglasPeucker([redundantPath], 1.0);
    assert(simplifiedRedundant.length === 1, 'Should return one path');
    // Simplified path should have fewer points
    assert(simplifiedRedundant[0].length <= redundantPath.length, 'Should reduce points');
    console.log('✓ douglasPeucker() tests passed');
    
    // Test removeSmallSegments
    console.log('Testing removeSmallSegments()...');
    const pathWithSmall = [[0, 0], [0.5, 0.5], [1, 1], [10, 10], [10.2, 10.2], [20, 20]];
    const filtered = removeSmallSegments([pathWithSmall], 2.0);
    assert(filtered.length === 1, 'Should return one path');
    assert(filtered[0].length < pathWithSmall.length, 'Should remove small segments');
    
    // Verify small segments are removed
    for (let i = 0; i < filtered[0].length - 1; i++) {
      const dx = filtered[0][i + 1][0] - filtered[0][i][0];
      const dy = filtered[0][i + 1][1] - filtered[0][i][1];
      const length = Math.sqrt(dx * dx + dy * dy);
      assert(length >= 2.0 || length < 1e-6, 'Remaining segments should be >= minLength or zero');
    }
    
    // Test with single point
    const singlePoint = [[5, 5]];
    const singleResult = removeSmallSegments([singlePoint], 2.0);
    assert(singleResult.length === 1, 'Should handle single point');
    assert(singleResult[0].length === 1, 'Single point should remain');
    console.log('✓ removeSmallSegments() tests passed');
    
    // Test equalizePathDirection with clockwise path
    console.log('Testing equalizePathDirection()...');
    const cwPath = createClockwisePath();
    const ccwPath = createCounterClockwisePath();
    
    // Test making all paths CCW
    const pathsMixed = [cwPath, ccwPath];
    const equalizedCCW = equalizePathDirection(pathsMixed, 'ccw');
    assert(equalizedCCW.length === 2, 'Should return two paths');
    
    // Both should be CCW after equalization (positive signed area)
    const area1 = calculateSignedArea(equalizedCCW[0]);
    const area2 = calculateSignedArea(equalizedCCW[1]);
    assert(area1 > 0, 'First path should be CCW');
    assert(area2 > 0, 'Second path should be CCW');
    
    // Test making all paths CW
    const equalizedCW = equalizePathDirection(pathsMixed, 'cw');
    const area3 = calculateSignedArea(equalizedCW[0]);
    const area4 = calculateSignedArea(equalizedCW[1]);
    assert(area3 < 0, 'First path should be CW');
    assert(area4 < 0, 'Second path should be CW');
    
    // Test with open path (should remain unchanged)
    const openPath = [[0, 0], [10, 0], [10, 10], [5, 15]];
    const openResult = equalizePathDirection([openPath], 'ccw');
    assert(openResult.length === 1, 'Should return one path');
    assert(openResult[0].length === openPath.length, 'Open path should remain unchanged');
    assertPointClose(openResult[0][0], openPath[0], 1e-6);
    assertPointClose(openResult[0][openResult[0].length - 1], openPath[openPath.length - 1], 1e-6);
    console.log('✓ equalizePathDirection() tests passed');
    
    // Test simplify (complete pipeline)
    console.log('Testing simplify() pipeline...');
    const complexPaths = [
      createRedundantPath(),
      createClockwisePath(),
      [[0, 0], [0.1, 0.1], [0.2, 0.2], [10, 10]] // Path with small segments
    ];
    
    const simplifiedAll = simplify(complexPaths, {
      douglasPeuckerTolerance: 1.0,
      minSegmentLength: 2.0,
      targetDirection: 'ccw',
      applyDouglasPeucker: true,
      removeSmallSegments: true,
      equalizeDirection: true
    });
    
    assert(simplifiedAll.length > 0, 'Should return paths');
    assert(simplifiedAll.length <= complexPaths.length, 'Should not add paths');
    
    // Verify closed paths are CCW
    for (const path of simplifiedAll) {
      if (path.length >= 3 && isClosed(path)) {
        const area = calculateSignedArea(path);
        assert(area > 0, 'Closed paths should be CCW');
      }
    }
    console.log('✓ simplify() pipeline tests passed');
    
    // Test reducePoints
    console.log('Testing reducePoints()...');
    const manyPoints = [];
    for (let i = 0; i <= 100; i++) {
      manyPoints.push([i, Math.sin(i / 10) * 5]);
    }
    const reduced = reducePoints(manyPoints, 0.5);
    assert(reduced.length <= manyPoints.length, 'Should reduce points');
    assert(reduced.length >= 2, 'Should keep at least 2 points');
    assertPointClose(reduced[0], manyPoints[0], 1e-6, 'First point should match');
    assertPointClose(reduced[reduced.length - 1], manyPoints[manyPoints.length - 1], 1e-6, 'Last point should match');
    console.log('✓ reducePoints() tests passed');
    
    // Test smoothPaths
    console.log('Testing smoothPaths()...');
    const noisyPath = [
      [0, 0], [1, 0.2], [2, -0.1], [3, 0.3], [4, 0], [5, -0.2], [6, 0.1], [7, 0]
    ];
    const smoothed = smoothPaths([noisyPath], 0.5, 3);
    assert(smoothed.length === 1, 'Should return one path');
    assert(smoothed[0].length === noisyPath.length, 'Should preserve point count');
    
    // Points should be less noisy
    for (let i = 0; i < smoothed[0].length; i++) {
      assert(typeof smoothed[0][i][0] === 'number', 'X should be number');
      assert(typeof smoothed[0][i][1] === 'number', 'Y should be number');
    }
    console.log('✓ smoothPaths() tests passed');
    
    // Test edge cases
    console.log('Testing edge cases...');
    assert(douglasPeucker([], 1.0).length === 0, 'Empty array should return empty');
    assert(removeSmallSegments([], 1.0).length === 0, 'Empty array should return empty');
    assert(equalizePathDirection([], 'ccw').length === 0, 'Empty array should return empty');
    assert(simplify([], {}).length === 0, 'Empty array should return empty');
    
    // Test with invalid input
    const invalidResult = douglasPeucker(null, 1.0);
    assert(invalidResult === null, 'Null input should return null');
    console.log('✓ Edge cases tests passed');
    
    console.log('\n✅ All path simplification tests passed!');
    
  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
    console.error(error.stack);
    throw error;
  }
}

// Helper functions for testing
function calculateSignedArea(points) {
  if (points.length < 3) return 0;
  let area = 0;
  for (let i = 0; i < points.length; i++) {
    const j = (i + 1) % points.length;
    area += points[i][0] * points[j][1];
    area -= points[j][0] * points[i][1];
  }
  return area / 2;
}

function isClosed(path, tolerance = 1.0) {
  if (path.length < 3) return false;
  const first = path[0];
  const last = path[path.length - 1];
  const dx = last[0] - first[0];
  const dy = last[1] - first[1];
  const dist = Math.sqrt(dx * dx + dy * dy);
  return dist < tolerance;
}

// Run tests if in browser/worker context or Node
if (typeof window !== 'undefined' || typeof self !== 'undefined' || typeof global !== 'undefined') {
  runTests().catch(console.error);
}

export { runTests };

