/**
 * Centralized Axonometric Projection Math
 * 
 * All rendering MUST go through this module.
 * No direct canvas transforms elsewhere.
 */

export const ISO_ANGLE_X = Math.PI / 6; // 30°
export const ISO_ANGLE_Y = Math.PI / 6; // 30°
export const HEIGHT_SCALE = 0.6; // Match mock renderer (reduces vertical stretch)

/**
 * Project a 3D point to 2D axonometric space
 * 
 * CRITICAL: This function MUST NOT mutate any input.
 * It takes primitive numbers and returns a NEW object.
 * 
 * @param x - X coordinate in world space
 * @param y - Y coordinate in world space
 * @param z - Z coordinate in world space (height)
 * @returns 2D projected point (NEW object, never mutates input)
 */
export function projectPoint(x: number, y: number, z: number): { x: number; y: number } {
  // Store original values for assertion (temporary debug)
  const originalX = x;
  const originalY = y;
  const originalZ = z;
  
  const result = {
    x: (x - y) * Math.cos(ISO_ANGLE_X),
    y: (x + y) * Math.sin(ISO_ANGLE_Y) - z * HEIGHT_SCALE
  };
  
  // TEMPORARY ASSERTION: Verify input values were not mutated
  // (This should never fail since we're working with primitives, but helps catch bugs)
  if (x !== originalX || y !== originalY || z !== originalZ) {
    console.error('❌ PROJECTION MUTATION DETECTED: Input values were modified!', {
      original: { x: originalX, y: originalY, z: originalZ },
      current: { x, y, z }
    });
  }
  
  return result;
}

/**
 * Project a 3D point array to 2D
 * 
 * CRITICAL: This function MUST NOT mutate the input array.
 * It extracts values and returns a NEW object.
 * 
 * @param point - [x, y, z] array
 * @returns 2D projected point (NEW object, never mutates input)
 */
export function projectPointArray(point: [number, number, number]): { x: number; y: number } {
  // Extract values to ensure we don't hold references
  const x = point[0] ?? 0;
  const y = point[1] ?? 0;
  const z = point[2] ?? 0;
  
  // Store original for assertion
  const originalPoint = [point[0], point[1], point[2]];
  
  const result = projectPoint(x, y, z);
  
  // TEMPORARY ASSERTION: Verify input array was not mutated
  if (point[0] !== originalPoint[0] || point[1] !== originalPoint[1] || point[2] !== originalPoint[2]) {
    console.error('❌ PROJECTION MUTATION DETECTED: Input array was modified!', {
      original: originalPoint,
      current: [point[0], point[1], point[2]],
      input: point
    });
  }
  
  return result;
}

/**
 * Project multiple 3D points to 2D
 * 
 * @param points - Array of [x, y, z] points
 * @returns Array of 2D projected points
 */
export function projectPoints(points: Array<[number, number, number]>): Array<{ x: number; y: number }> {
  return points.map(projectPointArray);
}

