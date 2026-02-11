/**
 * Cull Invisible Faces
 * 
 * Removes faces that are facing away from the view direction.
 * Uses dot product of face normal vs view direction.
 */

import type { Face, Vec3 } from './types.js';

/**
 * Default view direction for axonometric view
 * Points from viewer toward scene: {1, 1, -1} (normalized)
 */
export const DEFAULT_VIEW_DIRECTION: Vec3 = {
  x: 1 / Math.sqrt(3),
  y: 1 / Math.sqrt(3),
  z: -1 / Math.sqrt(3)
};

/**
 * Calculate dot product of two vectors
 * 
 * @param a - First vector
 * @param b - Second vector
 * @returns Dot product
 */
function dotProduct(a: Vec3, b: Vec3): number {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

/**
 * Cull faces that are facing away from the view direction
 * 
 * @param faces - Array of faces to cull
 * @param viewDirection - View direction vector (default: DEFAULT_VIEW_DIRECTION)
 * @returns Array of visible faces (facing toward viewer)
 */
export function cullFaces(
  faces: Face[],
  viewDirection: Vec3 = DEFAULT_VIEW_DIRECTION
): Face[] {
  return faces.filter(face => {
    // Dot product: positive = facing toward viewer, negative = facing away
    const dot = dotProduct(face.normal, viewDirection);
    
    // Keep faces with positive dot product (facing toward viewer)
    // Use small threshold to handle edge cases
    return dot > -1e-6;
  });
}

