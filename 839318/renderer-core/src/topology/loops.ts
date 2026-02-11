/**
 * Detect Closed Loops from Walls
 * 
 * Builds adjacency graph from walls and detects closed cycles.
 * Used to find building footprints and rooms.
 */

import type { Vec2 } from '../geometry/types.js';

/**
 * Wall segment with endpoints
 */
interface WallSegment {
  start: Vec2;
  end: Vec2;
  thickness?: number;
}

/**
 * Tolerance for snapping endpoints (in pixels/millimeters)
 */
const ENDPOINT_TOLERANCE = 5.0;

/**
 * Minimum area for a valid loop (to ignore noise)
 */
const MIN_LOOP_AREA = 1000.0; // 1000 square units

/**
 * Calculate distance between two points
 */
function distance(p1: Vec2, p2: Vec2): number {
  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  return Math.sqrt(dx * dx + dy * dy);
}

/**
 * Check if two points are within tolerance
 */
function pointsEqual(p1: Vec2, p2: Vec2, tolerance: number = ENDPOINT_TOLERANCE): boolean {
  return distance(p1, p2) <= tolerance;
}

/**
 * Calculate signed area of a polygon
 * Positive = CCW, Negative = CW
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
 * Normalize point coordinates (snap to grid within tolerance)
 */
function normalizePoint(point: Vec2, tolerance: number = ENDPOINT_TOLERANCE): Vec2 {
  return {
    x: Math.round(point.x / tolerance) * tolerance,
    y: Math.round(point.y / tolerance) * tolerance
  };
}

/**
 * Find closed loops from wall segments
 * 
 * @param walls - Array of wall segments
 * @returns Array of closed polygons (loops)
 */
export function findClosedLoops(
  walls: Array<{
    start: [number, number] | Vec2;
    end: [number, number] | Vec2;
    thickness?: number;
  }>
): Vec2[][] {
  if (walls.length < 3) {
    return []; // Need at least 3 walls for a closed loop
  }
  
  // Convert walls to normalized format
  const segments: WallSegment[] = walls.map(wall => {
    const start: Vec2 = Array.isArray(wall.start)
      ? { x: wall.start[0], y: wall.start[1] }
      : wall.start;
    const end: Vec2 = Array.isArray(wall.end)
      ? { x: wall.end[0], y: wall.end[1] }
      : wall.end;
    
    // Normalize points to snap endpoints within tolerance
    return {
      start: normalizePoint(start),
      end: normalizePoint(end),
      thickness: wall.thickness
    };
  });
  
  // Build adjacency graph
  // Map from point to list of connected points
  const adjacency = new Map<string, Vec2[]>();
  
  for (const segment of segments) {
    const startKey = `${segment.start.x},${segment.start.y}`;
    const endKey = `${segment.end.x},${segment.end.y}`;
    
    // Add end to start's adjacency list
    if (!adjacency.has(startKey)) {
      adjacency.set(startKey, []);
    }
    adjacency.get(startKey)!.push(segment.end);
    
    // Add start to end's adjacency list (bidirectional)
    if (!adjacency.has(endKey)) {
      adjacency.set(endKey, []);
    }
    adjacency.get(endKey)!.push(segment.start);
  }
  
  // Find cycles using DFS
  const loops: Vec2[][] = [];
  const visited = new Set<string>();
  
  function findCycle(startKey: string, currentPath: Vec2[]): Vec2[] | null {
    const [x, y] = startKey.split(',').map(Number);
    const currentPoint: Vec2 = { x, y };
    
    // Check if we've formed a cycle
    if (currentPath.length >= 3) {
      const firstPoint = currentPath[0];
      if (pointsEqual(currentPoint, firstPoint, ENDPOINT_TOLERANCE)) {
        return currentPath; // Found a cycle
      }
    }
    
    // Avoid revisiting points (except the start)
    if (currentPath.length > 0) {
      const pathKey = `${currentPoint.x},${currentPoint.y}`;
      if (visited.has(pathKey) && currentPath.length > 1) {
        return null; // Already visited this point in this path
      }
      visited.add(pathKey);
    }
    
    // Explore neighbors
    const neighbors = adjacency.get(startKey) || [];
    for (const neighbor of neighbors) {
      const neighborKey = `${neighbor.x},${neighbor.y}`;
      
      // Skip if this neighbor is the previous point (don't go backwards)
      if (currentPath.length > 0) {
        const prevPoint = currentPath[currentPath.length - 1];
        if (pointsEqual(neighbor, prevPoint, ENDPOINT_TOLERANCE)) {
          continue;
        }
      }
      
      const newPath = [...currentPath, currentPoint];
      const cycle = findCycle(neighborKey, newPath);
      if (cycle) {
        return cycle;
      }
    }
    
    return null;
  }
  
  // Try to find cycles starting from each point
  for (const [startKey] of adjacency) {
    if (!visited.has(startKey)) {
      const cycle = findCycle(startKey, []);
      if (cycle && cycle.length >= 3) {
        // Calculate area to filter out tiny loops (noise)
        const area = Math.abs(signedArea(cycle));
        if (area >= MIN_LOOP_AREA) {
          // Ensure loop is closed (first point == last point)
          if (!pointsEqual(cycle[0], cycle[cycle.length - 1], ENDPOINT_TOLERANCE)) {
            cycle.push({ ...cycle[0] }); // Close the loop
          }
          loops.push(cycle);
        }
      }
    }
  }
  
  return loops;
}

/**
 * Select the largest closed loop as building footprint
 * 
 * @param loops - Array of closed polygons
 * @returns Largest polygon by area, or null if none found
 */
export function selectLargestLoop(loops: Vec2[][]): Vec2[] | null {
  if (loops.length === 0) {
    return null;
  }
  
  let largestLoop: Vec2[] | null = null;
  let largestArea = 0;
  
  for (const loop of loops) {
    const area = Math.abs(signedArea(loop));
    if (area > largestArea) {
      largestArea = area;
      largestLoop = loop;
    }
  }
  
  return largestLoop;
}

