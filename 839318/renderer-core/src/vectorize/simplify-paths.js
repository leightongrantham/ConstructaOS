/**
 * Path simplification utilities
 * Reduces path complexity while maintaining visual fidelity
 * All functions are pure and deterministic
 */

import { simplifyPolyline, distance, lineLength } from '../utils/geom.js';

/**
 * Calculate signed area of a closed path (positive = counter-clockwise, negative = clockwise)
 * @param {[number, number][]} points - Array of points forming a closed path
 * @returns {number} Signed area (positive = CCW, negative = CW)
 */
function signedArea(points) {
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
 * @param {[number, number][]} points - Array of points
 * @param {number} tolerance - Distance tolerance for considering points equal (default: 1.0)
 * @returns {boolean} True if path is closed
 */
function isClosedPath(points, tolerance = 1.0) {
  if (points.length < 3) return false;
  const first = points[0];
  const last = points[points.length - 1];
  const dist = distance(first, last);
  return dist < tolerance;
}

/**
 * Simplify paths using Douglas-Peucker algorithm
 * @param {Array<[number, number][]>} paths - Array of paths, each path is array of [x,y] points
 * @param {number} tolerance - Maximum distance tolerance for simplification (default: 1.0)
 * @returns {Array<[number, number][]>} Simplified paths
 */
export function douglasPeucker(paths, tolerance = 1.0) {
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
 * @param {Array<[number, number][]>} paths - Array of paths, each path is array of [x,y] points
 * @param {number} minLength - Minimum segment length to keep (default: 2.0)
 * @returns {Array<[number, number][]>} Paths with small segments removed
 */
export function removeSmallSegments(paths, minLength = 2.0) {
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
    
    const filtered = [path[0]]; // Always keep first point
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
 * @param {Array<[number, number][]>} paths - Array of paths, each path is array of [x,y] points
 * @param {string} targetDirection - Target direction: 'ccw' (counter-clockwise) or 'cw' (clockwise) (default: 'ccw')
 * @param {number} tolerance - Distance tolerance for considering path closed (default: 1.0)
 * @returns {Array<[number, number][]>} Paths with equalized direction
 */
export function equalizePathDirection(paths, targetDirection = 'ccw', tolerance = 1.0) {
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
      const reversed = [path[0]];
      for (let i = path.length - 1; i > 0; i--) {
        reversed.push(path[i]);
      }
      return reversed;
    }
    
    return path;
  });
}

/**
 * Complete path simplification pipeline
 * Applies all simplification steps in sequence
 * @param {Array<[number, number][]>} paths - Array of paths, each path is array of [x,y] points
 * @param {Object} options - Simplification options
 * @param {number} options.douglasPeuckerTolerance - Douglas-Peucker tolerance (default: 1.0)
 * @param {number} options.minSegmentLength - Minimum segment length (default: 2.0)
 * @param {string} options.targetDirection - Target path direction: 'ccw' or 'cw' (default: 'ccw')
 * @param {boolean} options.applyDouglasPeucker - Apply Douglas-Peucker (default: true)
 * @param {boolean} options.removeSmallSegments - Remove small segments (default: true)
 * @param {boolean} options.equalizeDirection - Equalize path direction (default: true)
 * @returns {Array<[number, number][]>} Simplified paths
 */
export function simplify(paths, options = {}) {
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
 * @param {[number, number][]} points - Single path as array of [x,y] points
 * @param {number} tolerance - Maximum distance tolerance for simplification
 * @returns {[number, number][]} Simplified array of points
 */
export function reducePoints(points, tolerance = 1.0) {
  return simplifyPolyline(points, tolerance);
}

/**
 * Smooth paths by averaging nearby points
 * @param {Array<[number, number][]>} paths - Array of paths
 * @param {number} smoothness - Smoothing factor 0-1 (default: 0.5)
 * @param {number} windowSize - Size of smoothing window (default: 3)
 * @returns {Array<[number, number][]>} Smoothed paths
 */
export function smoothPaths(paths, smoothness = 0.5, windowSize = 3) {
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
    
    const smoothed = [];
    const halfWindow = Math.floor(windowSize / 2);
    const isClosed = isClosedPath(path);
    
    for (let i = 0; i < path.length; i++) {
      // Collect points in window
      const windowPoints = [];
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
      const smoothedPoint = [
        original[0] * (1 - smoothness) + avgX * smoothness,
        original[1] * (1 - smoothness) + avgY * smoothness
      ];
      
      smoothed.push(smoothedPoint);
    }
    
    return smoothed;
  });
}