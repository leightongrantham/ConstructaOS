/**
 * Non-AI Geometry Cleanup
 * Removes noise, snaps lines, merges colinear segments, bridges gaps, and detects rooms
 * All functions are pure and deterministic
 */

import { distance, lineLength, lineAngle, normalizeAngle } from '../utils/geom.js';
import { snapOrthogonal } from './snap-orthogonal.js';
import { mergeParallel } from './merge-parallel.js';

/**
 * Remove very small polygons (noise)
 * Filters out polygons below minimum area threshold
 * @param {Array<Array<[number, number]>>} polygons - Array of polygons (each is array of points)
 * @param {Object} options - Filter options
 * @param {number} options.minArea - Minimum polygon area to keep (default: 50)
 * @returns {Array<Array<[number, number]>>} Filtered polygons
 */
export function removeSmallPolygons(polygons, options = {}) {
  const { minArea = 50 } = options;
  
  if (!Array.isArray(polygons)) {
    return [];
  }
  
  return polygons.filter(polygon => {
    if (!Array.isArray(polygon) || polygon.length < 3) {
      return false; // Not a valid polygon
    }
    
    // Calculate polygon area using shoelace formula
    const area = calculatePolygonArea(polygon);
    return area >= minArea;
  });
}

/**
 * Calculate polygon area using shoelace formula
 * @param {Array<[number, number]>} polygon - Polygon points
 * @returns {number} Signed area (positive for counter-clockwise, negative for clockwise)
 */
function calculatePolygonArea(polygon) {
  if (!Array.isArray(polygon) || polygon.length < 3) {
    return 0;
  }
  
  let area = 0;
  for (let i = 0; i < polygon.length; i++) {
    const j = (i + 1) % polygon.length;
    area += polygon[i][0] * polygon[j][1];
    area -= polygon[j][0] * polygon[i][1];
  }
  
  return Math.abs(area / 2); // Return absolute area
}

/**
 * Snap nearly-straight lines to 0°, 90°, 45° (if used)
 * Enhanced version of snap-orthogonal that also supports 45° snapping
 * @param {Array<{start: [number, number], end: [number, number]}>} lines - Lines to snap
 * @param {Object} options - Snapping options
 * @param {number} options.toleranceDeg - Angle tolerance in degrees (default: 5)
 * @param {boolean} options.use45Deg - Enable 45° snapping (default: false)
 * @returns {Array<{start: [number, number], end: [number, number]}>} Snapped lines
 */
export function snapLines(lines, options = {}) {
  const {
    toleranceDeg = 5,
    use45Deg = false
  } = options;
  
  if (!Array.isArray(lines) || lines.length === 0) {
    return lines;
  }
  
  // First use standard orthogonal snapping (0°, 90°, 180°, 270°)
  let snapped = snapOrthogonal(lines, toleranceDeg);
  
  // If 45° snapping is enabled, also snap to 45° increments
  if (use45Deg) {
    snapped = snapTo45Degrees(snapped, toleranceDeg);
  }
  
  return snapped;
}

/**
 * Snap lines to 45° increments (45°, 135°, 225°, 315°)
 * @param {Array<{start: [number, number], end: [number, number]}>} lines - Lines to snap
 * @param {number} toleranceDeg - Angle tolerance in degrees
 * @returns {Array<{start: [number, number], end: [number, number]}>} Snapped lines
 */
function snapTo45Degrees(lines, toleranceDeg) {
  const tolerance = (toleranceDeg * Math.PI) / 180;
  
  return lines.map(line => {
    if (!line || !Array.isArray(line.start) || !Array.isArray(line.end)) {
      return line;
    }
    
    const angle = lineAngle(line.start, line.end);
    const normalized = normalizeAngle(angle);
    
    // Check each 45° increment
    const angles45 = [
      Math.PI / 4,      // 45°
      (3 * Math.PI) / 4, // 135°
      (5 * Math.PI) / 4, // 225°
      (7 * Math.PI) / 4  // 315°
    ];
    
    for (const targetAngle of angles45) {
      const diff = Math.min(
        Math.abs(normalized - targetAngle),
        Math.abs(normalized - (targetAngle + 2 * Math.PI)),
        Math.abs(normalized - (targetAngle - 2 * Math.PI))
      );
      
      // Normalize difference to [0, PI]
      const normalizedDiff = Math.min(diff, 2 * Math.PI - diff);
      
      if (normalizedDiff <= tolerance) {
        // Snap to this 45° angle
        const length = lineLength(line.start, line.end);
        const newEnd = [
          line.start[0] + length * Math.cos(targetAngle),
          line.start[1] + length * Math.sin(targetAngle)
        ];
        
        return {
          start: [line.start[0], line.start[1]],
          end: newEnd
        };
      }
    }
    
    // Not close to any 45° angle, return as-is
    return line;
  });
}

/**
 * Merge colinear line segments
 * Connects segments that are on the same line
 * @param {Array<{start: [number, number], end: [number, number]}>} lines - Lines to merge
 * @param {Object} options - Merge options
 * @param {number} options.distance - Maximum distance for colinear merge (default: 10)
 * @param {number} options.angleTolerance - Angle tolerance for colinear check in radians (default: 0.01)
 * @returns {Array<{start: [number, number], end: [number, number]}>} Merged lines
 */
export function mergeColinearSegments(lines, options = {}) {
  const {
    distance: maxDistance = 10,
    angleTolerance = 0.01
  } = options;
  
  if (!Array.isArray(lines) || lines.length < 2) {
    return lines;
  }
  
  // Group lines by similar angle (colinear lines)
  const groups = groupColinearLines(lines, angleTolerance);
  
  const merged = [];
  
  for (const group of groups) {
    if (group.length === 1) {
      merged.push(group[0]);
      continue;
    }
    
    // Sort endpoints along the line direction
    const sorted = sortColinearSegments(group);
    
    // Merge consecutive segments that are close
    let currentSegment = sorted[0];
    
    for (let i = 1; i < sorted.length; i++) {
      const segment = sorted[i];
      const gap = calculateGap(currentSegment.end, segment.start);
      
      if (gap <= maxDistance) {
        // Merge: extend current segment to include this one
        currentSegment = {
          start: currentSegment.start,
          end: segment.end
        };
      } else {
        // Gap too large, start new segment
        merged.push(currentSegment);
        currentSegment = segment;
      }
    }
    
    merged.push(currentSegment);
  }
  
  return merged;
}

/**
 * Group lines by similar angle (colinear)
 * @param {Array<{start: [number, number], end: [number, number]}>} lines - Lines to group
 * @param {number} angleTolerance - Angle tolerance in radians
 * @returns {Array<Array<{start: [number, number], end: [number, number]}>>} Groups of colinear lines
 */
function groupColinearLines(lines, angleTolerance) {
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
      const diff = Math.abs(normalizeAngleDiff(angle1 - angle2));
      
      // Check if parallel (same direction or opposite)
      if (diff < angleTolerance || Math.abs(diff - Math.PI) < angleTolerance) {
        group.push(lines[j]);
        used.add(j);
      }
    }
    
    groups.push(group);
  }
  
  return groups;
}

/**
 * Normalize angle difference to [0, π]
 * @param {number} diff - Angle difference
 * @returns {number} Normalized difference
 */
function normalizeAngleDiff(diff) {
  let normalized = diff;
  while (normalized > Math.PI) normalized -= Math.PI;
  while (normalized < 0) normalized += Math.PI;
  return normalized;
}

/**
 * Sort colinear segments along their common direction
 * @param {Array<{start: [number, number], end: [number, number]}>} segments - Segments to sort
 * @returns {Array<{start: [number, number], end: [number, number]}>} Sorted segments
 */
function sortColinearSegments(segments) {
  if (segments.length === 0) return [];
  
  const refAngle = lineAngle(segments[0].start, segments[0].end);
  const cosAngle = Math.cos(refAngle);
  const sinAngle = Math.sin(refAngle);
  
  // Project segment midpoints onto reference direction
  const withProjection = segments.map(segment => {
    const midX = (segment.start[0] + segment.end[0]) / 2;
    const midY = (segment.start[1] + segment.end[1]) / 2;
    const projection = midX * cosAngle + midY * sinAngle;
    
    return { segment, projection };
  });
  
  // Sort by projection
  withProjection.sort((a, b) => a.projection - b.projection);
  
  return withProjection.map(item => item.segment);
}

/**
 * Calculate distance between two points
 * @param {[number, number]} p1 - First point
 * @param {[number, number]} p2 - Second point
 * @returns {number} Distance
 */
function calculateGap(p1, p2) {
  return distance(p1, p2);
}

/**
 * Bridge small gaps between endpoints
 * Connects line segments that have endpoints close together but not touching
 * @param {Array<{start: [number, number], end: [number, number]}>} lines - Lines to bridge
 * @param {Object} options - Bridging options
 * @param {number} options.maxGap - Maximum gap size to bridge (default: 5)
 * @returns {Array<{start: [number, number], end: [number, number]}>} Lines with gaps bridged
 */
export function bridgeGaps(lines, options = {}) {
  const { maxGap = 5 } = options;
  
  if (!Array.isArray(lines) || lines.length < 2) {
    return lines;
  }
  
  // Build endpoint index for fast lookup
  const endpointMap = new Map();
  lines.forEach((line, index) => {
    const key1 = `${Math.round(line.start[0])},${Math.round(line.start[1])}`;
    const key2 = `${Math.round(line.end[0])},${Math.round(line.end[1])}`;
    
    if (!endpointMap.has(key1)) endpointMap.set(key1, []);
    if (!endpointMap.has(key2)) endpointMap.set(key2, []);
    
    endpointMap.get(key1).push({ lineIndex: index, isStart: true, point: line.start });
    endpointMap.get(key2).push({ lineIndex: index, isStart: false, point: line.end });
  });
  
  // Find pairs of endpoints that are close
  const merged = new Set();
  const result = [...lines];
  
  for (let i = 0; i < result.length; i++) {
    if (merged.has(i)) continue;
    
    const line1 = result[i];
    const endpoints1 = [line1.start, line1.end];
    
    for (const endpoint1 of endpoints1) {
      // Check nearby points (within maxGap)
      for (const [key, matches] of endpointMap.entries()) {
        const [x, y] = key.split(',').map(Number);
        const gap = distance(endpoint1, [x, y]);
        
        if (gap > 0 && gap <= maxGap) {
          // Found a close endpoint, try to merge
          for (const match of matches) {
            if (match.lineIndex === i || merged.has(match.lineIndex)) continue;
            
            const line2 = result[match.lineIndex];
            
            // Check if lines should be connected (similar angle)
            const angle1 = lineAngle(line1.start, line1.end);
            const angle2 = lineAngle(line2.start, line2.end);
            const angleDiff = Math.abs(normalizeAngleDiff(angle1 - angle2));
            
            // Only bridge if angles are similar (within tolerance)
            if (angleDiff < 0.1 || Math.abs(angleDiff - Math.PI) < 0.1) {
              // Merge lines by extending one to connect to the other
              const connected = connectLines(line1, line2, endpoint1, match.point);
              
              if (connected) {
                result[i] = connected;
                merged.add(match.lineIndex);
                break;
              }
            }
          }
        }
      }
    }
  }
  
  // Remove merged lines
  return result.filter((_, index) => !merged.has(index));
}

/**
 * Connect two lines by bridging gap between endpoints
 * @param {{start: [number, number], end: [number, number]}} line1 - First line
 * @param {{start: [number, number], end: [number, number]}} line2 - Second line
 * @param {[number, number]} endpoint1 - Endpoint from line1
 * @param {[number, number]} endpoint2 - Endpoint from line2
 * @returns {{start: [number, number], end: [number, number]}|null} Connected line or null
 */
function connectLines(line1, line2, endpoint1, endpoint2) {
  // Determine which endpoints to connect
  const line1Start = distance(endpoint1, line1.start) < 0.1;
  const line2Start = distance(endpoint2, line2.start) < 0.1;
  
  // Create merged line
  if (line1Start && line2Start) {
    // Connect line1.start to line2.start, extend to line1.end and line2.end
    return {
      start: line2.end,
      end: line1.end
    };
  } else if (line1Start && !line2Start) {
    // Connect line1.start to line2.end
    return {
      start: line2.start,
      end: line1.end
    };
  } else if (!line1Start && line2Start) {
    // Connect line1.end to line2.start
    return {
      start: line1.start,
      end: line2.end
    };
  } else {
    // Connect line1.end to line2.end
    return {
      start: line1.start,
      end: line2.start
    };
  }
}

/**
 * Detect closed polygons → rooms
 * Finds polygons from line segments and identifies rooms
 * Simplified approach: look for closed polylines in original input
 * @param {Array<{start: [number, number], end: [number, number]}>} lines - Lines to analyze
 * @param {Object} options - Detection options
 * @param {number} options.minArea - Minimum room area (default: 100)
 * @param {number} options.maxGap - Maximum gap to consider polygon closed (default: 5)
 * @returns {Array<Array<[number, number]>>} Array of room polygons (each is array of points)
 */
export function detectRooms(lines, options = {}) {
  const {
    minArea = 100,
    maxGap = 5
  } = options;
  
  if (!Array.isArray(lines) || lines.length < 3) {
    return [];
  }
  
  // For now, detect rooms from connected line segments that form closed loops
  // Build polygons by following connected lines
  const rooms = findClosedPolygons(lines, maxGap);
  
  // Filter by minimum area
  const filteredRooms = rooms
    .filter(room => {
      const area = calculatePolygonArea(room);
      return area >= minArea;
    });
  
  return filteredRooms;
}

/**
 * Find closed polygons from line segments
 * Simple approach: find sequences of connected lines that form closed loops
 * @param {Array<{start: [number, number], end: [number, number]}>} lines - Lines to analyze
 * @param {number} maxGap - Maximum gap to consider connected
 * @returns {Array<Array<[number, number]>>} Array of closed polygons
 */
function findClosedPolygons(lines, maxGap) {
  const polygons = [];
  const used = new Set();
  
  // Try to build polygons by following connected lines
  for (let i = 0; i < lines.length; i++) {
    if (used.has(i)) continue;
    
    // Try to build a polygon starting from this line
    const polygon = tryBuildPolygon(lines, i, maxGap, used);
    
    if (polygon && polygon.length >= 3) {
      // Check if polygon is closed (start point ≈ end point)
      const first = polygon[0];
      const last = polygon[polygon.length - 1];
      const gap = distance(first, last);
      
      if (gap <= maxGap) {
        // Close the polygon
        polygon.push([first[0], first[1]]);
        polygons.push(polygon);
      }
    }
  }
  
  return polygons;
}

/**
 * Try to build a polygon starting from a line
 * Follows connected lines to form a closed loop
 * @param {Array<{start: [number, number], end: [number, number]}>} lines - All lines
 * @param {number} startIndex - Index of starting line
 * @param {number} maxGap - Maximum gap for connection
 * @param {Set<number>} used - Set of used line indices
 * @returns {Array<[number, number]}|null} Polygon points or null
 */
function tryBuildPolygon(lines, startIndex, maxGap, used) {
  const polygon = [];
  const visited = new Set();
  
  let currentLine = lines[startIndex];
  let currentPoint = currentLine.start;
  polygon.push([currentPoint[0], currentPoint[1]]);
  visited.add(startIndex);
  
  // Try to follow connected lines
  let iterations = 0;
  const maxIterations = lines.length; // Prevent infinite loops
  
  while (iterations < maxIterations) {
    iterations++;
    
    // Find next line that connects to current endpoint
    let nextLineIndex = -1;
    let nextPoint = null;
    let isReversed = false;
    
    for (let i = 0; i < lines.length; i++) {
      if (visited.has(i)) continue;
      
      const line = lines[i];
      const gapToStart = distance(currentPoint, line.start);
      const gapToEnd = distance(currentPoint, line.end);
      
      if (gapToStart <= maxGap && gapToStart < gapToEnd) {
        nextLineIndex = i;
        nextPoint = line.end;
        isReversed = false;
        break;
      } else if (gapToEnd <= maxGap) {
        nextLineIndex = i;
        nextPoint = line.start;
        isReversed = true;
        break;
      }
    }
    
    if (nextLineIndex === -1) {
      // No connected line found
      break;
    }
    
    // Add endpoint to polygon
    polygon.push([nextPoint[0], nextPoint[1]]);
    visited.add(nextLineIndex);
    currentPoint = nextPoint;
    
    // Check if we've closed the loop (reached start)
    const firstPoint = polygon[0];
    if (distance(currentPoint, firstPoint) <= maxGap && polygon.length >= 3) {
      // Closed polygon found
      used.add(startIndex);
      visited.forEach(idx => used.add(idx));
      return polygon;
    }
  }
  
  // Didn't close the loop
  return null;
}

/**
 * Main cleanup function
 * Applies all cleanup steps: remove noise, snap, merge, bridge, detect rooms
 * @param {Array<{start: [number, number], end: [number, number]}>} lines - Input lines
 * @param {Object} options - Cleanup options
 * @returns {Object} Clean geometry: { rooms: [...], lines: [...], polygons: [...] }
 */
export function cleanupGeometry(lines, options = {}) {
  const {
    // Small polygon removal (applied to polylines, not individual lines)
    minArea = 50,
    
    // Snapping options
    snapToleranceDeg = 5,
    use45Deg = false,
    
    // Merging options
    mergeDistance = 10,
    colinearAngleTolerance = 0.01,
    
    // Gap bridging
    maxGap = 5,
    
    // Room detection
    minRoomArea = 100,
    roomDetectionGap = 5
  } = options;
  
  if (!Array.isArray(lines) || lines.length === 0) {
    return {
      rooms: [],
      lines: [],
      polygons: []
    };
  }
  
  // Step 1: Snap lines to orthogonal (and optionally 45°)
  let cleaned = snapLines(lines, {
    toleranceDeg: snapToleranceDeg,
    use45Deg: use45Deg
  });
  
  // Step 2: Merge parallel lines
  if (cleaned.length > 1) {
    cleaned = mergeParallel(cleaned, { distanceTolerance: mergeDistance });
  }
  
  // Step 3: Merge colinear segments
  if (cleaned.length > 1) {
    cleaned = mergeColinearSegments(cleaned, {
      distance: mergeDistance,
      angleTolerance: colinearAngleTolerance
    });
  }
  
  // Step 4: Bridge small gaps
  if (cleaned.length > 1) {
    cleaned = bridgeGaps(cleaned, { maxGap });
  }
  
  // Step 5: Detect rooms (closed polygons)
  const rooms = detectRooms(cleaned, {
    minArea: minRoomArea,
    maxGap: roomDetectionGap
  });
  
  // Extract polygons from lines (closed polylines)
  // For now, polygons are the same as detected rooms
  // In a more complete implementation, we'd extract all closed polylines
  const polygons = rooms; // Rooms are polygons
  
  // Filter out very small polygons
  const filteredPolygons = removeSmallPolygons(polygons, { minArea });
  
  return {
    rooms: filteredPolygons,      // Detected rooms (closed polygons)
    lines: cleaned,                // Cleaned line segments
    polygons: filteredPolygons     // All closed polygons (same as rooms for now)
  };
}

/**
 * Cleanup geometry from polylines (input format)
 * Converts polylines to lines, applies cleanup, and returns clean geometry
 * @param {Array<Array<[number, number]>>} polylines - Input polylines
 * @param {Object} options - Cleanup options
 * @returns {Object} Clean geometry: { rooms: [...], lines: [...], polygons: [...] }
 */
export function cleanupFromPolylines(polylines, options = {}) {
  if (!Array.isArray(polylines) || polylines.length === 0) {
    return {
      rooms: [],
      lines: [],
      polygons: []
    };
  }
  
  // Convert polylines to lines
  const lines = [];
  polylines.forEach(polyline => {
    if (!Array.isArray(polyline) || polyline.length < 2) return;
    
    // Check if polyline is closed (forms a polygon)
    const first = polyline[0];
    const last = polyline[polyline.length - 1];
    const isClosed = distance(first, last) < (options.closedTolerance || 5);
    
    // Add line segments
    for (let i = 0; i < polyline.length - 1; i++) {
      lines.push({
        start: [polyline[i][0], polyline[i][1]],
        end: [polyline[i + 1][0], polyline[i + 1][1]]
      });
    }
    
    // If closed, add final segment
    if (!isClosed && polyline.length > 2) {
      lines.push({
        start: [last[0], last[1]],
        end: [first[0], first[1]]
      });
    }
  });
  
  // Apply cleanup to lines
  return cleanupGeometry(lines, options);
}

