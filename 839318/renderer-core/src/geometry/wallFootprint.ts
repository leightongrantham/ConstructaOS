/**
 * Wall Footprint Polygon
 * 
 * Combines left and right offset polylines into a closed polygon.
 * Ensures CCW (counter-clockwise) ordering and closes the polygon.
 */

import type { Vec2 } from './types.js';

/**
 * Calculate signed area of a polygon
 * Positive = CCW, Negative = CW
 * 
 * @param polygon - Polygon vertices
 * @returns Signed area
 */
function signedArea(polygon: Vec2[]): number {
  if (polygon.length < 3) return 0;
  
  let area = 0;
  for (let i = 0; i < polygon.length; i++) {
    const j = (i + 1) % polygon.length;
    area += polygon[i].x * polygon[j].y;
    area -= polygon[j].x * polygon[i].y;
  }
  return area / 2;
}

/**
 * Reverse a polygon (change winding order)
 * 
 * @param polygon - Polygon to reverse
 * @returns Reversed polygon
 */
function reversePolygon(polygon: Vec2[]): Vec2[] {
  return [...polygon].reverse();
}

/**
 * Build wall footprint polygon from left and right offset polylines
 * 
 * @param left - Left offset polyline
 * @param right - Right offset polyline
 * @returns Closed polygon in CCW order
 */
export function buildWallFootprint(
  left: Vec2[],
  right: Vec2[]
): Vec2[] {
  if (left.length === 0 || right.length === 0) {
    return [];
  }
  
  // Combine: left polyline + reversed right polyline
  const reversedRight = reversePolygon(right);
  const footprint = [...left, ...reversedRight];
  
  // Ensure polygon is closed (first point == last point)
  const first = footprint[0];
  const last = footprint[footprint.length - 1];
  const isClosed = Math.abs(first.x - last.x) < 1e-10 && 
                   Math.abs(first.y - last.y) < 1e-10;
  
  if (!isClosed) {
    footprint.push({ x: first.x, y: first.y });
  }
  
  // Ensure CCW ordering
  const area = signedArea(footprint);
  if (area < 0) {
    // Negative area = CW, reverse to make CCW
    return reversePolygon(footprint);
  }
  
  return footprint;
}

/**
 * Validate footprint polygon
 * 
 * @param footprint - Polygon to validate
 * @returns Object with validation results
 */
export function validateFootprint(footprint: Vec2[]): {
  valid: boolean;
  area: number;
  hasGaps: boolean;
  error?: string;
} {
  if (footprint.length < 3) {
    return {
      valid: false,
      area: 0,
      hasGaps: true,
      error: 'Polygon has less than 3 vertices'
    };
  }
  
  const area = Math.abs(signedArea(footprint));
  const hasGaps = footprint.length < 4; // At least 4 points for a closed quad
  
  return {
    valid: area > 0 && !hasGaps,
    area,
    hasGaps,
    error: area <= 0 ? 'Polygon area is zero or negative' : 
           hasGaps ? 'Polygon has gaps' : undefined
  };
}

