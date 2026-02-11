/**
 * Axonometric Projection Utility
 * 
 * Fixed 30° / 30° axonometric projection (isometric-like)
 * Deterministic: same input → same output always
 */

import type { Vec2, Vec3 } from './types.js';

/**
 * Project a 3D point to 2D axonometric space
 * Uses fixed 30° / 30° projection angles
 * 
 * CRITICAL: This function MUST NOT mutate the input point.
 * It extracts values and returns a NEW object.
 * 
 * @param point - 3D point to project
 * @returns 2D projected point (NEW object, never mutates input)
 */
export function projectAxon(point: Vec3): Vec2 {
  // Extract values to ensure we don't hold references
  const x = point.x ?? 0;
  const y = point.y ?? 0;
  const z = point.z ?? 0;
  
  // Store original for assertion
  const originalX = point.x;
  const originalY = point.y;
  const originalZ = point.z;
  
  // Fixed projection angles: 30° for both X and Y axes
  const angleX = 30 * (Math.PI / 180); // 30° in radians
  const angleY = 30 * (Math.PI / 180); // 30° in radians
  
  // Axonometric projection matrix (simplified isometric)
  // X axis rotated 30° around Y axis
  // Y axis rotated 30° around X axis
  // Z axis remains vertical
  
  // Standard isometric projection:
  // x' = x * cos(30°) - y * cos(30°)
  // y' = x * sin(30°) + y * sin(30°) - z
  
  const cos30 = Math.cos(angleX);
  const sin30 = Math.sin(angleX);
  
  // Isometric projection formula
  const x2d = x * cos30 - y * cos30;
  const y2d = x * sin30 + y * sin30 - z;
  
  const result = {
    x: x2d,
    y: y2d
  };
  
  // TEMPORARY ASSERTION: Verify input point was not mutated
  if (point.x !== originalX || point.y !== originalY || point.z !== originalZ) {
    console.error('❌ PROJECTION MUTATION DETECTED: Input point was modified!', {
      original: { x: originalX, y: originalY, z: originalZ },
      current: { x: point.x, y: point.y, z: point.z },
      input: point
    });
  }
  
  return result;
}

/**
 * Project multiple 3D points to 2D axonometric space
 * 
 * @param points - Array of 3D points
 * @returns Array of 2D projected points
 */
export function projectAxonPoints(points: Vec3[]): Vec2[] {
  return points.map(projectAxon);
}

