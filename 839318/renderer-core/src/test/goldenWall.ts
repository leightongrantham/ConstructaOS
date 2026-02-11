/**
 * Hardcoded Golden Test Wall
 * 
 * Single rectangular wall loop for testing.
 * - Thickness: 200mm
 * - Height: 2700mm
 * - Rectangular footprint
 */

import type { Wall, WallVolume } from '../geometry/types.js';
import { offsetPolyline } from '../geometry/offsetPolyline.js';
import { buildWallFootprint } from '../geometry/wallFootprint.js';
import { extrudeWall } from '../geometry/extrudeWall.js';
import { cullFaces } from '../geometry/cullFaces.js';
import { projectFaces } from '../geometry/projectFaces.js';
import { depthSort } from '../geometry/depthSort.js';

/**
 * Create golden test wall
 * Rectangular wall: 200mm thick, 2700mm high
 * 
 * @returns Wall object with centerline
 */
export function createGoldenWall(): Wall {
  // Rectangular centerline: 4000mm x 3000mm rectangle
  // Close the loop for proper offset calculation
  const centerline = [
    { x: 0, y: 0 },
    { x: 4000, y: 0 },
    { x: 4000, y: 3000 },
    { x: 0, y: 3000 },
    { x: 0, y: 0 } // Close loop - offsetPolyline now handles this correctly
  ];
  
  return {
    centerline,
    thickness: 200, // 200mm wall thickness
    height: 2700     // 2700mm wall height
  };
}

/**
 * Process golden wall through full pipeline
 * 
 * @returns Processed wall volume ready for rendering
 */
export function processGoldenWall(): {
  wall: Wall;
  volume: WallVolume;
  axonFaces: ReturnType<typeof depthSort>;
} {
  // Create wall
  const wall = createGoldenWall();
  
  // Offset centerline to get left/right boundaries
  const { left, right } = offsetPolyline(wall.centerline, wall.thickness);
  
  // Build footprint polygon
  const footprint = buildWallFootprint(left, right);
  
  // Extrude to 3D volume
  const volume = extrudeWall(footprint, wall.height);
  
  // Cull invisible faces
  const visibleFaces = cullFaces(volume.faces);
  
  // Project to axonometric space
  const axonFaces = projectFaces(visibleFaces);
  
  // Depth sort
  const sortedFaces = depthSort(axonFaces);
  
  return {
    wall,
    volume: {
      ...volume,
      faces: visibleFaces
    },
    axonFaces: sortedFaces
  };
}

