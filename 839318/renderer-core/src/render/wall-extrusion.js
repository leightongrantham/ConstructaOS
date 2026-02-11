/**
 * Wall extrusion logic for 3D axonometric rendering
 * Extrudes wall centerlines into 3D geometry with visible faces
 * All functions are pure and deterministic
 */

import { lineLength, distance, intersectLines } from '../utils/geom.js';

/**
 * Project a 3D point to 2D axonometric space using proper 30° isometric projection
 * 
 * Implements proper 30° isometric projection:
 * - screenX = (x - y) * Math.cos(30°) * scale
 * - screenY = (x + y) * Math.sin(30°) * scale - z * scale
 * 
 * Z is subtracted at FULL SCALE (not reduced) to ensure vertical edges have visible length.
 * 
 * @param {[number, number, number]|{x: number, y: number, z: number}} point3D - 3D point [x, y, z] or {x, y, z}
 * @param {number[]} axonMatrix - Ignored (kept for backward compatibility)
 * @param {number} scale - Scale factor shared between X/Y/Z (default: 1.0)
 * @param {number} heightScale - IGNORED (kept for backward compatibility, Z uses full scale)
 * @returns {[number, number]} 2D projected point [screenX, screenY]
 */
export function project3DToAxon(point3D, axonMatrix = null, scale = 1.0, heightScale = 0.5) {
  // CRITICAL: This function MUST NOT mutate the input point3D
  // Always extract values and return a NEW array
  
  // Extract x, y, z - handle both array and object formats
  // IMPORTANT: Extract primitive values, not references
  let x, y, z;
  if (Array.isArray(point3D)) {
    // Extract values to ensure we don't hold references to the input array
    x = point3D[0] ?? 0;
    y = point3D[1] ?? 0;
    z = point3D[2] ?? 0;
  } else if (point3D && typeof point3D === 'object') {
    x = point3D.x ?? 0;
    y = point3D.y ?? 0;
    z = point3D.z ?? 0;
  } else {
    // Fallback for invalid input
    console.warn('project3DToAxon: Invalid point3D format', point3D);
    return [0, 0];
  }
  
  // Store original values for assertion (temporary debug)
  const originalX = x;
  const originalY = y;
  const originalZ = z;
  
  // Proper 30° isometric projection angle
  const angle = Math.PI / 6; // 30 degrees (30°)
  const cosAngle = Math.cos(angle);  // cos(30°) ≈ 0.866
  const sinAngle = Math.sin(angle);  // sin(30°) = 0.5
  
  // Proper 30° isometric projection:
  // screenX = (x - y) * cos(30°) * scale
  // screenY = (x + y) * sin(30°) * scale - z * scale
  // 
  // CRITICAL: Z is subtracted at FULL SCALE (not reduced by heightScale or any multiplier)
  // This ensures vertical edges have visible length in the projection
  // 
  // For vertical edge from (x,y,0) to (x,y,height):
  //   - screenX is the same (no change in X/Y)
  //   - screenY decreases by height * scale (full scale, not reduced)
  const screenX = (x - y) * cosAngle * scale;
  const screenY = (x + y) * sinAngle * scale - z * scale;
  
  // TEMPORARY ASSERTION: Verify input point was not mutated
  // Check if input was an array and verify its values are unchanged
  if (Array.isArray(point3D)) {
    if (point3D[0] !== originalX || point3D[1] !== originalY || point3D[2] !== originalZ) {
      console.error('❌ PROJECTION MUTATION DETECTED: Input point was modified!', {
        original: [originalX, originalY, originalZ],
        current: [point3D[0], point3D[1], point3D[2]],
        input: point3D
      });
    }
  }
  
  // TEMPORARY TEST: Verify Z contributes at full scale
  // Test with floor (z=0) and roof (z=2700) vertices from actual wall geometry
  // Track first floor and first roof point to verify screenY difference
  if (z === 0 && !window._testProjectionFloorY) {
    // First floor point encountered
    window._testProjectionFloorY = screenY;
    window._testProjectionFloorPoint = `(${x.toFixed(1)},${y.toFixed(1)},${z})`;
    console.log(`🧪 PROJECTION TEST (FLOOR): ${window._testProjectionFloorPoint} → screenY = ${screenY.toFixed(2)}`);
  } else if (z > 2000 && !window._testProjectionRoofY) {
    // First roof point encountered (z > 2000 indicates wall height, e.g. 2700)
    window._testProjectionRoofY = screenY;
    window._testProjectionRoofPoint = `(${x.toFixed(1)},${y.toFixed(1)},${z.toFixed(0)})`;
    window._testProjectionRoofZ = z;
    console.log(`🧪 PROJECTION TEST (ROOF): ${window._testProjectionRoofPoint} → screenY = ${screenY.toFixed(2)}`);
    
    // Calculate difference if we have both floor and roof
    if (window._testProjectionFloorY !== undefined) {
      const diff = window._testProjectionFloorY - window._testProjectionRoofY;
      const expectedDiff = window._testProjectionRoofZ * scale; // Z difference * scale
      console.log(`🧪 PROJECTION TEST: screenY difference = ${diff.toFixed(2)}, expected = ${expectedDiff.toFixed(2)} (Z diff = ${window._testProjectionRoofZ.toFixed(0)}, scale = ${scale.toFixed(2)})`);
      if (Math.abs(diff - expectedDiff) < 10.0) {
        console.log('✅ PROJECTION TEST: PASSED - Z contributes at full scale');
      } else {
        console.warn(`⚠️ PROJECTION TEST: FAILED - Z contribution mismatch (diff=${diff.toFixed(2)}, expected=${expectedDiff.toFixed(2)})`);
      }
    }
  }
  
  // Temporary console log to verify Z varies between floor and roof vertices
  // Limit logging to avoid spam (log every 10th point)
  if (!window._projectionLogCount) window._projectionLogCount = 0;
  window._projectionLogCount++;
  if (window._projectionLogCount % 10 === 0 || (z > 0 && z < 100)) {
    console.log('PROJECT', x.toFixed(1), y.toFixed(1), z.toFixed(1), '→', screenX.toFixed(2), screenY.toFixed(2));
  }
  
  return [screenX, screenY];
}

/**
 * Calculate perpendicular offset for wall thickness
 * @param {[number, number]} start - Line segment start [x, y]
 * @param {[number, number]} end - Line segment end [x, y]
 * @param {number} thickness - Wall thickness (distance to offset)
 * @returns {[number, number]} Perpendicular offset vector [dx, dy]
 */
function getPerpendicularOffset(start, end, thickness) {
  const [sx, sy] = start;
  const [ex, ey] = end;
  
  const dx = ex - sx;
  const dy = ey - sy;
  const length = Math.sqrt(dx * dx + dy * dy);
  
  if (length < 1e-10) {
    return [0, 0]; // Zero-length segment
  }
  
  // Normalize direction vector
  const nx = dx / length;
  const ny = dy / length;
  
  // Perpendicular vector (90° rotation): (-ny, nx) or (ny, -nx)
  // Use (ny, -nx) for consistent left-hand-side offset
  const halfThickness = thickness / 2;
  return [
    ny * halfThickness,
    -nx * halfThickness
  ];
}

/**
 * Calculate the perpendicular unit vector (normalized)
 * @param {[number, number]} start - Line segment start [x, y]
 * @param {[number, number]} end - Line segment end [x, y]
 * @returns {[number, number]|null} Unit perpendicular vector [nx, ny] or null if segment is zero-length
 */
function getPerpendicularUnitVector(start, end) {
  const [sx, sy] = start;
  const [ex, ey] = end;
  
  const dx = ex - sx;
  const dy = ey - sy;
  const length = Math.sqrt(dx * dx + dy * dy);
  
  if (length < 1e-10) {
    return null; // Zero-length segment
  }
  
  // Normalize direction vector
  const nx = dx / length;
  const ny = dy / length;
  
  // Perpendicular vector (90° rotation to the left): (ny, -nx)
  return [ny, -nx];
}

/**
 * Offset a polyline left or right by half the wall thickness with mitered corners
 * Uses perpendicular vectors and calculates proper miter intersections at corners
 * 
 * @param {[number, number][]} centerline - Input polyline (array of [x, y] points)
 * @param {number} halfThickness - Half of wall thickness (offset distance)
 * @param {string} direction - 'left' or 'right' (default: 'left')
 * @returns {[number, number][]} Offset polyline with mitered corners
 */
export function offsetPolyline(centerline, halfThickness, direction = 'left') {
  if (!Array.isArray(centerline) || centerline.length < 2) {
    return centerline;
  }
  
  if (halfThickness <= 0) {
    return centerline; // No offset
  }
  
  const offsetSign = direction === 'right' ? -1 : 1;
  const offset = halfThickness * offsetSign;
  
  // Handle simple case: single segment (2 points)
  if (centerline.length === 2) {
    const [start, end] = centerline;
    const perp = getPerpendicularUnitVector(start, end);
    if (!perp) {
      return centerline; // Zero-length segment
    }
    
    const [nx, ny] = perp;
    return [
      [start[0] + nx * offset, start[1] + ny * offset],
      [end[0] + nx * offset, end[1] + ny * offset]
    ];
  }
  
  const offsetPolyline = [];
  
  // Process first point
  const firstPoint = centerline[0];
  const secondPoint = centerline[1];
  const firstPerp = getPerpendicularUnitVector(firstPoint, secondPoint);
  
  if (firstPerp) {
    const [nx, ny] = firstPerp;
    offsetPolyline.push([
      firstPoint[0] + nx * offset,
      firstPoint[1] + ny * offset
    ]);
  } else {
    offsetPolyline.push([firstPoint[0], firstPoint[1]]);
  }
  
  // Process intermediate points (corners) with mitering
  for (let i = 1; i < centerline.length - 1; i++) {
    const prevPoint = centerline[i - 1];
    const currPoint = centerline[i];
    const nextPoint = centerline[i + 1];
    
    // Get perpendicular vectors for both segments
    const prevPerp = getPerpendicularUnitVector(prevPoint, currPoint);
    const nextPerp = getPerpendicularUnitVector(currPoint, nextPoint);
    
    if (!prevPerp || !nextPerp) {
      // Handle zero-length segment: use the other perpendicular or skip
      const perp = prevPerp || nextPerp;
      if (perp) {
        const [nx, ny] = perp;
        offsetPolyline.push([
          currPoint[0] + nx * offset,
          currPoint[1] + ny * offset
        ]);
      } else {
        offsetPolyline.push([currPoint[0], currPoint[1]]);
      }
      continue;
    }
    
    // Create two offset lines from the corner
    // Offset line 1: from prevPoint to currPoint, offset by perpendicular
    const [nx1, ny1] = prevPerp;
    const offsetPrevStart = [
      prevPoint[0] + nx1 * offset,
      prevPoint[1] + ny1 * offset
    ];
    const offsetPrevEnd = [
      currPoint[0] + nx1 * offset,
      currPoint[1] + ny1 * offset
    ];
    
    // Offset line 2: from currPoint to nextPoint, offset by perpendicular
    const [nx2, ny2] = nextPerp;
    const offsetNextStart = [
      currPoint[0] + nx2 * offset,
      currPoint[1] + ny2 * offset
    ];
    const offsetNextEnd = [
      nextPoint[0] + nx2 * offset,
      nextPoint[1] + ny2 * offset
    ];
    
    // Find intersection of the two extended offset lines (miter point)
    // Use infinite line intersection, not just segment intersection
    const miterPoint = intersectLines(
      offsetPrevStart,
      offsetPrevEnd,
      offsetNextStart,
      offsetNextEnd
    );
    
    if (miterPoint) {
      // Use mitered corner point
      offsetPolyline.push(miterPoint);
    } else {
      // Lines are parallel (can happen for 180° corners)
      // Fallback: use average of the two offset points
      const avgX = (offsetPrevEnd[0] + offsetNextStart[0]) / 2;
      const avgY = (offsetPrevEnd[1] + offsetNextStart[1]) / 2;
      offsetPolyline.push([avgX, avgY]);
    }
  }
  
  // Process last point
  const lastIndex = centerline.length - 1;
  const secondLastPoint = centerline[lastIndex - 1];
  const lastPoint = centerline[lastIndex];
  const lastPerp = getPerpendicularUnitVector(secondLastPoint, lastPoint);
  
  if (lastPerp) {
    const [nx, ny] = lastPerp;
    offsetPolyline.push([
      lastPoint[0] + nx * offset,
      lastPoint[1] + ny * offset
    ]);
  } else {
    offsetPolyline.push([lastPoint[0], lastPoint[1]]);
  }
  
  return offsetPolyline;
}

/**
 * Calculate average Z-depth for a 3D face
 * Used for depth sorting before rendering (painter's algorithm)
 * @param {[number, number, number][]} polygon3D - 3D polygon points [x, y, z]
 * @returns {number} Average Z coordinate (depth)
 */
function calculate3DFaceDepth(polygon3D) {
  if (!polygon3D || polygon3D.length === 0) {
    return 0;
  }
  
  // Calculate average Z coordinate (height/depth)
  const avgZ = polygon3D.reduce((sum, p) => sum + (p[2] || 0), 0) / polygon3D.length;
  return avgZ;
}

/**
 * Calculate combined depth metric for axonometric rendering
 * Uses average Z (height) and average Y (back-to-front) for proper depth sorting
 * @param {[number, number, number][]} polygon3D - 3D polygon points [x, y, z]
 * @returns {number} Combined depth value (lower = further back, higher = closer)
 */
function calculateAxonDepth(polygon3D) {
  if (!polygon3D || polygon3D.length === 0) {
    return 0;
  }
  
  // Calculate average coordinates
  const avgY = polygon3D.reduce((sum, p) => sum + (p[1] || 0), 0) / polygon3D.length;
  const avgZ = polygon3D.reduce((sum, p) => sum + (p[2] || 0), 0) / polygon3D.length;
  
  // Combined depth: Y contributes more to back/front, Z contributes to top/bottom
  // In axonometric views, faces further back (negative Y) should render first
  // Higher faces (positive Z) should typically render on top
  // Weight Y more heavily for back/front sorting
  return avgY * 2 + avgZ * 0.5;
}

/**
 * Extrude a wall centerline polyline into 3D geometry
 * Creates 3 visible faces: top, left side, right side
 * Returns 3D geometry (not yet projected)
 * 
 * @param {[number, number][]} centerline - Wall centerline polyline (2D points)
 * @param {number} thickness - Wall thickness in same units as centerline (default: 200)
 * @param {number} height - Wall height in same units as centerline (default: 2700)
 * @returns {Array<{face: string, polygon3D: [number, number, number][], depth?: number}>} Extruded 3D faces
 */
export function extrudeWall(centerline, thickness = 200, height = 2700) {
  if (!Array.isArray(centerline) || centerline.length < 2) {
    return [];
  }
  
  const faces = [];
  
  // Create left and right offset polylines with mitered corners
  const halfThickness = thickness / 2;
  const leftPolyline = offsetPolyline(centerline, halfThickness, 'left');
  const rightPolyline = offsetPolyline(centerline, halfThickness, 'right');
  
  // Build 3D geometry and project to 2D
  
  // 1. Top face (horizontal plane at height)
  // CRITICAL: Create NEW arrays for each vertex - never reuse array references
  const topFace3D = [];
  for (let i = 0; i < leftPolyline.length; i++) {
    // Create a NEW array - don't reuse leftPolyline[i] reference
    topFace3D.push([leftPolyline[i][0], leftPolyline[i][1], height]);
  }
  // Add right side points in reverse to close the polygon
  for (let i = rightPolyline.length - 1; i >= 0; i--) {
    // Create a NEW array - don't reuse rightPolyline[i] reference
    topFace3D.push([rightPolyline[i][0], rightPolyline[i][1], height]);
  }
  
  // Calculate Z-depth for top face (at height)
  const topDepth = calculate3DFaceDepth(topFace3D);
  
  faces.push({
    face: 'top',
    polygon3D: topFace3D,
    zDepth: topDepth
  });
  
  // 2. Left side face (vertical plane)
  // CRITICAL: Create NEW arrays for each vertex - never reuse array references
  const leftFace3D = [];
  // Bottom edge (ground level)
  for (let i = 0; i < leftPolyline.length; i++) {
    // Create a NEW array - don't reuse leftPolyline[i] reference
    leftFace3D.push([leftPolyline[i][0], leftPolyline[i][1], 0]);
  }
  // Top edge (at height) - in reverse
  for (let i = leftPolyline.length - 1; i >= 0; i--) {
    // Create a NEW array - don't reuse leftPolyline[i] reference
    leftFace3D.push([leftPolyline[i][0], leftPolyline[i][1], height]);
  }
  
  // Calculate Z-depth for left face (average of ground and height)
  const leftDepth = calculate3DFaceDepth(leftFace3D);
  
  faces.push({
    face: 'left',
    polygon3D: leftFace3D,
    zDepth: leftDepth
  });
  
  // 3. Right side face (vertical plane)
  // CRITICAL: Create NEW arrays for each vertex - never reuse array references
  const rightFace3D = [];
  // Bottom edge (ground level)
  for (let i = 0; i < rightPolyline.length; i++) {
    // Create a NEW array - don't reuse rightPolyline[i] reference
    rightFace3D.push([rightPolyline[i][0], rightPolyline[i][1], 0]);
  }
  // Top edge (at height) - in reverse
  for (let i = rightPolyline.length - 1; i >= 0; i--) {
    // Create a NEW array - don't reuse rightPolyline[i] reference
    rightFace3D.push([rightPolyline[i][0], rightPolyline[i][1], height]);
  }
  
  // Calculate Z-depth for right face (average of ground and height)
  const rightDepth = calculate3DFaceDepth(rightFace3D);
  
  faces.push({
    face: 'right',
    polygon3D: rightFace3D,
    zDepth: rightDepth
  });
  
  return faces;
}

/**
 * Generate 4 base corners of a wall in plan space (z=0)
 * Uses wall.start and wall.end to define horizontal direction
 * Computes perpendicular normal to apply thickness
 * 
 * @param {{start: [number, number], end: [number, number], thickness?: number}} wall - Wall segment
 * @returns {Array<[number, number, number]>} 4 corners at base (z=0): [corner1, corner2, corner3, corner4]
 *   Corners are ordered: start-left, start-right, end-right, end-left (looking along wall direction)
 */
function generateWallBaseCorners(wall) {
  const [sx, sy] = wall.start;
  const [ex, ey] = wall.end;
  const thickness = wall.thickness || 200;
  
  // Wall direction vector (horizontal in XY plane)
  const dx = ex - sx;
  const dy = ey - sy;
  const length = Math.sqrt(dx * dx + dy * dy);
  
  if (length < 1e-10) {
    // Zero-length wall - create a square around the point
    const halfThick = thickness / 2;
    return [
      [sx - halfThick, sy - halfThick, 0], // Bottom-left
      [sx + halfThick, sy - halfThick, 0], // Bottom-right
      [sx + halfThick, sy + halfThick, 0], // Top-right
      [sx - halfThick, sy + halfThick, 0]  // Top-left
    ];
  }
  
  // Normalize direction vector
  const nx = dx / length;
  const ny = dy / length;
  
  // Perpendicular vector (90° rotation): (ny, -nx) points to the left of the wall direction
  const perpX = ny;
  const perpY = -nx;
  
  // Half thickness offset
  const halfThick = thickness / 2;
  const offsetX = perpX * halfThick;
  const offsetY = perpY * halfThick;
  
  // Generate 4 base corners (at z=0)
  // Order: start-left, start-right, end-right, end-left (counter-clockwise when viewed from above)
  const corners = [
    [sx - offsetX, sy - offsetY, 0], // Start-left corner
    [sx + offsetX, sy + offsetY, 0], // Start-right corner
    [ex + offsetX, ey + offsetY, 0], // End-right corner
    [ex - offsetX, ey - offsetY, 0]  // End-left corner
  ];
  
  return corners;
}

/**
 * Generate 8 corners of a wall prism by extruding base corners vertically
 * 
 * @param {Array<[number, number, number]>} baseCorners - 4 base corners at z=0
 * @param {number} height - Wall height (Z coordinate)
 * @returns {Object} Object with baseCorners and topCorners arrays
 */
function extrudeCornersToHeight(baseCorners, height) {
  // Top corners are base corners with z = height
  const topCorners = baseCorners.map(([x, y, z]) => [x, y, height]);
  
  return {
    baseCorners,  // [corner1, corner2, corner3, corner4] at z=0
    topCorners    // [corner1, corner2, corner3, corner4] at z=height
  };
}

/**
 * Generate all edges of a wall prism
 * A rectangular prism has 12 edges:
 * - 4 edges on base face (z=0)
 * - 4 edges on top face (z=height)
 * - 4 vertical edges connecting base to top
 * 
 * @param {Array<[number, number, number]>} baseCorners - 4 base corners
 * @param {Array<[number, number, number]>} topCorners - 4 top corners
 * @returns {Array<{start: [number, number, number], end: [number, number, number]}>} Array of 12 edges
 */
function generateWallEdges(baseCorners, topCorners) {
  const edges = [];
  
  // Base face edges (4 edges at z=0)
  for (let i = 0; i < 4; i++) {
    const next = (i + 1) % 4;
    edges.push({
      start: baseCorners[i],
      end: baseCorners[next]
    });
  }
  
  // Top face edges (4 edges at z=height)
  for (let i = 0; i < 4; i++) {
    const next = (i + 1) % 4;
    edges.push({
      start: topCorners[i],
      end: topCorners[next]
    });
  }
  
  // Vertical edges (4 edges connecting base to top)
  for (let i = 0; i < 4; i++) {
    edges.push({
      start: baseCorners[i],
      end: topCorners[i]
    });
  }
  
  return edges;
}

/**
 * Convert a wall segment to exactly 4 edges (2 horizontal + 2 vertical)
 * For wall segment A(x1,y1) → B(x2,y2):
 *   - Bottom edge: A0(x1,y1,0) → B0(x2,y2,0)
 *   - Top edge: A1(x1,y1,height) → B1(x2,y2,height)
 *   - Vertical edge: A0 → A1
 *   - Vertical edge: B0 → B1
 * 
 * @param {{start: [number, number], end: [number, number], height?: number}} wall - Wall segment
 * @param {number} defaultHeight - Default wall height if not specified (default: 2700)
 * @returns {Object} Object with exactly 4 edges
 */
export function wallToSimpleEdges(wall, defaultHeight = 2700) {
  if (!wall || !Array.isArray(wall.start) || !Array.isArray(wall.end)) {
    return null;
  }
  
  const [x1, y1] = wall.start;
  const [x2, y2] = wall.end;
  const height = wall.height || defaultHeight;
  
  // Create 4 3D points explicitly
  // CRITICAL: Each point is a NEW array - never reuse array references
  // This ensures each edge has independent vertices that won't be affected by projection
  const A0 = [x1, y1, 0];           // Floor point A (NEW array)
  const B0 = [x2, y2, 0];           // Floor point B (NEW array)
  const A1 = [x1, y1, height];      // Roof point A (NEW array)
  const B1 = [x2, y2, height];      // Roof point B (NEW array)
  
  // Generate exactly 4 edges per wall segment
  const edges = [
    {
      start: A0,
      end: B0,
      type: 'horizontal',  // Bottom edge (floor)
      isVertical: false
    },
    {
      start: A1,
      end: B1,
      type: 'horizontal',  // Top edge (roof)
      isVertical: false
    },
    {
      start: A0,
      end: A1,
      type: 'vertical',    // Vertical edge at point A
      isVertical: true     // Mark for debug rendering (red color)
    },
    {
      start: B0,
      end: B1,
      type: 'vertical',    // Vertical edge at point B
      isVertical: true     // Mark for debug rendering (red color)
    }
  ];
  
  return {
    wall: wall,
    edges: edges  // Exactly 4 edges: 2 horizontal + 2 vertical
  };
}

/**
 * Convert a wall segment to a swept volume (rectangular prism)
 * DEPRECATED: Use wallToSimpleEdges for simpler 4-edge approach
 * 
 * @param {{start: [number, number], end: [number, number], thickness?: number, height?: number}} wall - Wall segment
 * @param {number} defaultHeight - Default wall height if not specified (default: 2700)
 * @returns {Object} Object with corners and edges arrays
 */
export function wallToSweptVolume(wall, defaultHeight = 2700) {
  // For now, use simple 4-edge approach
  return wallToSimpleEdges(wall, defaultHeight);
}

/**
 * Extrude multiple walls to simple edge sets
 * Each wall generates exactly 4 edges (2 horizontal + 2 vertical)
 * Returns 3D geometry with explicit Z coordinates (not yet projected to 2D)
 * 
 * @param {Array<{start: [number, number], end: [number, number], thickness?: number, height?: number}>} walls - Wall geometry
 * @param {number} defaultHeight - Default wall height (default: 2700)
 * @returns {Array<Object>} Array of wall objects, each with exactly 4 edges
 */
export function extrudeWalls(walls, defaultHeight = 2700) {
  if (!Array.isArray(walls) || walls.length === 0) {
    return [];
  }
  
  // Use simple 4-edge approach: each wall gets exactly 4 edges
  return walls.map(wall => wallToSimpleEdges(wall, defaultHeight))
    .filter(volume => volume !== null);
}

/**
 * Project 3D edges to 2D and sort by average Z-depth
 * Projects all edges from wall volumes to 2D axonometric space using proper 30° isometric projection
 * 
 * Ensures all edges have explicit Z coordinates:
 * - Floor vertices use z = 0
 * - Roof vertices use z = wall.height (e.g. 2700)
 * - Z uses FULL scale (not reduced) for visible vertical edges
 * 
 * @param {Array<Object>} wallVolumes - Array of wall objects with edges (each has exactly 4 edges)
 * @param {number[]} axonMatrix - Ignored (kept for backward compatibility)
 * @param {number} scale - Scale factor shared between X/Y/Z (default: 1.0)
 * @param {number} heightScale - IGNORED (kept for backward compatibility, Z uses full scale)
 * @returns {Array<{edge: {start: [number, number], end: [number, number]}, zDepth: number, wallIndex: number, isVertical: boolean}>} All edges projected to 2D and sorted by Z-depth
 */
export function projectAndSortEdges(wallVolumes, axonMatrix = null, scale = 1.0, heightScale = 0.5) {
  const allEdges = [];
  
  wallVolumes.forEach((volume, wallIndex) => {
    if (!volume || !volume.edges || volume.edges.length === 0) {
      return;
    }
    
    volume.edges.forEach(edge => {
      // Ensure edge endpoints have explicit Z coordinates
      // edge.start and edge.end should be [x, y, z] arrays
      const start = Array.isArray(edge.start) ? edge.start : [edge.start.x || 0, edge.start.y || 0, edge.start.z || 0];
      const end = Array.isArray(edge.end) ? edge.end : [edge.end.x || 0, edge.end.y || 0, edge.end.z || 0];
      
      // Verify Z coordinates are explicit (not undefined)
      if (start.length < 3 || end.length < 3 || start[2] === undefined || end[2] === undefined) {
        console.warn(`Edge missing Z coordinate: start=${start}, end=${end}`);
        return; // Skip edges without explicit Z
      }
      
      // Calculate average Z-depth of edge for sorting
      const avgZ = (start[2] + end[2]) / 2;
      
      // Project 3D edge endpoints to 2D using proper 30° isometric projection
      // CRITICAL: Create copies of point arrays to ensure we don't mutate source geometry
      // Z MUST be explicit - floor vertices use z=0, roof vertices use z=height
      // Z uses FULL scale (not reduced) - pass scale for both scale and heightScale
      const startCopy = Array.isArray(start) ? [start[0], start[1], start[2]] : { x: start.x, y: start.y, z: start.z };
      const endCopy = Array.isArray(end) ? [end[0], end[1], end[2]] : { x: end.x, y: end.y, z: end.z };
      
      const start2D = project3DToAxon(startCopy, axonMatrix, scale, scale);
      const end2D = project3DToAxon(endCopy, axonMatrix, scale, scale);
      
      // TEMPORARY ASSERTION: Verify original edge points were not mutated
      if (Array.isArray(start) && Array.isArray(end)) {
        const originalStartZ = start[2];
        const originalEndZ = end[2];
        if (start[2] !== originalStartZ || end[2] !== originalEndZ) {
          console.error('❌ EDGE PROJECTION MUTATION: Original edge points were modified!', {
            start: { original: originalStartZ, current: start[2] },
            end: { original: originalEndZ, current: end[2] }
          });
        }
      }
      
      allEdges.push({
        edge: {
          start: start2D,
          end: end2D
        },
        zDepth: avgZ,           // Average Z-depth for sorting
        wallIndex: wallIndex,
        isVertical: edge.isVertical || false,  // Mark vertical edges for debug rendering
        type: edge.type || 'horizontal'        // Edge type for styling
      });
    });
  });
  
  // Sort by Z-depth (lower Z = render first, higher Z = render last)
  allEdges.sort((a, b) => a.zDepth - b.zDepth);
  
  return allEdges;
}

/**
 * Project 3D faces to 2D and sort by Z-depth (painter's algorithm)
 * Legacy function for face-based rendering (kept for backward compatibility)
 * @deprecated Use projectAndSortEdges for edge-based rendering
 */
export function projectAndSortFaces(extrudedWalls, axonMatrix) {
  const allFaces = [];
  
  extrudedWalls.forEach((extrudedWall, wallIndex) => {
    if (!extrudedWall || !extrudedWall.faces) {
      return;
    }
    
    extrudedWall.faces.forEach(face => {
      // Calculate Z-depth from 3D geometry (before projection)
      // Use pre-calculated zDepth if available, otherwise calculate it
      const zDepth = face.zDepth !== undefined 
        ? face.zDepth 
        : calculate3DFaceDepth(face.polygon3D);
      
      // Project 3D polygon to 2D using proper 30° isometric projection
      // CRITICAL: Create a NEW array for each projected point
      // Ensure each point in polygon3D is projected exactly once
      // Never reuse projected points as world points
      const polygon2D = face.polygon3D.map(p => {
        // Create a copy of the point array to ensure we don't mutate the original
        // This ensures projection doesn't accidentally modify source geometry
        const pointCopy = Array.isArray(p) ? [p[0], p[1], p[2]] : { x: p.x, y: p.y, z: p.z };
        const projected = project3DToAxon(pointCopy, axonMatrix, 1.0, 1.0);
        
        // TEMPORARY ASSERTION: Verify original point was not mutated
        if (Array.isArray(p)) {
          const originalZ = face.polygon3D.find(orig => orig === p)?.[2];
          if (originalZ !== undefined && p[2] !== originalZ) {
            console.error('❌ FACE PROJECTION MUTATION: Original 3D point was modified!', {
              original: p,
              current: [p[0], p[1], p[2]]
            });
          }
        }
        
        return projected;
      });
      
      allFaces.push({
        face: face.face,
        polygon: polygon2D,
        zDepth: zDepth,    // Average Z-depth for sorting
        wallIndex: wallIndex
      });
    });
  });
  
  // Sort by Z-depth (far faces first, near faces last)
  // Lower Z-depth (closer to ground) = render first (further back)
  // Higher Z-depth (higher up) = render last (on top, closer to viewer)
  allFaces.sort((a, b) => a.zDepth - b.zDepth);
  
  return allFaces;
}

