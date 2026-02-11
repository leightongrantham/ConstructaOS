/**
 * Depth Sort Faces
 * 
 * Sorts faces by average depth (back to front).
 * Uses stable sort to maintain order for faces at same depth.
 */

import type { AxonFace } from './types.js';

/**
 * Sort faces by depth (back to front)
 * Back faces (higher Z) are drawn first, front faces (lower Z) are drawn last
 * 
 * @param faces - Array of axonometric faces
 * @returns Sorted array (back to front)
 */
export function depthSort(faces: AxonFace[]): AxonFace[] {
  // Create array with indices for stable sort
  const indexed = faces.map((face, index) => ({ face, index }));
  
  // Sort by depth (descending: back to front)
  // Higher Z = further back = drawn first
  indexed.sort((a, b) => {
    const depthDiff = b.face.depth - a.face.depth;
    if (Math.abs(depthDiff) > 1e-10) {
      return depthDiff;
    }
    // Stable sort: maintain original order for same depth
    return a.index - b.index;
  });
  
  return indexed.map(item => item.face);
}

