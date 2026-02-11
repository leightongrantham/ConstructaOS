/**
 * Pre-topology polyline cleanup
 * Cleans up vectorized polylines before topology processing
 * Removes noise, simplifies paths, and merges duplicates
 * All functions are pure and deterministic
 */

import { douglasPeucker } from './simplify-paths.js';
import { distance, lineAngle, lineLength, projectPoint } from '../utils/geom.js';

/**
 * Remove polylines with fewer than the minimum number of points
 * @param {Array<[number, number][]>} polylines - Array of polylines
 * @param {number} minPoints - Minimum number of points required (default: 5)
 * @returns {Array<[number, number][]>} Filtered polylines
 */
export function removeShortPolylines(polylines, minPoints = 5) {
  if (!Array.isArray(polylines) || polylines.length === 0) {
    return polylines;
  }
  
  return polylines.filter(polyline => {
    if (!Array.isArray(polyline)) return false;
    return polyline.length >= minPoints;
  });
}

/**
 * Check if two points are collinear with a given line segment
 * @param {[number, number]} point - Point to check
 * @param {[number, number]} lineStart - Line segment start
 * @param {[number, number]} lineEnd - Line segment end
 * @param {number} tolerance - Distance tolerance for collinearity (default: 1.0)
 * @returns {boolean} True if point is collinear with the line segment
 */
function isCollinear(point, lineStart, lineEnd, tolerance = 1.0) {
  const projected = projectPoint(point, lineStart, lineEnd);
  const dist = distance(point, projected);
  return dist <= tolerance;
}

/**
 * Merge collinear segments in a polyline
 * Combines consecutive segments that lie on the same line
 * @param {[number, number][]} polyline - Input polyline
 * @param {number} angleTolerance - Angle tolerance in radians for collinearity (default: 0.01)
 * @param {number} distanceTolerance - Distance tolerance for collinearity (default: 1.0)
 * @returns {[number, number][]} Polyline with collinear segments merged
 */
function mergeCollinearSegmentsInPolyline(polyline, angleTolerance = 0.01, distanceTolerance = 1.0) {
  if (!Array.isArray(polyline) || polyline.length <= 2) {
    return polyline;
  }
  
  const result = [polyline[0]]; // Always keep first point
  
  let i = 1;
  while (i < polyline.length - 1) {
    const prevPoint = result[result.length - 1];
    const currPoint = polyline[i];
    const nextPoint = polyline[i + 1];
    
    // Check if current point is collinear with the segment from prev to next
    const angle1 = lineAngle(prevPoint, currPoint);
    const angle2 = lineAngle(currPoint, nextPoint);
    
    // Normalize angles to check if they're approximately the same (or opposite)
    const angleDiff = Math.abs(angle1 - angle2);
    const normalizedDiff = Math.min(angleDiff, Math.abs(angleDiff - Math.PI), Math.abs(angleDiff - 2 * Math.PI));
    
    const isCollinearAngle = normalizedDiff <= angleTolerance;
    const isCollinearDist = isCollinear(currPoint, prevPoint, nextPoint, distanceTolerance);
    
    if (isCollinearAngle && isCollinearDist) {
      // Skip current point - it's collinear
      i++;
    } else {
      // Keep current point
      result.push(currPoint);
      i++;
    }
  }
  
  // Always keep last point
  if (result[result.length - 1] !== polyline[polyline.length - 1]) {
    result.push(polyline[polyline.length - 1]);
  }
  
  return result;
}

/**
 * Merge collinear segments across all polylines
 * @param {Array<[number, number][]>} polylines - Array of polylines
 * @param {Object} options - Options
 * @param {number} options.angleTolerance - Angle tolerance in radians (default: 0.01)
 * @param {number} options.distanceTolerance - Distance tolerance (default: 1.0)
 * @returns {Array<[number, number][]>} Polylines with collinear segments merged
 */
export function mergeCollinearSegments(polylines, options = {}) {
  if (!Array.isArray(polylines) || polylines.length === 0) {
    return polylines;
  }
  
  const {
    angleTolerance = 0.01, // ~0.57 degrees
    distanceTolerance = 1.0
  } = options;
  
  return polylines.map(polyline => 
    mergeCollinearSegmentsInPolyline(polyline, angleTolerance, distanceTolerance)
  );
}

/**
 * Calculate the bounding box of a polyline
 * @param {[number, number][]} polyline - Input polyline
 * @returns {{minX: number, minY: number, maxX: number, maxY: number}} Bounding box
 */
function getPolylineBounds(polyline) {
  if (!Array.isArray(polyline) || polyline.length === 0) {
    return { minX: 0, minY: 0, maxX: 0, maxY: 0 };
  }
  
  let minX = polyline[0][0];
  let minY = polyline[0][1];
  let maxX = polyline[0][0];
  let maxY = polyline[0][1];
  
  for (const point of polyline) {
    minX = Math.min(minX, point[0]);
    minY = Math.min(minY, point[1]);
    maxX = Math.max(maxX, point[0]);
    maxY = Math.max(maxY, point[1]);
  }
  
  return { minX, minY, maxX, maxY };
}

/**
 * Calculate the area of overlap between two bounding boxes
 * @param {Object} bbox1 - First bounding box
 * @param {Object} bbox2 - Second bounding box
 * @returns {number} Overlap area (0 if no overlap)
 */
function bboxOverlapArea(bbox1, bbox2) {
  const overlapX = Math.max(0, Math.min(bbox1.maxX, bbox2.maxX) - Math.max(bbox1.minX, bbox2.minX));
  const overlapY = Math.max(0, Math.min(bbox1.maxY, bbox2.maxY) - Math.max(bbox1.minY, bbox2.minY));
  return overlapX * overlapY;
}

/**
 * Check if two polylines are near-duplicates
 * Compares path similarity based on points and bounding box overlap
 * @param {[number, number][]} polyline1 - First polyline
 * @param {[number, number][]} polyline2 - Second polyline
 * @param {number} pointTolerance - Distance tolerance for point matching (default: 3.0)
 * @param {number} overlapRatio - Minimum overlap ratio to consider duplicates (default: 0.8)
 * @returns {boolean} True if polylines are near-duplicates
 */
function areNearDuplicates(polyline1, polyline2, pointTolerance = 3.0, overlapRatio = 0.8) {
  if (!Array.isArray(polyline1) || !Array.isArray(polyline2)) {
    return false;
  }
  
  // Quick bounding box check
  const bbox1 = getPolylineBounds(polyline1);
  const bbox2 = getPolylineBounds(polyline2);
  
  const area1 = (bbox1.maxX - bbox1.minX) * (bbox1.maxY - bbox1.minY);
  const area2 = (bbox2.maxX - bbox2.minX) * (bbox2.maxY - bbox2.minY);
  const overlapArea = bboxOverlapArea(bbox1, bbox2);
  
  // If bounding boxes don't overlap enough, not duplicates
  const minArea = Math.min(area1, area2);
  if (minArea === 0 || overlapArea / minArea < overlapRatio) {
    return false;
  }
  
  // Check if points are similar
  // Sample points from both polylines and check distances
  const sampleSize = Math.min(polyline1.length, polyline2.length, 10);
  const step1 = Math.max(1, Math.floor(polyline1.length / sampleSize));
  const step2 = Math.max(1, Math.floor(polyline2.length / sampleSize));
  
  let matchingPoints = 0;
  let totalComparisons = 0;
  
  for (let i = 0; i < polyline1.length; i += step1) {
    const point1 = polyline1[i];
    let minDist = Infinity;
    
    // Find closest point in polyline2
    for (let j = 0; j < polyline2.length; j += step2) {
      const point2 = polyline2[j];
      const dist = distance(point1, point2);
      minDist = Math.min(minDist, dist);
    }
    
    if (minDist <= pointTolerance) {
      matchingPoints++;
    }
    totalComparisons++;
  }
  
  // Also check reverse direction (polyline2 points to polyline1)
  for (let i = 0; i < polyline2.length; i += step2) {
    const point2 = polyline2[i];
    let minDist = Infinity;
    
    for (let j = 0; j < polyline1.length; j += step1) {
      const point1 = polyline1[j];
      const dist = distance(point2, point1);
      minDist = Math.min(minDist, dist);
    }
    
    if (minDist <= pointTolerance) {
      matchingPoints++;
    }
    totalComparisons++;
  }
  
  // If more than 70% of sampled points match, consider them duplicates
  return totalComparisons > 0 && matchingPoints / totalComparisons >= 0.7;
}

/**
 * Remove near-duplicate overlapping paths
 * Keeps the longest polyline when duplicates are found
 * @param {Array<[number, number][]>} polylines - Array of polylines
 * @param {Object} options - Options
 * @param {number} options.pointTolerance - Distance tolerance for point matching (default: 3.0)
 * @param {number} options.overlapRatio - Minimum overlap ratio (default: 0.8)
 * @returns {Array<[number, number][]>} Polylines with duplicates removed
 */
export function removeNearDuplicates(polylines, options = {}) {
  if (!Array.isArray(polylines) || polylines.length <= 1) {
    return polylines;
  }
  
  const {
    pointTolerance = 3.0,
    overlapRatio = 0.8
  } = options;
  
  const kept = [];
  const removed = new Set();
  
  for (let i = 0; i < polylines.length; i++) {
    if (removed.has(i)) continue;
    
    const current = polylines[i];
    const currentLength = current.reduce((sum, point, idx) => {
      if (idx === 0) return sum;
      return sum + lineLength(current[idx - 1], point);
    }, 0);
    
    let isDuplicate = false;
    
    // Check against already kept polylines
    for (const keptPolyline of kept) {
      if (areNearDuplicates(current, keptPolyline, pointTolerance, overlapRatio)) {
        // Keep the longer one
        const keptLength = keptPolyline.reduce((sum, point, idx) => {
          if (idx === 0) return sum;
          return sum + lineLength(keptPolyline[idx - 1], point);
        }, 0);
        
        if (currentLength > keptLength) {
          // Replace kept with current
          const index = kept.indexOf(keptPolyline);
          kept[index] = current;
        }
        
        isDuplicate = true;
        removed.add(i);
        break;
      }
    }
    
    // Check against remaining polylines
    if (!isDuplicate) {
      for (let j = i + 1; j < polylines.length; j++) {
        if (removed.has(j)) continue;
        
        const other = polylines[j];
        if (areNearDuplicates(current, other, pointTolerance, overlapRatio)) {
          const otherLength = other.reduce((sum, point, idx) => {
            if (idx === 0) return sum;
            return sum + lineLength(other[idx - 1], point);
          }, 0);
          
          if (currentLength >= otherLength) {
            removed.add(j);
          } else {
            removed.add(i);
            isDuplicate = true;
            break;
          }
        }
      }
    }
    
    if (!isDuplicate) {
      kept.push(current);
    }
  }
  
  return kept;
}

/**
 * Complete polyline cleanup pipeline
 * Applies all cleanup steps in sequence:
 * 1. Remove short polylines (< minPoints)
 * 2. Douglas-Peucker simplification
 * 3. Merge collinear segments
 * 4. Remove near-duplicate paths
 * 
 * @param {Array<[number, number][]>} polylines - Array of polylines to clean
 * @param {Object} options - Cleanup options
 * @param {number} options.minPoints - Minimum points per polyline (default: 5)
 * @param {number} options.douglasPeuckerTolerance - Douglas-Peucker tolerance in pixels (default: 2.0)
 * @param {number} options.angleTolerance - Collinear angle tolerance in radians (default: 0.01)
 * @param {number} options.distanceTolerance - Collinear distance tolerance (default: 1.0)
 * @param {number} options.duplicatePointTolerance - Duplicate detection point tolerance (default: 3.0)
 * @param {number} options.duplicateOverlapRatio - Duplicate detection overlap ratio (default: 0.8)
 * @returns {Array<[number, number][]>} Cleaned polylines
 */
export function cleanupPolylines(polylines, options = {}) {
  if (!Array.isArray(polylines) || polylines.length === 0) {
    return polylines;
  }
  
  const initialCount = polylines.length;
  
  // Auto-adjust parameters based on polyline count
  // Higher counts need more aggressive cleanup
  let {
    minPoints = 5,
    douglasPeuckerTolerance = 2.0,
    angleTolerance = 0.01,
    distanceTolerance = 1.0,
    duplicatePointTolerance = 3.0,
    duplicateOverlapRatio = 0.8
  } = options;
  
  // Aggressive mode for high polyline counts
  if (initialCount > 200) {
    console.log(`🧹 Cleanup: High polyline count (${initialCount}), applying aggressive cleanup...`);
    minPoints = Math.max(minPoints, 8); // Remove shorter polylines
    douglasPeuckerTolerance = Math.max(douglasPeuckerTolerance, 4.0); // More aggressive simplification
    duplicatePointTolerance = Math.max(duplicatePointTolerance, 5.0); // Merge more duplicates
    duplicateOverlapRatio = Math.min(duplicateOverlapRatio, 0.7); // Lower threshold for duplicate detection
  }
  
  // Very aggressive mode for extremely high counts
  if (initialCount > 500) {
    console.log(`🧹 Cleanup: Very high polyline count (${initialCount}), applying very aggressive cleanup...`);
    minPoints = Math.max(minPoints, 10);
    douglasPeuckerTolerance = Math.max(douglasPeuckerTolerance, 6.0);
    duplicatePointTolerance = Math.max(duplicatePointTolerance, 8.0);
    duplicateOverlapRatio = Math.min(duplicateOverlapRatio, 0.6);
  }
  
  let result = polylines;
  
  // Step 1: Remove polylines with too few points
  result = removeShortPolylines(result, minPoints);
  
  // Step 2: Apply Douglas-Peucker simplification
  if (douglasPeuckerTolerance > 0) {
    result = douglasPeucker(result, douglasPeuckerTolerance);
  }
  
  // Step 3: Merge collinear segments
  result = mergeCollinearSegments(result, {
    angleTolerance,
    distanceTolerance
  });
  
  // Step 4: Remove near-duplicate paths
  result = removeNearDuplicates(result, {
    pointTolerance: duplicatePointTolerance,
    overlapRatio: duplicateOverlapRatio
  });
  
  const finalCount = result.length;
  const reduction = initialCount - finalCount;
  const reductionPercent = initialCount > 0 ? ((reduction / initialCount) * 100).toFixed(1) : 0;
  
  if (initialCount > 200 || reduction > 100) {
    console.log(`🧹 Cleanup: Reduced from ${initialCount} to ${finalCount} polylines (${reductionPercent}% reduction)`);
  }
  
  return result;
}

