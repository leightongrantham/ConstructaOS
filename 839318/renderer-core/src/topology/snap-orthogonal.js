/**
 * Orthogonal snapping
 * Snaps lines and angles to orthogonal orientations (0, 90, 180, 270 degrees)
 * Uses angle bucketing for deterministic snapping
 * All functions are pure and deterministic
 */

import { lineAngle, normalizeAngle, distance } from '../utils/geom.js';

/**
 * Normalize angle to nearest orthogonal (0, 90, 180, 270 degrees)
 * @param {number} angle - Angle in radians
 * @returns {number} Nearest orthogonal angle in radians
 */
function snapAngleToOrthogonal(angle) {
  const degrees = (angle * 180) / Math.PI;
  const normalizedDegrees = ((degrees % 360) + 360) % 360;
  
  // Find nearest 90-degree increment
  const quarter = Math.round(normalizedDegrees / 90);
  const snappedDegrees = (quarter % 4) * 90;
  
  return (snappedDegrees * Math.PI) / 180;
}

/**
 * Snap an angle to orthogonal within tolerance
 * @param {number} angle - Angle in radians
 * @param {number} tolerance - Angle tolerance in radians (default: 0.1 rad ≈ 5.7°)
 * @returns {number|null} Snapped angle in radians, or null if outside tolerance
 */
function snapAngleWithTolerance(angle, tolerance = 0.1) {
  const normalized = normalizeAngle(angle);
  const orthogonal = snapAngleToOrthogonal(normalized);
  const diff = Math.min(
    Math.abs(normalized - orthogonal),
    Math.abs(normalized - (orthogonal + 2 * Math.PI)),
    Math.abs(normalized - (orthogonal - 2 * Math.PI))
  );
  
  // Normalize difference to [0, PI]
  const normalizedDiff = Math.min(diff, 2 * Math.PI - diff);
  
  if (normalizedDiff <= tolerance) {
    return orthogonal;
  }
  
  return null; // Outside tolerance, don't snap
}

/**
 * Bucket angles into orthogonal categories
 * Groups angles into 0°, 90°, 180°, 270° buckets
 * @param {number[]} angles - Array of angles in radians
 * @param {number} tolerance - Angle tolerance in radians (default: 0.1 rad ≈ 5.7°)
 * @returns {Object} Object with buckets: { '0': [...], '90': [...], '180': [...], '270': [...] }
 */
export function bucketAngles(angles, tolerance = 0.1) {
  const buckets = {
    '0': [],
    '90': [],
    '180': [],
    '270': []
  };
  
  angles.forEach((angle, index) => {
    const snapped = snapAngleWithTolerance(angle, tolerance);
    if (snapped !== null) {
      const degrees = Math.round((snapped * 180) / Math.PI);
      const key = String(degrees % 360);
      if (buckets[key] !== undefined) {
        buckets[key].push({ angle, snapped, index });
      }
    }
  });
  
  return buckets;
}

/**
 * Snap a line segment to orthogonal orientation
 * @param {[number, number]} start - Start point [x, y]
 * @param {[number, number]} end - End point [x, y]
 * @param {number} tolerance - Angle tolerance in radians (default: 0.1 rad ≈ 5.7°)
 * @returns {Object|null} Snapped line { start, end } or null if outside tolerance
 */
export function snapLineToOrthogonal(start, end, tolerance = 0.1) {
  const angle = lineAngle(start, end);
  const snappedAngle = snapAngleWithTolerance(angle, tolerance);
  
  if (snappedAngle === null) {
    return null; // Outside tolerance
  }
  
  const length = distance(start, end);
  
  // Calculate new end point based on snapped angle
  const newEnd = [
    start[0] + length * Math.cos(snappedAngle),
    start[1] + length * Math.sin(snappedAngle)
  ];
  
  return {
    start: [start[0], start[1]],
    end: newEnd
  };
}

/**
 * Snap multiple lines to orthogonal orientations
 * @param {Array<{start: [number, number], end: [number, number]}>} lines - Array of line objects
 * @param {number} tolerance - Angle tolerance in radians (default: 0.1 rad ≈ 5.7°)
 * @returns {Array<{start: [number, number], end: [number, number]}>} Snapped lines
 */
export function snapLinesToOrthogonal(lines, tolerance = 0.1) {
  if (!Array.isArray(lines)) {
    return lines;
  }
  
  return lines.map(line => {
    if (!line || !Array.isArray(line.start) || !Array.isArray(line.end)) {
      return line; // Invalid line, return as-is
    }
    
    const snapped = snapLineToOrthogonal(line.start, line.end, tolerance);
    return snapped !== null ? snapped : line;
  });
}

/**
 * Snap geometry to orthogonal grid
 * Snaps points to grid and lines to orthogonal orientations
 * @param {Array<{start: [number, number], end: [number, number]}>} geometry - Geometry to snap
 * @param {Object} options - Snapping options
 * @param {number} options.tolerance - Angle tolerance in radians (default: 0.1)
 * @param {number} options.gridSize - Grid size for point snapping (default: 10, set to 0 to disable)
 * @returns {Array<{start: [number, number], end: [number, number]}>} Snapped geometry
 */
export function snapToOrthogonal(geometry, options = {}) {
  const {
    tolerance = 0.1,
    gridSize = 10
  } = options;
  
  if (!Array.isArray(geometry)) {
    return geometry;
  }
  
  // First snap to grid if enabled
  let snapped = geometry;
  if (gridSize > 0) {
    snapped = geometry.map(line => ({
      start: snapToGrid(line.start, gridSize),
      end: snapToGrid(line.end, gridSize)
    }));
  }
  
  // Then snap lines to orthogonal
  return snapLinesToOrthogonal(snapped, tolerance);
}

/**
 * Snap a point to grid
 * @param {[number, number]} point - Point to snap
 * @param {number} gridSize - Grid size
 * @returns {[number, number]} Snapped point
 */
function snapToGrid(point, gridSize) {
  return [
    Math.round(point[0] / gridSize) * gridSize,
    Math.round(point[1] / gridSize) * gridSize
  ];
}

/**
 * Get dominant orthogonal direction from a set of lines
 * Uses angle bucketing to find most common orientation
 * @param {Array<{start: [number, number], end: [number, number]}>} lines - Array of lines
 * @param {number} tolerance - Angle tolerance in radians (default: 0.1)
 * @returns {number|null} Dominant angle in radians, or null if no clear direction
 */
export function getDominantOrthogonalDirection(lines, tolerance = 0.1) {
  if (!Array.isArray(lines) || lines.length === 0) {
    return null;
  }
  
  // Extract angles
  const angles = lines
    .filter(line => line && Array.isArray(line.start) && Array.isArray(line.end))
    .map(line => lineAngle(line.start, line.end));
  
  if (angles.length === 0) {
    return null;
  }
  
  // Bucket angles
  const buckets = bucketAngles(angles, tolerance);
  
  // Find bucket with most angles
  let maxCount = 0;
  let dominantKey = null;
  
  for (const [key, bucket] of Object.entries(buckets)) {
    if (bucket.length > maxCount) {
      maxCount = bucket.length;
      dominantKey = key;
    }
  }
  
  if (dominantKey === null || maxCount === 0) {
    return null;
  }
  
  // Convert key to radians
  return (parseInt(dominantKey) * Math.PI) / 180;
}

/**
 * Simplified wrapper: Snap lines to orthogonal orientation
 * @param {Array<{start: [number, number], end: [number, number]}>} lines - Lines to snap
 * @param {number} toleranceDeg - Angle tolerance in degrees (default: 5)
 * @returns {Array<{start: [number, number], end: [number, number]}>} Snapped lines
 */
export function snapOrthogonal(lines, toleranceDeg = 5) {
  const tolerance = (toleranceDeg * Math.PI) / 180; // Convert to radians
  return snapLinesToOrthogonal(lines, tolerance);
}