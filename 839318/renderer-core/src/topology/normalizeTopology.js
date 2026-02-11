/**
 * Topology Normalization Layer
 * 
 * Converts raw topology output (polylines, paths) into normalized wall segments
 * that match the renderer's expected format.
 * 
 * This module isolates geometry cleanup from rendering logic.
 */

/**
 * Default wall thickness in same units as coordinates (300mm)
 */
const DEFAULT_WALL_THICKNESS = 300;

/**
 * Default wall height in same units as coordinates (2700mm = 2.7m)
 */
const DEFAULT_WALL_HEIGHT = 2700;

/**
 * Target size for normalization (largest dimension scaled to ~1000 units)
 */
const TARGET_SIZE = 1000;

/**
 * Minimum plan dimensions to avoid degenerate geometry (width/height must be >= 10)
 */
const MIN_PLAN_DIMENSION = 10;

/**
 * Axon rotation angle (45 degrees) to fix vertical column issue
 */
const AXON_ROTATION_ANGLE = Math.PI / 4; // 45 degrees

/**
 * Convert a polyline array to individual wall segments
 * 
 * Each polyline [[x1,y1],[x2,y2],[x3,y3]] is converted into segments
 * connecting consecutive points.
 * 
 * @param {Array<[number, number]>} polyline - Array of [x, y] points
 * @param {number} thickness - Wall thickness (default: 300)
 * @param {number} height - Wall height (default: 2700)
 * @returns {Array<{start: [number, number], end: [number, number], thickness: number, height: number}>} Array of wall segments
 */
function polylineToWallSegments(polyline, thickness = DEFAULT_WALL_THICKNESS, height = DEFAULT_WALL_HEIGHT) {
  if (!Array.isArray(polyline) || polyline.length < 2) {
    return [];
  }
  
  const walls = [];
  
  // Convert consecutive points into wall segments
  for (let i = 0; i < polyline.length - 1; i++) {
    const start = polyline[i];
    const end = polyline[i + 1];
    
    // Ensure points are valid [x, y] arrays (no Z values)
    if (!Array.isArray(start) || start.length < 2 || !Array.isArray(end) || end.length < 2) {
      continue; // Skip invalid points
    }
    
    // Extract only x and y coordinates (ignore any Z values)
    const start2D = [start[0], start[1]];
    const end2D = [end[0], end[1]];
    
    walls.push({
      start: start2D,
      end: end2D,
      thickness: thickness,
      height: height
    });
  }
  
  return walls;
}

/**
 * Orthogonalize a wall by snapping it to horizontal or vertical
 * Based on which axis has the larger delta
 * 
 * @param {{start: [number, number], end: [number, number]}} wall - Wall to orthogonalize
 * @returns {{start: [number, number], end: [number, number]}} Orthogonalized wall
 */
function orthogonalizeWall(wall) {
  const [sx, sy] = wall.start;
  const [ex, ey] = wall.end;
  
  const dx = ex - sx;
  const dy = ey - sy;
  
  // Determine which axis has the larger delta
  if (Math.abs(dx) >= Math.abs(dy)) {
    // Snap to horizontal (keep Y constant)
    return {
      start: wall.start,
      end: [ex, sy], // Keep Y from start
      thickness: wall.thickness,
      height: wall.height
    };
  } else {
    // Snap to vertical (keep X constant)
    return {
      start: wall.start,
      end: [sx, ey], // Keep X from start
      thickness: wall.thickness,
      height: wall.height
    };
  }
}

/**
 * Compute 2D bounding box of all wall start/end points
 * 
 * @param {Array<{start: [number, number], end: [number, number]}>} walls - Array of walls
 * @returns {{minX: number, maxX: number, minY: number, maxY: number, width: number, height: number}} Bounding box
 */
function computePlanBounds(walls) {
  if (!walls || walls.length === 0) {
    return {
      minX: 0,
      maxX: 0,
      minY: 0,
      maxY: 0,
      width: 0,
      height: 0
    };
  }
  
  // Collect all points
  const allPoints = [];
  for (const wall of walls) {
    if (Array.isArray(wall.start) && wall.start.length >= 2) {
      allPoints.push([wall.start[0], wall.start[1]]);
    }
    if (Array.isArray(wall.end) && wall.end.length >= 2) {
      allPoints.push([wall.end[0], wall.end[1]]);
    }
  }
  
  if (allPoints.length === 0) {
    return {
      minX: 0,
      maxX: 0,
      minY: 0,
      maxY: 0,
      width: 0,
      height: 0
    };
  }
  
  const xs = allPoints.map(p => p[0]);
  const ys = allPoints.map(p => p[1]);
  
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  
  return {
    minX,
    maxX,
    minY,
    maxY,
    width: maxX - minX,
    height: maxY - minY
  };
}

/**
 * Validate plan geometry - check for degenerate plans
 * Throws error if plan footprint is collapsed (width or height < 10)
 * 
 * @param {Array<{start: [number, number], end: [number, number]}>} walls - Array of walls
 * @throws {Error} If plan is degenerate (width < 10 or height < 10)
 */
function validatePlanDegeneracy(walls) {
  const bounds = computePlanBounds(walls);
  
  // Log dimensions for debugging
  console.log('📐 Plan bounds:', {
    width: bounds.width.toFixed(2),
    height: bounds.height.toFixed(2),
    minX: bounds.minX.toFixed(2),
    maxX: bounds.maxX.toFixed(2),
    minY: bounds.minY.toFixed(2),
    maxY: bounds.maxY.toFixed(2)
  });
  
  // Check for degenerate plan (collapsed footprint)
  if (bounds.width < MIN_PLAN_DIMENSION || bounds.height < MIN_PLAN_DIMENSION) {
    throw new Error(
      `Degenerate plan: footprint collapsed (width=${bounds.width.toFixed(2)}, height=${bounds.height.toFixed(2)}, minimum=${MIN_PLAN_DIMENSION})`
    );
  }
}

/**
 * Normalize and center plan geometry
 * 
 * - Computes plan centroid
 * - Recenters walls around (0, 0)
 * - Scales the largest dimension to ~1000 units
 * 
 * @param {Array<{start: [number, number], end: [number, number]}>} walls - Array of walls
 * @returns {Array<{start: [number, number], end: [number, number], thickness: number, height: number}>} Normalized walls
 */
function normalizePlanCoordinates(walls) {
  if (!walls || walls.length === 0) {
    return walls;
  }
  
  // Compute bounds and centroid
  const bounds = computePlanBounds(walls);
  const centroidX = (bounds.minX + bounds.maxX) / 2;
  const centroidY = (bounds.minY + bounds.maxY) / 2;
  
  // Calculate scale to fit largest dimension to TARGET_SIZE
  const maxDimension = Math.max(bounds.width, bounds.height);
  const scale = maxDimension > 0 ? TARGET_SIZE / maxDimension : 1.0;
  
  // Transform walls: translate to center, then scale
  return walls.map(wall => ({
    start: [
      (wall.start[0] - centroidX) * scale,
      (wall.start[1] - centroidY) * scale
    ],
    end: [
      (wall.end[0] - centroidX) * scale,
      (wall.end[1] - centroidY) * scale
    ],
    thickness: wall.thickness || DEFAULT_WALL_THICKNESS,
    height: wall.height || DEFAULT_WALL_HEIGHT
  }));
}

/**
 * Rotate a 2D point around the origin by a given angle
 * 
 * @param {[number, number]} point - Point [x, y] to rotate
 * @param {number} angle - Rotation angle in radians
 * @returns {[number, number]} Rotated point [x, y]
 */
function rotate2D(point, angle) {
  const [x, y] = point;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  
  return [
    x * cos - y * sin,
    x * sin + y * cos
  ];
}

/**
 * Apply 45-degree rotation to all plan coordinates
 * This fixes the "vertical stick" issue by giving the plan visible X/Y depth in axon view
 * 
 * @param {Array<{start: [number, number], end: [number, number]}>} walls - Array of walls
 * @returns {Array<{start: [number, number], end: [number, number], thickness: number, height: number}>} Rotated walls
 */
function applyAxonRotation(walls) {
  return walls.map(wall => ({
    start: rotate2D(wall.start, AXON_ROTATION_ANGLE),
    end: rotate2D(wall.end, AXON_ROTATION_ANGLE),
    thickness: wall.thickness || DEFAULT_WALL_THICKNESS,
    height: wall.height || DEFAULT_WALL_HEIGHT
  }));
}

/**
 * Normalize raw topology output to renderer contract format
 * 
 * This function:
 * 1. Converts polylines to wall segments
 * 2. Orthogonalizes walls (snaps to horizontal/vertical)
 * 3. Validates plan geometry (degeneracy check)
 * 4. Normalizes coordinates (centers and scales)
 * 5. Applies 45-degree rotation for axon view
 * 
 * @param {Object|Array} rawTopology - Raw topology from AI or vectorization
 *   Can be:
 *   - {polylines: [[[x,y], ...], ...]} - Array of polylines
 *   - {paths: [{points: [[x,y], ...]}, ...]} - Array of path objects
 *   - {walls: [{start: [x,y], end: [x,y]}, ...]} - Already in wall format
 *   - Array of polylines directly
 * @returns {Array<{start: [number, number], end: [number, number], thickness: number, height: number}>} Normalized wall segments
 */
export function normalizeTopology(rawTopology) {
  let walls = [];
  
  // Handle different input formats
  if (!rawTopology) {
    return walls;
  }
  
  // Case 1: Already in wall format
  if (Array.isArray(rawTopology.walls) && rawTopology.walls.length > 0) {
    walls = rawTopology.walls.map(wall => ({
      start: Array.isArray(wall.start) ? [wall.start[0], wall.start[1]] : [0, 0],
      end: Array.isArray(wall.end) ? [wall.end[0], wall.end[1]] : [0, 0],
      thickness: wall.thickness || DEFAULT_WALL_THICKNESS,
      height: wall.height || DEFAULT_WALL_HEIGHT
    }));
  }
  // Case 2: Polylines array format
  else if (Array.isArray(rawTopology.polylines) && rawTopology.polylines.length > 0) {
    for (const polyline of rawTopology.polylines) {
      if (Array.isArray(polyline) && polyline.length >= 2) {
        walls.push(...polylineToWallSegments(polyline, DEFAULT_WALL_THICKNESS, DEFAULT_WALL_HEIGHT));
      }
    }
  }
  // Case 3: Paths array format
  else if (Array.isArray(rawTopology.paths) && rawTopology.paths.length > 0) {
    for (const path of rawTopology.paths) {
      const points = path.points || path;
      if (Array.isArray(points) && points.length >= 2) {
        const thickness = path.thickness || DEFAULT_WALL_THICKNESS;
        const height = path.height || DEFAULT_WALL_HEIGHT;
        walls.push(...polylineToWallSegments(points, thickness, height));
      }
    }
  }
  // Case 4: Direct array of polylines
  else if (Array.isArray(rawTopology) && rawTopology.length > 0) {
    for (const polyline of rawTopology) {
      if (Array.isArray(polyline) && polyline.length >= 2) {
        walls.push(...polylineToWallSegments(polyline, DEFAULT_WALL_THICKNESS, DEFAULT_WALL_HEIGHT));
      }
    }
  }
  
  if (walls.length === 0) {
    return walls;
  }
  
  // Step 1: Orthogonalize walls (snap to horizontal/vertical)
  // This prevents skewed/noisy walls from collapsing geometry
  walls = walls.map(wall => orthogonalizeWall(wall));
  
  // Step 2: Validate plan geometry (degeneracy check)
  validatePlanDegeneracy(walls);
  
  // Step 3: Normalize coordinates (center and scale)
  walls = normalizePlanCoordinates(walls);
  
  // Step 4: Apply 45-degree rotation for axon view
  walls = applyAxonRotation(walls);
  
  return walls;
}

