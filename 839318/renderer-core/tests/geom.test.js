/**
 * Unit tests for geometry utilities
 */

import {
  distance,
  lineAngle,
  lineLength,
  projectPoint,
  intersectSegments,
  midpoint,
  simplifyPolyline,
  normalizeAngle,
  isParallel
} from '../src/utils/geom.js';

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

// Test distance()
console.log('Testing distance()...');
assertClose(distance([0, 0], [3, 4]), 5, 1e-6, 'Pythagorean triple');
assertClose(distance([1, 1], [4, 5]), 5, 1e-6, 'Offset points');
assertClose(distance([0, 0], [0, 0]), 0, 1e-6, 'Same point');
assertClose(distance({x: 0, y: 0}, {x: 3, y: 4}), 5, 1e-6, 'Object format');
console.log('✓ distance() tests passed');

// Test lineAngle()
console.log('Testing lineAngle()...');
assertClose(lineAngle([0, 0], [1, 0]), 0, 1e-6, 'Right (0 degrees)');
assertClose(lineAngle([0, 0], [0, 1]), Math.PI / 2, 1e-6, 'Up (90 degrees)');
assertClose(lineAngle([0, 0], [-1, 0]), Math.PI, 1e-6, 'Left (180 degrees)');
assertClose(lineAngle([0, 0], [0, -1]), 3 * Math.PI / 2, 1e-6, 'Down (270 degrees)');
assertClose(lineAngle([0, 0], [1, 1]), Math.PI / 4, 1e-6, '45 degrees');
assertClose(lineAngle([5, 5], [8, 5]), 0, 1e-6, 'Horizontal offset');
console.log('✓ lineAngle() tests passed');

// Test lineLength()
console.log('Testing lineLength()...');
assertClose(lineLength([0, 0], [3, 4]), 5, 1e-6, 'Pythagorean triple');
assertClose(lineLength([0, 0], [0, 0]), 0, 1e-6, 'Zero length');
assertClose(lineLength([1, 2], [4, 6]), 5, 1e-6, 'Offset points');
console.log('✓ lineLength() tests passed');

// Test midpoint()
console.log('Testing midpoint()...');
assertPointClose(midpoint([0, 0], [4, 6]), [2, 3], 1e-6);
assertPointClose(midpoint([1, 2], [5, 8]), [3, 5], 1e-6);
assertPointClose(midpoint([0, 0], [0, 0]), [0, 0], 1e-6);
assertPointClose(midpoint([-2, -3], [2, 3]), [0, 0], 1e-6);
console.log('✓ midpoint() tests passed');

// Test projectPoint()
console.log('Testing projectPoint()...');
// Project onto horizontal line
assertPointClose(projectPoint([2, 2], [0, 0], [4, 0]), [2, 0], 1e-6, 'Horizontal line');
// Project onto vertical line
assertPointClose(projectPoint([2, 2], [0, 0], [0, 4]), [0, 2], 1e-6, 'Vertical line');
// Project point already on line
assertPointClose(projectPoint([2, 2], [0, 0], [4, 4]), [2, 2], 1e-6, 'Point on line');
// Project point beyond segment start
assertPointClose(projectPoint([-1, -1], [0, 0], [4, 4]), [0, 0], 1e-6, 'Clamped to start');
// Project point beyond segment end
assertPointClose(projectPoint([5, 5], [0, 0], [4, 4]), [4, 4], 1e-6, 'Clamped to end');
// Project onto diagonal
const proj = projectPoint([3, 1], [0, 0], [4, 4]);
assertPointClose(proj, [2, 2], 1e-6, 'Diagonal projection');
console.log('✓ projectPoint() tests passed');

// Test intersectSegments()
console.log('Testing intersectSegments()...');
// Intersecting segments
let result = intersectSegments([0, 0], [4, 4], [0, 4], [4, 0]);
assertPointClose(result, [2, 2], 1e-6, 'Diagonal intersection');
// Parallel segments
result = intersectSegments([0, 0], [4, 0], [0, 2], [4, 2]);
assert(result === null, 'Parallel segments should not intersect');
// Non-intersecting segments
result = intersectSegments([0, 0], [2, 2], [5, 5], [7, 7]);
assert(result === null, 'Non-intersecting segments');
// Overlapping segments (collinear but not intersecting)
result = intersectSegments([0, 0], [2, 2], [3, 3], [5, 5]);
assert(result === null, 'Collinear non-overlapping segments');
// Perpendicular intersection
result = intersectSegments([0, 1], [4, 1], [2, 0], [2, 4]);
assertPointClose(result, [2, 1], 1e-6, 'Perpendicular intersection');
// Segments that would intersect if extended
result = intersectSegments([0, 0], [2, 2], [3, 0], [5, 2]);
assert(result === null, 'Segments that only intersect if extended');
console.log('✓ intersectSegments() tests passed');

// Test simplifyPolyline()
console.log('Testing simplifyPolyline()...');
// Simple line (should remain unchanged)
let points = [[0, 0], [10, 10]];
let simplified = simplifyPolyline(points, 1.0);
assert(simplified.length === 2, 'Simple line unchanged');
assertPointClose(simplified[0], [0, 0], 1e-6);
assertPointClose(simplified[1], [10, 10], 1e-6);
// Point in middle within tolerance
points = [[0, 0], [5, 5], [10, 10]];
simplified = simplifyPolyline(points, 2.0);
assert(simplified.length === 2, 'Middle point within tolerance should be removed');
// Point in middle outside tolerance
points = [[0, 0], [5, 6], [10, 10]];
simplified = simplifyPolyline(points, 0.5);
assert(simplified.length === 3, 'Middle point outside tolerance should be kept');
// Complex polyline
points = [[0, 0], [1, 0.1], [2, 0], [3, 0.1], [4, 0], [5, 0]];
simplified = simplifyPolyline(points, 0.5);
assert(simplified.length >= 2, 'Complex polyline simplified');
// Single point
points = [[5, 5]];
simplified = simplifyPolyline(points);
assert(simplified.length === 1, 'Single point unchanged');
// Empty array
points = [];
simplified = simplifyPolyline(points);
assert(simplified.length === 0, 'Empty array unchanged');
console.log('✓ simplifyPolyline() tests passed');

// Test normalizeAngle()
console.log('Testing normalizeAngle()...');
assertClose(normalizeAngle(0), 0, 1e-6);
assertClose(normalizeAngle(Math.PI), Math.PI, 1e-6);
assertClose(normalizeAngle(2 * Math.PI), 0, 1e-6);
assertClose(normalizeAngle(-Math.PI), Math.PI, 1e-6);
assertClose(normalizeAngle(3 * Math.PI), Math.PI, 1e-6);
assertClose(normalizeAngle(-Math.PI / 2), 3 * Math.PI / 2, 1e-6);
console.log('✓ normalizeAngle() tests passed');

// Test isParallel()
console.log('Testing isParallel()...');
assert(isParallel([0, 0], [4, 0], [0, 2], [4, 2]), 'Horizontal parallel lines');
assert(isParallel([0, 0], [0, 4], [2, 0], [2, 4]), 'Vertical parallel lines');
assert(isParallel([0, 0], [4, 4], [1, 1], [5, 5]), 'Diagonal parallel lines');
assert(!isParallel([0, 0], [4, 0], [0, 0], [0, 4]), 'Perpendicular lines');
assert(isParallel([0, 0], [4, 4], [0, 0], [-4, -4], 0.01), 'Anti-parallel lines');
console.log('✓ isParallel() tests passed');

console.log('\n✅ All geometry utility tests passed!');
