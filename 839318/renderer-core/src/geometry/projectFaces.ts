/**
 * Project Faces into Axonometric Space
 * 
 * Projects all 3D face vertices to 2D axonometric coordinates.
 * Computes depth per face for depth sorting.
 */

import type { Face, AxonFace, Vec2, Vec3 } from './types.js';
import { projectAxon } from './axonProjection.js';

/**
 * Calculate average depth (Z coordinate) of face vertices
 * 
 * @param vertices - 3D vertices
 * @returns Average depth
 */
function averageDepth(vertices: Vec3[]): number {
  if (vertices.length === 0) return 0;
  
  const sum = vertices.reduce((acc, v) => acc + v.z, 0);
  return sum / vertices.length;
}

/**
 * Project 3D faces to 2D axonometric faces
 * 
 * @param faces - Array of 3D faces
 * @returns Array of axonometric faces with depth values
 */
export function projectFaces(faces: Face[]): AxonFace[] {
  return faces.map(face => {
    // Project all vertices to 2D
    // CRITICAL: Project each vertex exactly once, ensuring original vertices are not mutated
    const vertices2d: Vec2[] = face.vertices.map(v => {
      // Extract values to ensure we don't hold references
      const x = v.x;
      const y = v.y;
      const z = v.z;
      
      // Store original for assertion
      const originalX = v.x;
      const originalY = v.y;
      const originalZ = v.z;
      
      const projected = projectAxon(v);
      
      // TEMPORARY ASSERTION: Verify original vertex was not mutated
      if (v.x !== originalX || v.y !== originalY || v.z !== originalZ) {
        console.error('❌ PROJECT FACES MUTATION: Vertex was modified!', {
          original: { x: originalX, y: originalY, z: originalZ },
          current: { x: v.x, y: v.y, z: v.z },
          vertex: v
        });
      }
      
      return projected;
    });
    
    // Calculate average depth for sorting
    const depth = averageDepth(face.vertices);
    
    return {
      vertices: vertices2d,
      depth,
      normal: face.normal,
      style: face.style
    };
  });
}

