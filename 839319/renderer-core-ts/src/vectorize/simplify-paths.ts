/**
 * Path simplification utilities
 * Reduces path complexity while maintaining visual fidelity
 * All functions are pure and deterministic
 */

import { simplifyPolyline, distance, lineLength } from '../utils/geom.js';

export type Path = [number, number][];
export type Paths = Path[];

/**
 * Calculate signed area of a closed path (positive = counter-clockwise, negative = clockwise)
 */
function signedArea(points: Path): number {
  if (points.length < 3) return 0;
  
  let area = 0;
  for (let i = 0; i < points.length; i++) {
    const j = (i + 1) % points.length;
    area += points[i][0] * points[j][1];
    area -= points[j][0] * points[i][1];
  }
  return area / 2;
}

/**
 * Check if a path is closed (first and last points are the same)
 */
function isClosedPath(points: Path, tolerance: number = 1.0): boolean {
  if (points.length < 3) return false;
  const first = points[0];
  const last = points[points.length - 1];
  const dist = distance(first, last);
  return dist < tolerance;
}

/**
 * Simplify paths using Douglas-Peucker algorithm
 */
export function douglasPeucker(paths: Paths, tolerance: number = 1.0): Paths {
  if (!Array.isArray(paths) || paths.length === 0) {
    return paths;
  }
  
  return paths.map(path => {
    if (!Array.isArray(path) || path.length <= 2) {
      return path;
    }
    
    // Use the simplifyPolyline function from geom.js
    return simplifyPolyline(path, tolerance);
  });
}

/**
 * Remove small segments from paths
 * Filters out line segments shorter than the specified threshold
 */
export function removeSmallSegments(paths: Paths, minLength: number = 2.0): Paths {
  if (!Array.isArray(paths) || paths.length === 0) {
    return paths;
  }
  
  return paths.map(path => {
    if (!Array.isArray(path) || path.length === 0) {
      return path;
    }
    
    if (path.length === 1) {
      return path; // Single point, keep as is
    }
    
    const filtered: Path = [path[0]]; // Always keep first point
    let lastKeptIndex = 0;
    
    for (let i = 1; i < path.length; i++) {
      const segmentLength = lineLength(path[lastKeptIndex], path[i]);
      
      if (segmentLength >= minLength) {
        filtered.push(path[i]);
        lastKeptIndex = i;
      }
      // Skip points that form segments shorter than minLength
    }
    
    // Ensure closed paths remain closed if they were closed
    if (filtered.length >= 2 && isClosedPath(path, minLength)) {
      const first = filtered[0];
      const last = filtered[filtered.length - 1];
      if (distance(first, last) > minLength) {
        // Re-add last point if path should be closed
        filtered.push([first[0], first[1]]);
      }
    }
    
    // Return filtered path, or minimum path (first and last point), or single point
    if (filtered.length >= 2) {
      return filtered;
    } else if (path.length >= 2) {
      return [path[0], path[path.length - 1]];
    } else {
      return path; // Single point path
    }
  }).filter(path => path.length >= 1); // Remove empty paths, but keep single points
}

/**
 * Equalize path direction
 * Ensures all closed paths have the same orientation (default: counter-clockwise)
 * Open paths are left as-is
 */
export function equalizePathDirection(
  paths: Paths,
  targetDirection: 'ccw' | 'cw' = 'ccw',
  tolerance: number = 1.0
): Paths {
  if (!Array.isArray(paths) || paths.length === 0) {
    return paths;
  }
  
  const targetCCW = targetDirection.toLowerCase() === 'ccw';
  
  return paths.map(path => {
    if (!Array.isArray(path) || path.length < 3) {
      return path; // Can't determine direction of short paths
    }
    
    // Only process closed paths
    if (!isClosedPath(path, tolerance)) {
      return path; // Leave open paths as-is
    }
    
    // Calculate signed area to determine current direction
    const area = signedArea(path);
    const isCCW = area > 0;
    
    // Reverse path if direction doesn't match target
    if ((targetCCW && !isCCW) || (!targetCCW && isCCW)) {
      // Reverse the path (keep first point, reverse the rest)
      const reversed: Path = [path[0]];
      for (let i = path.length - 1; i > 0; i--) {
        reversed.push(path[i]);
      }
      return reversed;
    }
    
    return path;
  });
}

export interface SimplifyOptions {
  douglasPeuckerTolerance?: number;
  minSegmentLength?: number;
  targetDirection?: 'ccw' | 'cw';
  applyDouglasPeucker?: boolean;
  removeSmallSegments?: boolean;
  equalizeDirection?: boolean;
}

/**
 * Complete path simplification pipeline
 * Applies all simplification steps in sequence
 */
export function simplify(paths: Paths, options: SimplifyOptions = {}): Paths {
  if (!Array.isArray(paths) || paths.length === 0) {
    return paths;
  }
  
  const {
    douglasPeuckerTolerance = 1.0,
    minSegmentLength = 2.0,
    targetDirection = 'ccw',
    applyDouglasPeucker = true,
    removeSmallSegments: shouldRemoveSmallSegments = true,
    equalizeDirection = true
  } = options;
  
  let result = paths;
  
  // Apply Douglas-Peucker simplification
  if (applyDouglasPeucker) {
    result = douglasPeucker(result, douglasPeuckerTolerance);
  }
  
  // Remove small segments
  if (shouldRemoveSmallSegments) {
    result = removeSmallSegments(result, minSegmentLength);
  }
  
  // Equalize path direction
  if (equalizeDirection) {
    result = equalizePathDirection(result, targetDirection);
  }
  
  return result;
}

/**
 * Reduce points in paths using Douglas-Peucker algorithm
 */
export function reducePoints(points: Path, tolerance: number = 1.0): Path {
  return simplifyPolyline(points, tolerance);
}

/**
 * Smooth paths by averaging nearby points
 */
export function smoothPaths(paths: Paths, smoothness: number = 0.5, windowSize: number = 3): Paths {
  if (!Array.isArray(paths) || paths.length === 0) {
    return paths;
  }
  
  if (smoothness <= 0 || windowSize < 2) {
    return paths;
  }
  
  return paths.map(path => {
    if (!Array.isArray(path) || path.length <= 2) {
      return path;
    }
    
    const smoothed: Path = [];
    const halfWindow = Math.floor(windowSize / 2);
    const isClosed = isClosedPath(path);
    
    for (let i = 0; i < path.length; i++) {
      // Collect points in window
      const windowPoints: Path = [];
      for (let j = -halfWindow; j <= halfWindow; j++) {
        let idx = i + j;
        
        // Handle boundary conditions
        if (isClosed) {
          idx = ((idx % path.length) + path.length) % path.length;
        } else {
          if (idx < 0) idx = 0;
          if (idx >= path.length) idx = path.length - 1;
        }
        
        windowPoints.push(path[idx]);
      }
      
      // Average window points
      let avgX = 0;
      let avgY = 0;
      for (const point of windowPoints) {
        avgX += point[0];
        avgY += point[1];
      }
      avgX /= windowPoints.length;
      avgY /= windowPoints.length;
      
      // Blend with original point
      const original = path[i];
      const smoothedPoint: [number, number] = [
        original[0] * (1 - smoothness) + avgX * smoothness,
        original[1] * (1 - smoothness) + avgY * smoothness
      ];
      
      smoothed.push(smoothedPoint);
    }
    
    return smoothed;
  });
}

