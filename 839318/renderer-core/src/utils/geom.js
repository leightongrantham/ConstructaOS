/**
 * Geometry utilities
 * Helper functions for geometric calculations
 * All functions are pure and deterministic
 */

/**
 * Calculate the distance between two points
 * @param {[number, number]|{x: number, y: number}} point1 - First point as [x,y] or {x,y}
 * @param {[number, number]|{x: number, y: number}} point2 - Second point as [x,y] or {x,y}
 * @returns {number} Distance between the two points
 */
export function distance(point1, point2) {
  const x1 = Array.isArray(point1) ? point1[0] : point1.x;
  const y1 = Array.isArray(point1) ? point1[1] : point1.y;
  const x2 = Array.isArray(point2) ? point2[0] : point2.x;
  const y2 = Array.isArray(point2) ? point2[1] : point2.y;
  
  const dx = x2 - x1;
  const dy = y2 - y1;
  return Math.sqrt(dx * dx + dy * dy);
}

/**
 * Calculate the angle of a line segment in radians
 * @param {[number, number]} start - Start point [x, y]
 * @param {[number, number]} end - End point [x, y]
 * @returns {number} Angle in radians (0 to 2π), measured from positive x-axis
 */
export function lineAngle(start, end) {
  const dx = end[0] - start[0];
  const dy = end[1] - start[1];
  const angle = Math.atan2(dy, dx);
  // Normalize to 0-2π range
  return angle < 0 ? angle + 2 * Math.PI : angle;
}

/**
 * Calculate the length of a line segment
 * @param {[number, number]} start - Start point [x, y]
 * @param {[number, number]} end - End point [x, y]
 * @returns {number} Length of the line segment
 */
export function lineLength(start, end) {
  return distance(start, end);
}

/**
 * Calculate the midpoint of a line segment
 * @param {[number, number]} start - Start point [x, y]
 * @param {[number, number]} end - End point [x, y]
 * @returns {[number, number]} Midpoint [x, y]
 */
export function midpoint(start, end) {
  return [
    (start[0] + end[0]) / 2,
    (start[1] + end[1]) / 2
  ];
}

/**
 * Project a point onto a line segment
 * @param {[number, number]} point - Point to project [x, y]
 * @param {[number, number]} lineStart - Line segment start [x, y]
 * @param {[number, number]} lineEnd - Line segment end [x, y]
 * @returns {[number, number]} Projected point [x, y] on the line segment
 */
export function projectPoint(point, lineStart, lineEnd) {
  const [px, py] = point;
  const [sx, sy] = lineStart;
  const [ex, ey] = lineEnd;
  
  // Vector from lineStart to lineEnd
  const dx = ex - sx;
  const dy = ey - sy;
  const lineLengthSq = dx * dx + dy * dy;
  
  // Handle zero-length line
  if (lineLengthSq < 1e-10) {
    return [sx, sy];
  }
  
  // Vector from lineStart to point
  const vx = px - sx;
  const vy = py - sy;
  
  // Calculate projection parameter t
  let t = (vx * dx + vy * dy) / lineLengthSq;
  
  // Clamp t to [0, 1] to project onto segment, not infinite line
  t = Math.max(0, Math.min(1, t));
  
  // Return projected point
  return [
    sx + t * dx,
    sy + t * dy
  ];
}

/**
 * Find the intersection point of two line segments
 * @param {[number, number]} seg1Start - First segment start [x, y]
 * @param {[number, number]} seg1End - First segment end [x, y]
 * @param {[number, number]} seg2Start - Second segment start [x, y]
 * @param {[number, number]} seg2End - Second segment end [x, y]
 * @returns {[number, number]|null} Intersection point [x, y] or null if segments don't intersect
 */
export function intersectSegments(seg1Start, seg1End, seg2Start, seg2End) {
  const [x1, y1] = seg1Start;
  const [x2, y2] = seg1End;
  const [x3, y3] = seg2Start;
  const [x4, y4] = seg2End;
  
  const denom = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4);
  
  // Lines are parallel or coincident
  if (Math.abs(denom) < 1e-10) {
    return null;
  }
  
  const t = ((x1 - x3) * (y3 - y4) - (y1 - y3) * (x3 - x4)) / denom;
  const u = -((x1 - x2) * (y1 - y3) - (y1 - y2) * (x1 - x3)) / denom;
  
  // Check if intersection point lies on both segments
  if (t >= 0 && t <= 1 && u >= 0 && u <= 1) {
    return [
      x1 + t * (x2 - x1),
      y1 + t * (y2 - y1)
    ];
  }
  
  return null;
}

/**
 * Simplify a polyline using the Douglas-Peucker algorithm
 * @param {[number, number][]} points - Array of points [[x,y], [x,y], ...]
 * @param {number} tolerance - Maximum distance tolerance for simplification
 * @returns {[number, number][]} Simplified array of points
 */
export function simplifyPolyline(points, tolerance = 1.0) {
  if (points.length <= 2) {
    return points;
  }
  
  // Find the point with maximum distance from line between first and last
  let maxDistance = 0;
  let maxIndex = 0;
  const first = points[0];
  const last = points[points.length - 1];
  
  for (let i = 1; i < points.length - 1; i++) {
    const projected = projectPoint(points[i], first, last);
    const dist = distance(points[i], projected);
    
    if (dist > maxDistance) {
      maxDistance = dist;
      maxIndex = i;
    }
  }
  
  // If max distance is greater than tolerance, recursively simplify
  if (maxDistance > tolerance) {
    // Recursively simplify left and right parts
    const leftPart = simplifyPolyline(points.slice(0, maxIndex + 1), tolerance);
    const rightPart = simplifyPolyline(points.slice(maxIndex), tolerance);
    
    // Combine results (remove duplicate point at junction)
    return [...leftPart.slice(0, -1), ...rightPart];
  } else {
    // All points between first and last are within tolerance
    return [first, last];
  }
}

/**
 * Normalize an angle to 0-2π range
 * @param {number} angle - Angle in radians
 * @returns {number} Normalized angle in 0-2π range
 */
export function normalizeAngle(angle) {
  let normalized = angle;
  while (normalized < 0) normalized += 2 * Math.PI;
  while (normalized >= 2 * Math.PI) normalized -= 2 * Math.PI;
  return normalized;
}

/**
 * Check if two lines are parallel within tolerance
 * @param {[number, number]} line1Start - First line start [x, y]
 * @param {[number, number]} line1End - First line end [x, y]
 * @param {[number, number]} line2Start - Second line start [x, y]
 * @param {[number, number]} line2End - Second line end [x, y]
 * @param {number} tolerance - Angle tolerance in radians (default: 0.01)
 * @returns {boolean} True if lines are parallel within tolerance
 */
export function isParallel(line1Start, line1End, line2Start, line2End, tolerance = 0.01) {
  const angle1 = lineAngle(line1Start, line1End);
  const angle2 = lineAngle(line2Start, line2End);
  
  const diff = Math.abs(normalizeAngle(angle1 - angle2));
  // Check if angles are equal or opposite (parallel or anti-parallel)
  return diff < tolerance || Math.abs(diff - Math.PI) < tolerance;
}

/**
 * Find intersection of two infinite lines
 * @param {[number, number]} line1Start - First line start [x, y]
 * @param {[number, number]} line1End - First line end [x, y]
 * @param {[number, number]} line2Start - Second line start [x, y]
 * @param {[number, number]} line2End - Second line end [x, y]
 * @returns {[number, number]|null} Intersection point or null if parallel
 */
export function intersectLines(line1Start, line1End, line2Start, line2End) {
  const [x1, y1] = line1Start;
  const [x2, y2] = line1End;
  const [x3, y3] = line2Start;
  const [x4, y4] = line2End;
  
  const denom = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4);
  
  if (Math.abs(denom) < 1e-10) {
    return null;
  }
  
  const t = ((x1 - x3) * (y3 - y4) - (y1 - y3) * (x3 - x4)) / denom;
  
  return [
    x1 + t * (x2 - x1),
    y1 + t * (y2 - y1)
  ];
}