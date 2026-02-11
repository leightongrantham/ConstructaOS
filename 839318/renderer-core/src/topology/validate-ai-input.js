/**
 * Validation for AI topology input
 * Ensures geometry quality before sending to AI endpoint
 * All functions are pure and deterministic
 */

import { distance, lineAngle, lineLength } from '../utils/geom.js';

/**
 * Calculate the straightness of a polyline segment
 * Returns the ratio of direct distance to path length (1.0 = perfectly straight)
 * @param {[number, number][]} polyline - Input polyline
 * @returns {number} Straightness ratio (0-1, higher is straighter)
 */
function calculateStraightness(polyline) {
  if (!Array.isArray(polyline) || polyline.length < 2) {
    return 0;
  }
  
  if (polyline.length === 2) {
    return 1.0; // Two points are always straight
  }
  
  const firstPoint = polyline[0];
  const lastPoint = polyline[polyline.length - 1];
  const directDistance = distance(firstPoint, lastPoint);
  
  if (directDistance < 1e-6) {
    // Closed path or very small segment
    return 0;
  }
  
  // Calculate total path length
  let pathLength = 0;
  for (let i = 1; i < polyline.length; i++) {
    pathLength += lineLength(polyline[i - 1], polyline[i]);
  }
  
  if (pathLength < 1e-6) {
    return 0;
  }
  
  return directDistance / pathLength;
}

/**
 * Extract line segments from polylines
 * Converts polylines to straight line segments, filtering out fragmented micro-segments
 * @param {Array<[number, number][]>} polylines - Array of polylines
 * @param {Object} options - Options
 * @param {number} options.minWallLength - Minimum wall length (default: 20)
 * @param {number} options.minStraightness - Minimum straightness for entire polyline (default: 0.8)
 * @returns {Array<{start: [number, number], end: [number, number], length: number, straightness: number}>} Array of line segments
 */
function extractLineSegments(polylines, options = {}) {
  const {
    minWallLength = 20,
    minStraightness = 0.8
  } = options;
  
  const segments = [];
  
  for (const polyline of polylines) {
    if (!Array.isArray(polyline) || polyline.length < 2) {
      continue;
    }
    
    // Calculate straightness of entire polyline
    const straightness = calculateStraightness(polyline);
    const directLength = polyline.length >= 2 ? distance(polyline[0], polyline[polyline.length - 1]) : 0;
    
    // If polyline is sufficiently straight and long, treat it as a single wall segment
    if (polyline.length >= 2 && straightness >= minStraightness && directLength >= minWallLength) {
      segments.push({
        start: polyline[0],
        end: polyline[polyline.length - 1],
        length: directLength,
        straightness: straightness
      });
      continue;
    }
    
    // Otherwise, extract individual segments (for fragmented polylines)
    // But only keep segments that meet minimum length
    for (let i = 1; i < polyline.length; i++) {
      const start = polyline[i - 1];
      const end = polyline[i];
      const len = lineLength(start, end);
      
      // Only add segments that meet minimum length requirement
      if (len >= minWallLength) {
        segments.push({
          start,
          end,
          length: len,
          straightness: 1.0 // Individual segments are always straight
        });
      }
    }
    
    // If polyline is closed, check if we should add a closing segment
    if (polyline.length >= 3) {
      const first = polyline[0];
      const last = polyline[polyline.length - 1];
      const dist = distance(first, last);
      
      // Consider closed if first and last points are very close
      if (dist < 5.0) {
        const len = lineLength(last, first);
        // Only add if it meets minimum length
        if (len >= minWallLength) {
          segments.push({
            start: last,
            end: first,
            length: len,
            straightness: 1.0
          });
        }
      }
    }
  }
  
  return segments;
}

/**
 * Detect closed loops in polylines
 * @param {Array<[number, number][]>} polylines - Array of polylines
 * @param {number} closureTolerance - Distance tolerance for considering path closed (default: 5.0)
 * @returns {number} Number of closed loops detected
 */
function detectClosedLoops(polylines, closureTolerance = 5.0) {
  let closedCount = 0;
  
  for (const polyline of polylines) {
    if (!Array.isArray(polyline) || polyline.length < 3) {
      continue;
    }
    
    const first = polyline[0];
    const last = polyline[polyline.length - 1];
    const dist = distance(first, last);
    
    if (dist <= closureTolerance) {
      closedCount++;
    }
  }
  
  return closedCount;
}

/**
 * Filter walls by quality criteria
 * @param {Array<{start: [number, number], end: [number, number], length: number}>} segments - Line segments
 * @param {Object} options - Validation options
 * @param {number} options.minWallLength - Minimum wall length (default: 20)
 * @param {number} options.minStraightness - Minimum straightness ratio (default: 0.8)
 * @returns {Array} Valid walls
 */
function filterValidWalls(segments, options = {}) {
  const {
    minWallLength = 20,
    minStraightness = 0.8
  } = options;
  
  return segments.filter(segment => {
    // Check minimum length
    if (segment.length < minWallLength) {
      return false;
    }
    
    // For single segments, straightness is always 1.0
    // But we can check if it's a straight line by verifying no intermediate points
    // For now, single segments are considered valid if they meet length requirement
    return true;
  });
}

/**
 * Validate AI input geometry
 * Checks for quality walls, minimum count, and closed loops
 * @param {Array<[number, number][]>} polylines - Array of polylines to validate
 * @param {Object} options - Validation options
 * @param {number} options.minWallLength - Minimum wall length in pixels (default: 20)
 * @param {number} options.minStraightness - Minimum straightness ratio 0-1 (default: 0.8)
 * @param {number} options.minWalls - Minimum number of walls required (default: 3)
 * @param {number} options.minClosedLoops - Minimum number of closed loops (default: 1)
 * @param {number} options.closureTolerance - Distance tolerance for closed paths (default: 5.0)
 * @returns {{valid: boolean, error?: string, stats: Object}} Validation result
 */
export function validateAIInput(polylines, options = {}) {
  if (!Array.isArray(polylines) || polylines.length === 0) {
    return {
      valid: false,
      error: 'No polylines provided',
      stats: {
        polylineCount: 0,
        wallCount: 0,
        closedLoops: 0
      }
    };
  }
  
  const {
    minWallLength = 20,
    minStraightness = 0.8,
    minWalls = 3,
    minClosedLoops = 1,
    closureTolerance = 5.0
  } = options;
  
  // Extract line segments from polylines (with quality filtering)
  const segments = extractLineSegments(polylines, {
    minWallLength,
    minStraightness
  });
  
  // Filter valid walls (additional validation)
  const validWalls = filterValidWalls(segments, {
    minWallLength,
    minStraightness
  });
  
  // Detect closed loops
  const closedLoops = detectClosedLoops(polylines, closureTolerance);
  
  // Calculate statistics
  const stats = {
    polylineCount: polylines.length,
    segmentCount: segments.length,
    wallCount: validWalls.length,
    closedLoops,
    averageWallLength: validWalls.length > 0
      ? validWalls.reduce((sum, w) => sum + w.length, 0) / validWalls.length
      : 0,
    minWallLength: validWalls.length > 0
      ? Math.min(...validWalls.map(w => w.length))
      : 0,
    maxWallLength: validWalls.length > 0
      ? Math.max(...validWalls.map(w => w.length))
      : 0
  };
  
  // Validation checks
  const errors = [];
  
  if (validWalls.length < minWalls) {
    errors.push(
      `Insufficient walls: ${validWalls.length} found, minimum ${minWalls} required`
    );
  }
  
  if (closedLoops < minClosedLoops) {
    errors.push(
      `No closed loops detected: ${closedLoops} found, minimum ${minClosedLoops} required`
    );
  }
  
  if (segments.length > 0 && validWalls.length === 0) {
    errors.push(
      `All walls rejected: ${segments.length} segments found, but none meet quality criteria (minLength: ${minWallLength}px)`
    );
  }
  
  return {
    valid: errors.length === 0,
    error: errors.length > 0 ? errors.join('; ') : undefined,
    stats
  };
}

/**
 * Log geometry being sent to AI
 * Provides detailed logging of the exact geometry structure
 * @param {Array<[number, number][]>} polylines - Polylines to log
 * @param {Object} metadata - Metadata object
 */
export function logAIGeometry(polylines, metadata = {}) {
  console.log('📤 AI Input Geometry:');
  console.log('   Polylines:', polylines.length);
  
  // Log metadata
  if (metadata.imageSize) {
    console.log('   Image size:', metadata.imageSize);
  }
  if (metadata.pxToMeters) {
    console.log('   Scale:', metadata.pxToMeters, 'm/pixel');
  }
  
  // Log sample polylines
  const sampleCount = Math.min(5, polylines.length);
  console.log(`   Sample polylines (first ${sampleCount}):`);
  
  for (let i = 0; i < sampleCount; i++) {
    const polyline = polylines[i];
    if (!Array.isArray(polyline)) {
      console.log(`     [${i}]: Invalid (not an array)`);
      continue;
    }
    
    const pointCount = polyline.length;
    const firstPoint = polyline[0];
    const lastPoint = polyline[pointCount - 1];
    const isClosed = distance(firstPoint, lastPoint) < 5.0;
    const totalLength = polyline.reduce((sum, point, idx) => {
      if (idx === 0) return sum;
      return sum + lineLength(polyline[idx - 1], point);
    }, 0);
    
    console.log(`     [${i}]: ${pointCount} points, ${totalLength.toFixed(1)}px length, ${isClosed ? 'closed' : 'open'}`);
    console.log(`            First: [${firstPoint[0].toFixed(1)}, ${firstPoint[1].toFixed(1)}], Last: [${lastPoint[0].toFixed(1)}, ${lastPoint[1].toFixed(1)}]`);
    
    // Log first few points
    const samplePoints = polyline.slice(0, Math.min(3, pointCount));
    console.log(`            Points:`, samplePoints.map(p => `[${p[0].toFixed(1)},${p[1].toFixed(1)}]`).join(', '));
  }
  
  // Calculate and log aggregate statistics
  const segments = extractLineSegments(polylines, { minWallLength: 20, minStraightness: 0.8 });
  const validWalls = filterValidWalls(segments, { minWallLength: 20, minStraightness: 0.8 });
  const closedLoops = detectClosedLoops(polylines);
  
  console.log('   Aggregate statistics:');
  console.log(`     Total segments: ${segments.length}`);
  console.log(`     Valid walls (≥20px): ${validWalls.length}`);
  console.log(`     Closed loops: ${closedLoops}`);
  
  if (validWalls.length > 0) {
    const avgLength = validWalls.reduce((sum, w) => sum + w.length, 0) / validWalls.length;
    console.log(`     Average wall length: ${avgLength.toFixed(1)}px`);
    console.log(`     Min wall length: ${Math.min(...validWalls.map(w => w.length)).toFixed(1)}px`);
    console.log(`     Max wall length: ${Math.max(...validWalls.map(w => w.length)).toFixed(1)}px`);
  }
  
  // Log full geometry structure (first 3 polylines in detail)
  console.log('   Full geometry structure (first 3 polylines):');
  for (let i = 0; i < Math.min(3, polylines.length); i++) {
    const polyline = polylines[i];
    console.log(`     Polyline ${i}:`, JSON.stringify(polyline));
  }
}

