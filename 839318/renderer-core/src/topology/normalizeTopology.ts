/**
 * Normalize Topology
 * 
 * Converts raw topology (from AI, vectorization, etc.) to renderer contract format.
 * Handles polylines, different data structures, and normalizes coordinates.
 */

import type { Vec2 } from '../geometry/types.js';
import type { Wall, NormalizedTopology } from '../render/contract.js';

/**
 * Default wall parameters
 */
export const DEFAULT_WALL_THICKNESS = 300; // 300mm
export const DEFAULT_WALL_HEIGHT = 2700;   // 2700mm = 2.7m

/**
 * Target size for normalization
 */
export const TARGET_SIZE = 1000;

/**
 * Axon rotation angle (45° to fix vertical stick issue)
 */
export const AXON_ROTATION = Math.PI / 4; // 45°

/**
 * Convert polyline to wall segments
 * 
 * @param polyline - Array of points [x, y] or Vec2
 * @param thickness - Wall thickness (default: DEFAULT_WALL_THICKNESS)
 * @param height - Wall height (default: DEFAULT_WALL_HEIGHT)
 * @returns Array of wall segments
 */
function polylineToWalls(
  polyline: Array<[number, number] | Vec2>,
  thickness: number = DEFAULT_WALL_THICKNESS,
  height: number = DEFAULT_WALL_HEIGHT
): Wall[] {
  const walls: Wall[] = [];
  
  for (let i = 0; i < polyline.length - 1; i++) {
    const start = Array.isArray(polyline[i])
      ? { x: polyline[i][0], y: polyline[i][1] }
      : polyline[i];
    const end = Array.isArray(polyline[i + 1])
      ? { x: polyline[i + 1][0], y: polyline[i + 1][1] }
      : polyline[i + 1];
    
    walls.push({
      start,
      end,
      thickness,
      height
    });
  }
  
  return walls;
}

/**
 * Compute bounds of walls
 */
function computeBounds(walls: Wall[]): {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  width: number;
  height: number;
} {
  if (walls.length === 0) {
    return { minX: 0, maxX: 0, minY: 0, maxY: 0, width: 0, height: 0 };
  }
  
  const allPoints = walls.flatMap(w => [w.start, w.end]);
  const xs = allPoints.map(p => p.x);
  const ys = allPoints.map(p => p.y);
  
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  
  return {
    minX,
    maxX,
    minY,
    maxY,
    width: maxX - minX,
    height: maxY - minY
  };
}

/**
 * Normalize coordinates (center + scale)
 * 
 * @param walls - Array of walls
 * @returns Normalized walls
 */
function normalizeCoordinates(walls: Wall[]): Wall[] {
  if (walls.length === 0) {
    return walls;
  }
  
  const bounds = computeBounds(walls);
  
  // Calculate scale to fit TARGET_SIZE
  const maxDimension = Math.max(bounds.width, bounds.height);
  const scale = maxDimension > 0 ? TARGET_SIZE / maxDimension : 1.0;
  
  // Calculate center
  const centerX = (bounds.minX + bounds.maxX) / 2;
  const centerY = (bounds.minY + bounds.maxY) / 2;
  
  // Transform walls: center at origin, then scale
  return walls.map(wall => ({
    ...wall,
    start: {
      x: (wall.start.x - centerX) * scale,
      y: (wall.start.y - centerY) * scale
    },
    end: {
      x: (wall.end.x - centerX) * scale,
      y: (wall.end.y - centerY) * scale
    }
  }));
}

/**
 * Rotate 2D point around origin
 * 
 * @param point - Point to rotate
 * @param angle - Rotation angle in radians
 * @returns Rotated point
 */
function rotate2D(point: Vec2, angle: number): Vec2 {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  
  return {
    x: point.x * cos - point.y * sin,
    y: point.x * sin + point.y * cos
  };
}

/**
 * Apply axon rotation to walls (fix vertical stick issue)
 * 
 * @param walls - Array of walls
 * @returns Rotated walls
 */
function applyAxonRotation(walls: Wall[]): Wall[] {
  return walls.map(wall => ({
    ...wall,
    start: rotate2D(wall.start, AXON_ROTATION),
    end: rotate2D(wall.end, AXON_ROTATION)
  }));
}

/**
 * Normalize raw topology to renderer contract format
 * 
 * Handles various input formats:
 * - AI topology with walls array
 * - Vector polylines
 * - Mixed formats
 * 
 * @param rawTopology - Raw topology from various sources
 * @returns Normalized topology in renderer format
 */
export function normalizeTopology(rawTopology: any): NormalizedTopology {
  let walls: Wall[] = [];
  
  // Handle different input formats
  if (rawTopology.walls && Array.isArray(rawTopology.walls)) {
    // Already in wall format (from AI or previous normalization)
    walls = rawTopology.walls.map((wall: any) => {
      const start: Vec2 = Array.isArray(wall.start)
        ? { x: wall.start[0], y: wall.start[1] }
        : (wall.start.x !== undefined ? wall.start : { x: 0, y: 0 });
      
      const end: Vec2 = Array.isArray(wall.end)
        ? { x: wall.end[0], y: wall.end[1] }
        : (wall.end.x !== undefined ? wall.end : { x: 0, y: 0 });
      
      return {
        start,
        end,
        thickness: wall.thickness || DEFAULT_WALL_THICKNESS,
        height: wall.height || DEFAULT_WALL_HEIGHT
      };
    });
  } else if (rawTopology.paths && Array.isArray(rawTopology.paths)) {
    // Polylines format - convert to walls
    for (const path of rawTopology.paths) {
      if (path.type === 'wall' || !path.type) {
        const points = path.points || path;
        if (Array.isArray(points) && points.length >= 2) {
          const thickness = path.thickness || DEFAULT_WALL_THICKNESS;
          const height = path.height || DEFAULT_WALL_HEIGHT;
          walls.push(...polylineToWalls(points, thickness, height));
        }
      }
    }
  } else if (rawTopology.polylines && Array.isArray(rawTopology.polylines)) {
    // Polylines array format
    for (const polyline of rawTopology.polylines) {
      if (Array.isArray(polyline) && polyline.length >= 2) {
        walls.push(...polylineToWalls(polyline, DEFAULT_WALL_THICKNESS, DEFAULT_WALL_HEIGHT));
      }
    }
  }
  
  // Normalize coordinates (center + scale)
  walls = normalizeCoordinates(walls);
  
  // Apply axon rotation (fix vertical stick issue)
  walls = applyAxonRotation(walls);
  
  // Extract rooms if available (for future use)
  const rooms = rawTopology.rooms || [];
  
  return {
    walls,
    rooms
  };
}

