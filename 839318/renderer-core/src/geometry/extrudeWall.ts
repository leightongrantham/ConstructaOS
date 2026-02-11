/**
 * Extrude Wall Footprint into 3D Volume
 * 
 * Converts 2D footprint polygon into a 3D solid prism.
 * Creates top & bottom vertices, vertical faces, and assigns face normals and styles.
 */

import type { Vec2, Vec3, Face, WallVolume } from './types.js';

/**
 * Calculate face normal from vertices
 * 
 * @param vertices - Face vertices (3 or 4 points)
 * @returns Normalized normal vector
 */
function calculateFaceNormal(vertices: Vec3[]): Vec3 {
  if (vertices.length < 3) {
    return { x: 0, y: 0, z: 1 }; // Default up vector
  }
  
  // Use first three vertices to calculate normal
  const v0 = vertices[0];
  const v1 = vertices[1];
  const v2 = vertices[2];
  
  // Two edge vectors
  const edge1 = {
    x: v1.x - v0.x,
    y: v1.y - v0.y,
    z: v1.z - v0.z
  };
  const edge2 = {
    x: v2.x - v0.x,
    y: v2.y - v0.y,
    z: v2.z - v0.z
  };
  
  // Cross product
  const normal = {
    x: edge1.y * edge2.z - edge1.z * edge2.y,
    y: edge1.z * edge2.x - edge1.x * edge2.z,
    z: edge1.x * edge2.y - edge1.y * edge2.x
  };
  
  // Normalize
  const length = Math.sqrt(normal.x * normal.x + normal.y * normal.y + normal.z * normal.z);
  if (length < 1e-10) {
    return { x: 0, y: 0, z: 1 };
  }
  
  return {
    x: normal.x / length,
    y: normal.y / length,
    z: normal.z / length
  };
}

/**
 * Determine face style based on normal direction
 * 
 * @param normal - Face normal vector
 * @returns Face style type
 */
function determineFaceStyle(normal: Vec3): 'top' | 'left' | 'right' | 'front' | 'back' {
  // Check which axis the normal is closest to
  const absX = Math.abs(normal.x);
  const absY = Math.abs(normal.y);
  const absZ = Math.abs(normal.z);
  
  if (absZ > absX && absZ > absY) {
    // Z-dominant: top or bottom
    return normal.z > 0 ? 'top' : 'back';
  } else if (absX > absY) {
    // X-dominant: left or right
    return normal.x > 0 ? 'right' : 'left';
  } else {
    // Y-dominant: front or back
    return normal.y > 0 ? 'front' : 'back';
  }
}

/**
 * Extrude footprint polygon into 3D wall volume
 * 
 * @param footprint - 2D footprint polygon (CCW ordered)
 * @param height - Wall height in millimeters
 * @returns 3D wall volume with faces
 */
export function extrudeWall(
  footprint: Vec2[],
  height: number
): WallVolume {
  if (footprint.length < 3) {
    throw new Error('Footprint must have at least 3 vertices');
  }
  
  const faces: Face[] = [];
  const numVertices = footprint.length;
  
  // Create bottom vertices (z = 0)
  const bottomVertices: Vec3[] = footprint.map(v => ({
    x: v.x,
    y: v.y,
    z: 0
  }));
  
  // Create top vertices (z = height)
  const topVertices: Vec3[] = footprint.map(v => ({
    x: v.x,
    y: v.y,
    z: height
  }));
  
  // Create top face (all top vertices)
  const topNormal = calculateFaceNormal([topVertices[0], topVertices[1], topVertices[2]]);
  // Ensure normal points up
  const topFaceNormal = topNormal.z < 0 
    ? { x: -topNormal.x, y: -topNormal.y, z: -topNormal.z }
    : topNormal;
  
  faces.push({
    vertices: topVertices,
    normal: topFaceNormal,
    style: 'top'
  });
  
  // Create vertical faces (sides)
  for (let i = 0; i < numVertices; i++) {
    const next = (i + 1) % numVertices;
    
    // Quad face: bottom[i], bottom[next], top[next], top[i]
    const quadVertices: Vec3[] = [
      bottomVertices[i],
      bottomVertices[next],
      topVertices[next],
      topVertices[i]
    ];
    
    const faceNormal = calculateFaceNormal(quadVertices);
    const style = determineFaceStyle(faceNormal);
    
    faces.push({
      vertices: quadVertices,
      normal: faceNormal,
      style
    });
  }
  
  // Extract centerline from footprint (approximate as polygon centroid)
  const centerline: Vec2[] = footprint.map(v => ({ x: v.x, y: v.y }));
  
  // Calculate average thickness from footprint (approximate)
  let totalThickness = 0;
  if (footprint.length >= 4) {
    // Use first two points to estimate thickness
    const p0 = footprint[0];
    const p1 = footprint[1];
    const pMid = footprint[Math.floor(footprint.length / 2)];
    const pMidNext = footprint[Math.floor(footprint.length / 2) + 1];
    
    const dist1 = Math.sqrt(
      Math.pow(p1.x - p0.x, 2) + Math.pow(p1.y - p0.y, 2)
    );
    const dist2 = Math.sqrt(
      Math.pow(pMidNext.x - pMid.x, 2) + Math.pow(pMidNext.y - pMid.y, 2)
    );
    totalThickness = (dist1 + dist2) / 2;
  }
  
  return {
    faces,
    centerline,
    thickness: totalThickness,
    height
  };
}

