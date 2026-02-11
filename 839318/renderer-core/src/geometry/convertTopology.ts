/**
 * Convert Topology to Geometry Pipeline
 * 
 * Converts topology walls (start/end format) to centerlines
 * for processing through the new geometry pipeline.
 */

import type { Wall, Vec2 } from './types.js';

/**
 * Convert topology wall to centerline format
 * 
 * @param wall - Topology wall {start: [x,y], end: [x,y], thickness: number}
 * @returns Wall with centerline format
 */
export function topologyWallToCenterline(wall: {
  start: [number, number] | { x: number; y: number };
  end: [number, number] | { x: number; y: number };
  thickness: number;
  height?: number;
}): Wall {
  // Convert start/end to Vec2 format
  const start: Vec2 = Array.isArray(wall.start)
    ? { x: wall.start[0], y: wall.start[1] }
    : { x: wall.start.x, y: wall.start.y };
  
  const end: Vec2 = Array.isArray(wall.end)
    ? { x: wall.end[0], y: wall.end[1] }
    : { x: wall.end.x, y: wall.end.y };
  
  // Create centerline (just start and end points for a single wall segment)
  const centerline: Vec2[] = [start, end];
  
  return {
    centerline,
    thickness: wall.thickness || 200,
    height: wall.height || 2700
  };
}

/**
 * Convert multiple topology walls to centerlines
 * Groups connected walls into continuous polylines
 * 
 * @param walls - Array of topology walls
 * @returns Array of Walls with centerlines
 */
export function topologyWallsToCenterlines(walls: Array<{
  start: [number, number] | { x: number; y: number };
  end: [number, number] | { x: number; y: number };
  thickness: number;
  height?: number;
}>): Wall[] {
  // For now, convert each wall segment independently
  // TODO: Group connected walls into continuous polylines
  return walls.map(wall => topologyWallToCenterline(wall));
}

/**
 * Process topology walls through new geometry pipeline
 * 
 * @param walls - Array of topology walls
 * @returns Processed axon faces ready for rendering
 */
export async function processTopologyWalls(walls: Array<{
  start: [number, number] | { x: number; y: number };
  end: [number, number] | { x: number; y: number };
  thickness: number;
  height?: number;
}>): Promise<Array<{
  vertices: Vec2[];
  depth: number;
  normal: { x: number; y: number; z: number };
  style: 'top' | 'left' | 'right' | 'front' | 'back';
}>> {
  // Import geometry pipeline functions
  const { offsetPolyline } = await import('./offsetPolyline.js');
  const { buildWallFootprint } = await import('./wallFootprint.js');
  const { extrudeWall } = await import('./extrudeWall.js');
  const { cullFaces } = await import('./cullFaces.js');
  const { projectFaces } = await import('./projectFaces.js');
  const { depthSort } = await import('./depthSort.js');
  
  // Convert walls to centerlines
  const centerlineWalls = topologyWallsToCenterlines(walls);
  
  // Process each wall through the pipeline
  const allAxonFaces: Array<{
    vertices: Vec2[];
    depth: number;
    normal: { x: number; y: number; z: number };
    style: 'top' | 'left' | 'right' | 'front' | 'back';
  }> = [];
  
  for (const wall of centerlineWalls) {
    // Offset centerline to get left/right boundaries
    const { left, right } = offsetPolyline(wall.centerline, wall.thickness);
    
    // Build footprint polygon
    const footprint = buildWallFootprint(left, right);
    
    if (footprint.length < 3) {
      console.warn('⚠️ Skipping wall with invalid footprint:', wall);
      continue;
    }
    
    // Extrude to 3D volume
    const volume = extrudeWall(footprint, wall.height);
    
    // Cull invisible faces
    const visibleFaces = cullFaces(volume.faces);
    
    // Project to axonometric space
    const axonFaces = projectFaces(visibleFaces);
    
    // Add to collection
    allAxonFaces.push(...axonFaces);
  }
  
  // Depth sort all faces together
  const sortedFaces = depthSort(allAxonFaces);
  
  return sortedFaces;
}

