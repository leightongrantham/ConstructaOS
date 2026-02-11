/**
 * Parallel line merging
 * Merges parallel lines that are within tolerance
 * Uses median distance calculation for merging
 * All functions are pure and deterministic
 */

import { isParallel, lineAngle, distance, projectPoint, lineLength, midpoint } from '../utils/geom.js';

/**
 * Calculate the distance between two parallel line segments
 * Returns the perpendicular distance from midpoint of one line to the other
 * @param {{start: [number, number], end: [number, number]}} line1 - First line
 * @param {{start: [number, number], end: [number, number]}} line2 - Second line
 * @returns {number} Distance between lines
 */
function distanceBetweenParallelLines(line1, line2) {
  // Validate inputs
  if (!line1 || !line2 || !line1.start || !line1.end || !line2.start || !line2.end) {
    throw new Error('Invalid line parameters');
  }
  
  const mid1 = midpoint(line1.start, line1.end);
  const projected = projectPoint(mid1, line2.start, line2.end);
  const dist = distance(mid1, projected);
  
  // Validate result
  if (!Number.isFinite(dist) || dist < 0) {
    throw new Error(`Invalid distance calculated: ${dist}`);
  }
  
  return dist;
}

/**
 * Calculate median value from array
 * @param {number[]} values - Array of numbers
 * @returns {number} Median value
 */
function median(values) {
  if (values.length === 0) return 0;
  if (values.length === 1) return values[0];
  
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  
  if (sorted.length % 2 === 0) {
    return (sorted[mid - 1] + sorted[mid]) / 2;
  } else {
    return sorted[mid];
  }
}

/**
 * Calculate the median distance of a line from a set of parallel lines
 * Used to determine where to place the merged line
 * @param {{start: [number, number], end: [number, number]}} line - Reference line
 * @param {Array<{start: [number, number], end: [number, number]}>} parallelLines - Parallel lines
 * @returns {number} Median distance
 */
function medianDistanceFromLine(line, parallelLines) {
  const distances = parallelLines.map(otherLine => 
    distanceBetweenParallelLines(line, otherLine)
  );
  
  return median(distances);
}

/**
 * Extend a line segment to cover all parallel lines in a group
 * Projects all endpoints onto the line direction and finds min/max
 * @param {{start: [number, number], end: [number, number]}} referenceLine - Reference line
 * @param {Array<{start: [number, number], end: [number, number]}>} parallelLines - Parallel lines to merge
 * @returns {{start: [number, number], end: [number, number]}} Extended line
 */
function extendLineToCoverParallelLines(referenceLine, parallelLines) {
  const angle = lineAngle(referenceLine.start, referenceLine.end);
  const cosAngle = Math.cos(angle);
  const sinAngle = Math.sin(angle);
  
  // Collect all points from parallel lines
  const allPoints = [
    referenceLine.start,
    referenceLine.end,
    ...parallelLines.flatMap(line => [line.start, line.end])
  ];
  
  // Project all points onto the line direction (parameterize along the line)
  const projections = allPoints.map(point => {
    const dx = point[0] - referenceLine.start[0];
    const dy = point[1] - referenceLine.start[1];
    // Project onto line direction
    const t = dx * cosAngle + dy * sinAngle;
    return t;
  });
  
  const minT = Math.min(...projections);
  const maxT = Math.max(...projections);
  
  // Calculate extended endpoints
  const extendedStart = [
    referenceLine.start[0] + minT * cosAngle,
    referenceLine.start[1] + minT * sinAngle
  ];
  
  const extendedEnd = [
    referenceLine.start[0] + maxT * cosAngle,
    referenceLine.start[1] + maxT * sinAngle
  ];
  
  return {
    start: extendedStart,
    end: extendedEnd
  };
}

/**
 * Calculate the median position for merged line
 * Uses median distance from all parallel lines to determine offset
 * @param {Array<{start: [number, number], end: [number, number]}>} lines - Parallel lines to merge
 * @returns {{start: [number, number], end: [number, number]}} Merged line
 */
function calculateMedianMergedLine(lines) {
  if (lines.length === 0) {
    throw new Error('Cannot merge empty array of lines');
  }
  
  if (lines.length === 1) {
    return lines[0];
  }
  
  // Use the longest line as reference
  const referenceLine = lines.reduce((longest, line) => {
    const currentLength = lineLength(line.start, line.end);
    const longestLength = lineLength(longest.start, longest.end);
    return currentLength > longestLength ? line : longest;
  });
  
  // Get other parallel lines
  const otherLines = lines.filter(line => 
    line !== referenceLine &&
    (line.start[0] !== referenceLine.start[0] || line.start[1] !== referenceLine.start[1] ||
     line.end[0] !== referenceLine.end[0] || line.end[1] !== referenceLine.end[1])
  );
  
  // Extend reference line to cover all lines
  const extended = extendLineToCoverParallelLines(referenceLine, otherLines);
  
  // Calculate median offset from reference
  if (otherLines.length > 0) {
    const offsets = otherLines.map(line => {
      const mid = midpoint(line.start, line.end);
      const projected = projectPoint(mid, extended.start, extended.end);
      const perpDistance = distance(mid, projected);
      
      // Determine which side of the line
      const angle = lineAngle(extended.start, extended.end);
      const perpAngle = angle + Math.PI / 2;
      const dx = mid[0] - projected[0];
      const dy = mid[1] - projected[1];
      const side = Math.cos(perpAngle) * dx + Math.sin(perpAngle) * dy;
      
      return side > 0 ? perpDistance : -perpDistance;
    });
    
    const medianOffset = median(offsets);
    
    // Apply median offset perpendicular to line
    const perpAngle = lineAngle(extended.start, extended.end) + Math.PI / 2;
    const offsetX = medianOffset * Math.cos(perpAngle);
    const offsetY = medianOffset * Math.sin(perpAngle);
    
    return {
      start: [
        extended.start[0] + offsetX,
        extended.start[1] + offsetY
      ],
      end: [
        extended.end[0] + offsetX,
        extended.end[1] + offsetY
      ]
    };
  }
  
  return extended;
}

/**
 * Group lines by parallel direction
 * Groups lines that are parallel within tolerance
 * @param {Array<{start: [number, number], end: [number, number]}>} lines - Lines to group
 * @param {number} angleTolerance - Angle tolerance in radians (default: 0.05 rad ≈ 2.9°)
 * @returns {Array<Array<{start: [number, number], end: [number, number]}>>} Groups of parallel lines
 */
function groupParallelLines(lines, angleTolerance = 0.05) {
  const groups = [];
  const used = new Set();
  
  for (let i = 0; i < lines.length; i++) {
    if (used.has(i)) continue;
    
    const group = [lines[i]];
    used.add(i);
    
    const angle1 = lineAngle(lines[i].start, lines[i].end);
    
    for (let j = i + 1; j < lines.length; j++) {
      if (used.has(j)) continue;
      
      const angle2 = lineAngle(lines[j].start, lines[j].end);
      const angleDiff = Math.abs(normalizeAngleDiff(angle1 - angle2));
      const isParallelOrOpposite = angleDiff < angleTolerance || 
                                    Math.abs(angleDiff - Math.PI) < angleTolerance;
      
      if (isParallelOrOpposite) {
        group.push(lines[j]);
        used.add(j);
      }
    }
    
    if (group.length > 0) {
      groups.push(group);
    }
  }
  
  return groups;
}

/**
 * Normalize angle difference to [0, π]
 * @param {number} diff - Angle difference in radians
 * @returns {number} Normalized difference
 */
function normalizeAngleDiff(diff) {
  let normalized = diff;
  while (normalized > Math.PI) normalized -= Math.PI;
  while (normalized < 0) normalized += Math.PI;
  return normalized;
}

/**
 * Merge parallel lines that are within distance tolerance
 * Uses median distance for merging
 * @param {Array<{start: [number, number], end: [number, number]}>} lines - Lines to merge
 * @param {Object} options - Merge options
 * @param {number} options.angleTolerance - Angle tolerance for parallel detection (default: 0.05 rad ≈ 2.9°)
 * @param {number} options.distanceTolerance - Maximum distance between parallel lines to merge (default: 5.0)
 * @returns {Array<{start: [number, number], end: [number, number]}>} Merged lines
 */
export function mergeParallel(lines, options = {}) {
  const {
    angleTolerance = 0.05,
    distanceTolerance = 5.0
  } = options;
  
  if (!Array.isArray(lines) || lines.length === 0) {
    return lines;
  }
  
  // Filter out invalid lines (zero-length or invalid points)
  const validLines = lines.filter(line => {
    if (!line || !line.start || !line.end) return false;
    const [x1, y1] = Array.isArray(line.start) ? line.start : [line.start.x, line.start.y];
    const [x2, y2] = Array.isArray(line.end) ? line.end : [line.end.x, line.end.y];
    
    // Check for valid numbers
    if (!Number.isFinite(x1) || !Number.isFinite(y1) || 
        !Number.isFinite(x2) || !Number.isFinite(y2)) {
      return false;
    }
    
    // Check for non-zero length
    const dx = x2 - x1;
    const dy = y2 - y1;
    const length = Math.sqrt(dx * dx + dy * dy);
    return length > 0.001; // Minimum length threshold
  });
  
  if (validLines.length === 0) {
    return [];
  }
  
  // Group lines by parallel direction
  const parallelGroups = groupParallelLines(validLines, angleTolerance);
  
  const merged = [];
  
  for (const group of parallelGroups) {
    if (group.length === 1) {
      // Single line, no merging needed
      merged.push(group[0]);
    } else if (group.length > 1000) {
      // Safety check: if group is too large, don't try to merge (would be too expensive)
      // Just keep all lines separate
      console.warn(`Parallel group too large (${group.length} lines), skipping merge`);
      merged.push(...group);
    } else {
      // Check if lines are within distance tolerance
      const distances = [];
      const maxComparisons = 10000; // Safety limit
      let comparisonCount = 0;
      
      for (let i = 0; i < group.length && comparisonCount < maxComparisons; i++) {
        for (let j = i + 1; j < group.length && comparisonCount < maxComparisons; j++) {
          comparisonCount++;
          try {
            const dist = distanceBetweenParallelLines(group[i], group[j]);
            // Only add valid distances
            if (Number.isFinite(dist) && dist >= 0 && dist < 1e10) {
              distances.push(dist);
            }
          } catch (err) {
            // Skip invalid distance calculations
            console.warn('Error calculating distance between parallel lines:', err);
            continue;
          }
        }
      }
      
      const maxDistance = distances.length > 0 ? Math.max(...distances) : 0;
      
      if (maxDistance <= distanceTolerance) {
        // Merge lines using median distance
        const mergedLine = calculateMedianMergedLine(group);
        merged.push(mergedLine);
      } else {
        // Lines too far apart, keep separate
        merged.push(...group);
      }
    }
  }
  
  return merged;
}

/**
 * Detect parallel lines without merging
 * @param {Array<{start: [number, number], end: [number, number]}>} lines - Lines to check
 * @param {number} angleTolerance - Angle tolerance in radians (default: 0.05)
 * @returns {Array<Array<number>>} Array of index pairs representing parallel lines
 */
export function detectParallel(lines, angleTolerance = 0.05) {
  if (!Array.isArray(lines) || lines.length < 2) {
    return [];
  }
  
  const parallelPairs = [];
  
  for (let i = 0; i < lines.length; i++) {
    for (let j = i + 1; j < lines.length; j++) {
      if (isParallel(
        lines[i].start, lines[i].end,
        lines[j].start, lines[j].end,
        angleTolerance
      )) {
        parallelPairs.push([i, j]);
      }
    }
  }
  
  return parallelPairs;
}

/**
 * Simplified wrapper: Merge parallel lines within distance
 * @param {Array<{start: [number, number], end: [number, number]}>} lines - Lines to merge
 * @param {number} distance - Maximum distance between parallel lines to merge (default: 10)
 * @returns {Array<{start: [number, number], end: [number, number]}>} Merged lines
 */
export function mergeParallelSimple(lines, distance = 10) {
  return mergeParallel(lines, {
    angleTolerance: 0.05, // ~2.9 degrees
    distanceTolerance: distance
  });
}