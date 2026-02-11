/**
 * Wall detection and extraction
 * Identifies and extracts wall geometry from vector data
 * All functions are pure and deterministic
 */

import { lineLength, distance, lineAngle, intersectSegments } from '../utils/geom.js';

/**
 * Check if a line segment represents a wall
 * Based on length, orientation, and context
 * @param {{start: [number, number], end: [number, number], thickness?: number}} line - Line to check
 * @param {Object} options - Detection options
 * @param {number} options.minLength - Minimum wall length (default: 10)
 * @param {number} options.maxLength - Maximum wall length (default: Infinity)
 * @returns {boolean} True if line is likely a wall
 */
function isWallCandidate(line, options = {}) {
  const { minLength = 10, maxLength = Infinity } = options;
  
  if (!line || !Array.isArray(line.start) || !Array.isArray(line.end)) {
    return false;
  }
  
  const length = lineLength(line.start, line.end);
  
  return length >= minLength && length <= maxLength;
}

/**
 * Detect walls from geometry
 * Extracts wall segments from line geometry
 * @param {Array<{start: [number, number], end: [number, number], thickness?: number}>} geometry - Input geometry
 * @param {Object} options - Detection options
 * @param {number} options.minLength - Minimum wall length (default: 10)
 * @param {number} options.defaultThickness - Default wall thickness if not specified (default: 2)
 * @returns {Array<{start: [number, number], end: [number, number], thickness: number}>} Detected walls
 */
export function detectWalls(geometry, options = {}) {
  const {
    minLength = 10,
    defaultThickness = 2
  } = options;
  
  if (!Array.isArray(geometry)) {
    return [];
  }
  
  return geometry
    .filter(line => isWallCandidate(line, { minLength }))
    .map(line => ({
      start: [line.start[0], line.start[1]],
      end: [line.end[0], line.end[1]],
      thickness: line.thickness !== undefined ? line.thickness : defaultThickness
    }));
}

/**
 * Extract wall geometry and openings
 * Identifies walls and openings (doors, windows) based on intersections
 * @param {Array<{start: [number, number], end: [number, number]}>} geometry - Input geometry
 * @param {Object} options - Extraction options
 * @param {number} options.minWallLength - Minimum wall length (default: 10)
 * @param {number} options.wallThickness - Wall thickness (default: 2)
 * @param {number} options.openingThreshold - Maximum gap size to consider an opening (default: 10)
 * @returns {Object} Object with { walls: Array, openings: Array }
 */
export function extractWallGeometry(geometry, options = {}) {
  const {
    minWallLength = 10,
    wallThickness = 2,
    openingThreshold = 10
  } = options;
  
  if (!Array.isArray(geometry) || geometry.length === 0) {
    return {
      walls: [],
      openings: []
    };
  }
  
  // Detect walls
  const walls = detectWalls(geometry, {
    minLength: minWallLength,
    defaultThickness: wallThickness
  });
  
  // Find openings (gaps between walls)
  const openings = findOpenings(walls, openingThreshold);
  
  return {
    walls: walls,
    openings: openings
  };
}

/**
 * Find openings between walls
 * Identifies gaps and intersections that could be doors/windows
 * @param {Array<{start: [number, number], end: [number, number], thickness: number}>} walls - Wall segments
 * @param {number} maxGapSize - Maximum gap size to consider an opening (default: 10)
 * @returns {Array<{start: [number, number], end: [number, number], type?: string}>} Openings
 */
function findOpenings(walls, maxGapSize = 10) {
  const openings = [];
  
  if (walls.length < 2) {
    return openings;
  }
  
  // Group walls by similar orientation (within tolerance)
  const wallGroups = groupWallsByOrientation(walls);
  
  // Find gaps within each group
  for (const group of wallGroups) {
    if (group.length < 2) continue;
    
    // Sort walls along their common direction
    const sortedWalls = sortWallsAlongDirection(group);
    
    // Find gaps between consecutive walls
    for (let i = 0; i < sortedWalls.length - 1; i++) {
      const wall1 = sortedWalls[i];
      const wall2 = sortedWalls[i + 1];
      
      const gap = calculateGapBetweenWalls(wall1, wall2);
      
      if (gap && gap.size <= maxGapSize && gap.size > 0) {
        openings.push({
          start: gap.start,
          end: gap.end,
          type: gap.size < maxGapSize / 2 ? 'door' : 'window'
        });
      }
    }
  }
  
  return openings;
}

/**
 * Group walls by orientation
 * Groups walls with similar angles (parallel or near-parallel)
 * @param {Array<{start: [number, number], end: [number, number]}>} walls - Walls to group
 * @param {number} angleTolerance - Angle tolerance in radians (default: 0.1)
 * @returns {Array<Array<{start: [number, number], end: [number, number]}>>} Groups of walls
 */
function groupWallsByOrientation(walls, angleTolerance = 0.1) {
  const groups = [];
  const used = new Set();
  
  for (let i = 0; i < walls.length; i++) {
    if (used.has(i)) continue;
    
    const group = [walls[i]];
    used.add(i);
    
    const angle1 = lineAngle(walls[i].start, walls[i].end);
    
    for (let j = i + 1; j < walls.length; j++) {
      if (used.has(j)) continue;
      
      const angle2 = lineAngle(walls[j].start, walls[j].end);
      const diff = Math.abs(normalizeAngleDiff(angle1 - angle2));
      
      // Check if parallel (same direction or opposite)
      if (diff < angleTolerance || Math.abs(diff - Math.PI) < angleTolerance) {
        group.push(walls[j]);
        used.add(j);
      }
    }
    
    groups.push(group);
  }
  
  return groups;
}

/**
 * Normalize angle difference to [0, π]
 * @param {number} diff - Angle difference
 * @returns {number} Normalized difference
 */
function normalizeAngleDiff(diff) {
  let normalized = diff;
  while (normalized > Math.PI) normalized -= Math.PI;
  while (normalized < 0) normalized += Math.PI;
  return normalized;
}

/**
 * Sort walls along their common direction
 * Projects walls onto a common axis and sorts by position
 * @param {Array<{start: [number, number], end: [number, number]}>} walls - Walls to sort
 * @returns {Array<{start: [number, number], end: [number, number]}>} Sorted walls
 */
function sortWallsAlongDirection(walls) {
  if (walls.length === 0) return [];
  
  // Use first wall's direction as reference
  const refAngle = lineAngle(walls[0].start, walls[0].end);
  const cosAngle = Math.cos(refAngle);
  const sinAngle = Math.sin(refAngle);
  
  // Project wall midpoints onto reference direction
  const withProjection = walls.map(wall => {
    const midX = (wall.start[0] + wall.end[0]) / 2;
    const midY = (wall.start[1] + wall.end[1]) / 2;
    const projection = midX * cosAngle + midY * sinAngle;
    
    return { wall, projection };
  });
  
  // Sort by projection
  withProjection.sort((a, b) => a.projection - b.projection);
  
  return withProjection.map(item => item.wall);
}

/**
 * Calculate gap between two walls
 * @param {{start: [number, number], end: [number, number]}} wall1 - First wall
 * @param {{start: [number, number], end: [number, number]}} wall2 - Second wall
 * @returns {Object|null} Gap object { start, end, size } or null if no gap
 */
function calculateGapBetweenWalls(wall1, wall2) {
  // Find closest endpoints
  const d11 = distance(wall1.end, wall2.start);
  const d12 = distance(wall1.end, wall2.end);
  const d21 = distance(wall1.start, wall2.start);
  const d22 = distance(wall1.start, wall2.end);
  
  // Find minimum distance pair
  const distances = [
    { dist: d11, start: wall1.end, end: wall2.start },
    { dist: d12, start: wall1.end, end: wall2.end },
    { dist: d21, start: wall1.start, end: wall2.start },
    { dist: d22, start: wall1.start, end: wall2.end }
  ];
  
  distances.sort((a, b) => a.dist - b.dist);
  const closest = distances[0];
  
  // Check if walls are aligned (same orientation)
  const angle1 = lineAngle(wall1.start, wall1.end);
  const angle2 = lineAngle(wall2.start, wall2.end);
  const angleDiff = Math.abs(normalizeAngleDiff(angle1 - angle2));
  
  // Walls are aligned if angles are similar or opposite
  const isAligned = angleDiff < 0.1 || Math.abs(angleDiff - Math.PI) < 0.1;
  
  if (isAligned && closest.dist > 0) {
    return {
      start: [closest.start[0], closest.start[1]],
      end: [closest.end[0], closest.end[1]],
      size: closest.dist
    };
  }
  
  return null;
}

/**
 * Classify walls (exterior, interior, etc.)
 * @param {Array<{start: [number, number], end: [number, number], thickness: number}>} walls - Walls to classify
 * @param {Object} options - Classification options
 * @param {number} options.exteriorThickness - Typical exterior wall thickness (default: 6)
 * @param {number} options.interiorThickness - Typical interior wall thickness (default: 2)
 * @returns {Array<{start: [number, number], end: [number, number], thickness: number, type: string}>} Classified walls
 */
export function classifyWalls(walls, options = {}) {
  const {
    exteriorThickness = 6,
    interiorThickness = 2
  } = options;
  
  if (!Array.isArray(walls)) {
    return [];
  }
  
  const thicknessThreshold = (exteriorThickness + interiorThickness) / 2;
  
  return walls.map(wall => {
    const type = wall.thickness >= thicknessThreshold ? 'exterior' : 'interior';
    
    return {
      ...wall,
      type: type
    };
  });
}

/**
 * Simplified wrapper: Extract walls from polylines
 * Converts polylines to line segments and extracts wall geometry
 * @param {Array<Array<[number, number]>>} polylines - Array of polylines, each is array of [x,y] points
 * @param {Object} options - Extraction options
 * @param {number} options.minWallLength - Minimum wall length (default: 10)
 * @param {number} options.wallThickness - Wall thickness (default: 2)
 * @returns {Array<{start: [number, number], end: [number, number], thickness: number}>} Extracted walls
 */
export function extractWalls(polylines, options = {}) {
  const {
    minWallLength = 10,
    wallThickness = 2
  } = options;

  if (!Array.isArray(polylines)) {
    return [];
  }

  // Convert polylines to line segments
  const geometry = [];
  
  polylines.forEach(polyline => {
    if (!Array.isArray(polyline) || polyline.length < 2) {
      return;
    }

    for (let i = 0; i < polyline.length - 1; i++) {
      const start = polyline[i];
      const end = polyline[i + 1];

      // Validate points
      if (!Array.isArray(start) || !Array.isArray(end) ||
          start.length < 2 || end.length < 2) {
        continue;
      }

      const [x1, y1] = start;
      const [x2, y2] = end;

      // Check for valid numbers and non-zero length
      if (!Number.isFinite(x1) || !Number.isFinite(y1) ||
          !Number.isFinite(x2) || !Number.isFinite(y2)) {
        continue;
      }

      const dx = x2 - x1;
      const dy = y2 - y1;
      const length = Math.sqrt(dx * dx + dy * dy);

      // Only add lines with non-zero length
      if (length > 0.001) {
        geometry.push({
          start: [x1, y1],
          end: [x2, y2],
          thickness: wallThickness
        });
      }
    }
  });

  // Detect walls from geometry
  return detectWalls(geometry, {
    minLength: minWallLength,
    defaultThickness: wallThickness
  });
}