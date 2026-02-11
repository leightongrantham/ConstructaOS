/**
 * Polyline Offset (Wall Thickness)
 * 
 * Creates parallel offsets for a polyline centerline to form wall boundaries.
 * Handles multiple segments, normalizes normals, and averages normals at joints.
 */

import type { Vec2 } from './types.js';

/**
 * Calculate perpendicular normal vector for a line segment
 * 
 * @param start - Start point of segment
 * @param end - End point of segment
 * @returns Normalized perpendicular vector pointing to the left
 */
function getPerpendicularNormal(start: Vec2, end: Vec2): Vec2 {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const length = Math.sqrt(dx * dx + dy * dy);
  
  if (length < 1e-10) {
    // Degenerate segment, return default normal
    return { x: 0, y: 1 };
  }
  
  // Perpendicular vector (rotate 90° counterclockwise)
  // For a vector (dx, dy), the perpendicular is (-dy, dx)
  const nx = -dy / length;
  const ny = dx / length;
  
  return { x: nx, y: ny };
}

/**
 * Average two normal vectors
 * 
 * @param n1 - First normal
 * @param n2 - Second normal
 * @returns Normalized average normal
 */
function averageNormals(n1: Vec2, n2: Vec2): Vec2 {
  const nx = (n1.x + n2.x) / 2;
  const ny = (n1.y + n2.y) / 2;
  const length = Math.sqrt(nx * nx + ny * ny);
  
  if (length < 1e-10) {
    return n1; // Fallback to first normal if average is degenerate
  }
  
  return { x: nx / length, y: ny / length };
}

/**
 * Offset a polyline to create left and right boundaries
 * 
 * @param centerline - Polyline centerline points
 * @param thickness - Wall thickness (offset distance)
 * @returns Object with left and right offset polylines
 */
export function offsetPolyline(
  centerline: Vec2[],
  thickness: number
): { left: Vec2[]; right: Vec2[] } {
  if (centerline.length < 2) {
    return { left: [], right: [] };
  }
  
  // Check if polyline is closed (first point == last point)
  const isClosed = centerline.length >= 3 &&
    Math.abs(centerline[0].x - centerline[centerline.length - 1].x) < 1e-10 &&
    Math.abs(centerline[0].y - centerline[centerline.length - 1].y) < 1e-10;
  
  const halfThickness = thickness / 2;
  const left: Vec2[] = [];
  const right: Vec2[] = [];
  
  // Calculate normals for each segment (including closing segment if closed)
  const normals: Vec2[] = [];
  const numSegments = isClosed ? centerline.length : centerline.length - 1;
  
  for (let i = 0; i < numSegments; i++) {
    const start = centerline[i];
    const end = centerline[(i + 1) % centerline.length];
    const normal = getPerpendicularNormal(start, end);
    normals.push(normal);
  }
  
  // Handle all points (including corners with averaged normals)
  for (let i = 0; i < centerline.length; i++) {
    let normal: Vec2;
    
    if (isClosed) {
      // For closed polylines, average normals from both adjacent segments
      const prevIdx = (i - 1 + centerline.length) % centerline.length;
      const nextIdx = i;
      const prevNormal = normals[prevIdx];
      const nextNormal = normals[nextIdx];
      normal = averageNormals(prevNormal, nextNormal);
    } else {
      // For open polylines
      if (i === 0) {
        normal = normals[0];
      } else if (i === centerline.length - 1) {
        normal = normals[normals.length - 1];
      } else {
        // Average normals at intermediate points
        normal = averageNormals(normals[i - 1], normals[i]);
      }
    }
    
    left.push({
      x: centerline[i].x - normal.x * halfThickness,
      y: centerline[i].y - normal.y * halfThickness
    });
    right.push({
      x: centerline[i].x + normal.x * halfThickness,
      y: centerline[i].y + normal.y * halfThickness
    });
  }
  
  return { left, right };
}

