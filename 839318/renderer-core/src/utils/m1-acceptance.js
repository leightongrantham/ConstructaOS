/**
 * M1 Acceptance Checks
 * Validates pipeline output meets minimum quality thresholds
 * Fails fast if conditions are not met
 * All functions are pure and deterministic
 */

import { distance } from './geom.js';

/**
 * Detect closed loops in polylines
 * @param {Array<[number, number][]>} polylines - Array of polylines
 * @param {number} closureTolerance - Distance tolerance for considering path closed (default: 5.0)
 * @returns {number} Number of closed loops detected
 */
function detectClosedLoops(polylines, closureTolerance = 5.0) {
  if (!Array.isArray(polylines) || polylines.length === 0) {
    return 0;
  }
  
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
 * Detect closed loops from walls
 * Checks if walls form closed perimeters
 * @param {Array<{start: [number, number], end: [number, number]}>} walls - Array of walls
 * @param {number} closureTolerance - Distance tolerance for considering closed (default: 5.0)
 * @returns {number} Number of closed loops detected
 */
function detectClosedLoopsFromWalls(walls, closureTolerance = 5.0) {
  if (!Array.isArray(walls) || walls.length < 3) {
    return 0;
  }
  
  // Simple approach: check if there are rooms defined
  // For now, we'll count connected wall segments that form closed paths
  // This is a simplified check - full room detection is more complex
  
  // Extract all unique endpoints
  const endpoints = new Map();
  const pointKey = (p) => `${Math.round(p[0] / closureTolerance) * closureTolerance},${Math.round(p[1] / closureTolerance) * closureTolerance}`;
  
  let segmentCount = 0;
  for (const wall of walls) {
    if (!wall || !Array.isArray(wall.start) || !Array.isArray(wall.end)) {
      continue;
    }
    
    const startKey = pointKey(wall.start);
    const endKey = pointKey(wall.end);
    
    endpoints.set(startKey, (endpoints.get(startKey) || 0) + 1);
    endpoints.set(endKey, (endpoints.get(endKey) || 0) + 1);
    segmentCount++;
  }
  
  // Count endpoints that appear at least twice (likely part of a closed loop)
  let closedEndpoints = 0;
  for (const count of endpoints.values()) {
    if (count >= 2) {
      closedEndpoints++;
    }
  }
  
  // Rough estimate: if we have many connected endpoints, likely closed loops
  // This is a heuristic - a proper implementation would do path following
  if (closedEndpoints >= 4 && segmentCount >= 4) {
    return Math.floor(closedEndpoints / 4); // Rough estimate
  }
  
  return 0;
}

/**
 * M1 Acceptance Check
 * Validates pipeline output meets minimum quality thresholds:
 * - Vectorized polylines < 200
 * - Walls >= 10
 * - At least 1 closed loop OR explicit warning shown
 * 
 * @param {Object} pipelineResult - Pipeline result object
 * @param {Object} pipelineResult.vectorized - Vectorized result with polylines
 * @param {Object} pipelineResult.topology - Topology result with walls and rooms
 * @param {Object} options - Check options
 * @param {number} options.maxPolylines - Maximum polylines allowed (default: 200)
 * @param {number} options.minWalls - Minimum walls required (default: 10)
 * @param {number} options.minClosedLoops - Minimum closed loops required (default: 1)
 * @param {boolean} options.allowWarning - Allow warning instead of failing if no closed loops (default: false)
 * @returns {{accepted: boolean, errors: string[], warnings: string[], stats: Object}} Acceptance result
 */
export function checkM1Acceptance(pipelineResult, options = {}) {
  const {
    maxPolylines = 200,
    minWalls = 10,
    minClosedLoops = 1,
    allowWarning = false
  } = options;
  
  const errors = [];
  const warnings = [];
  const stats = {};
  
  // Extract data
  const vectorized = pipelineResult?.vectorized || {};
  const topology = pipelineResult?.topology || {};
  
  const polylines = vectorized?.polylines || vectorized?.paths || [];
  const walls = topology?.walls || [];
  const rooms = topology?.rooms || [];
  
  // Check 1: Vectorized polylines < 200
  const polylineCount = Array.isArray(polylines) ? polylines.length : 0;
  stats.polylineCount = polylineCount;
  
  if (polylineCount >= maxPolylines) {
    errors.push(
      `Too many polylines: ${polylineCount} found (max: ${maxPolylines}). ` +
      `This indicates poor vectorization quality or input preprocessing issues.`
    );
  }
  
  // Check 2: Walls >= 10
  const wallCount = Array.isArray(walls) ? walls.length : 0;
  stats.wallCount = wallCount;
  
  if (wallCount < minWalls) {
    errors.push(
      `Insufficient walls: ${wallCount} found (min: ${minWalls} required). ` +
      `This indicates poor geometry extraction or topology processing failure.`
    );
  }
  
  // Check 3: At least 1 closed loop
  // Try to detect from rooms first (most reliable)
  let closedLoopCount = 0;
  const roomCount = Array.isArray(rooms) ? rooms.length : 0;
  
  // Rooms are always considered closed loops
  if (roomCount > 0) {
    closedLoopCount = roomCount;
  }
  
  // If no rooms detected, try detecting from polylines
  const polylineLoops = closedLoopCount === 0 ? detectClosedLoops(polylines, 5.0) : 0;
  if (polylineLoops > 0) {
    closedLoopCount = polylineLoops;
  }
  
  // If still no loops, try detecting from walls
  const wallLoops = closedLoopCount === 0 ? detectClosedLoopsFromWalls(walls, 5.0) : 0;
  if (wallLoops > 0) {
    closedLoopCount = wallLoops;
  }
  
  stats.closedLoopCount = closedLoopCount;
  stats.roomCount = roomCount;
  stats.polylineLoops = polylineLoops;
  stats.wallLoops = wallLoops;
  
  if (closedLoopCount < minClosedLoops) {
    const message = `No closed loops detected: ${closedLoopCount} found (min: ${minClosedLoops} required). ` +
                   `This may indicate incomplete geometry or missing room boundaries. ` +
                   `(Rooms: ${roomCount}, Polyline loops: ${polylineLoops}, Wall loops: ${wallLoops})`;
    
    if (allowWarning) {
      warnings.push(message);
    } else {
      errors.push(message);
    }
  }
  
  // Calculate acceptance
  const accepted = errors.length === 0;
  
  return {
    accepted,
    errors,
    warnings,
    stats
  };
}

/**
 * Validate and throw if M1 acceptance fails
 * Convenience function that throws on failure
 * @param {Object} pipelineResult - Pipeline result object
 * @param {Object} options - Check options
 * @throws {Error} If acceptance check fails
 */
export function validateM1Acceptance(pipelineResult, options = {}) {
  const result = checkM1Acceptance(pipelineResult, options);
  
  if (!result.accepted) {
    const errorMessage = [
      'M1 Acceptance Check FAILED:',
      '',
      'Errors:',
      ...result.errors.map(e => `  ❌ ${e}`),
      '',
      'Statistics:',
      `  Polylines: ${result.stats.polylineCount}`,
      `  Walls: ${result.stats.wallCount}`,
      `  Closed loops: ${result.stats.closedLoopCount}`,
      `  Rooms: ${result.stats.roomCount || 0}`
    ].join('\n');
    
    const error = new Error(errorMessage);
    error.type = 'M1_ACCEPTANCE_FAILED';
    error.acceptanceResult = result;
    throw error;
  }
  
  if (result.warnings.length > 0) {
    console.warn('⚠️ M1 Acceptance Check warnings:');
    result.warnings.forEach(w => console.warn(`   ${w}`));
  }
  
  return result;
}

