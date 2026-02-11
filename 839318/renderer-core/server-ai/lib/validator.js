/**
 * Geometry validator and repairer for topology extraction
 */

/**
 * Calculate distance between two points
 * @param {[number, number]} p1 - First point
 * @param {[number, number]} p2 - Second point
 * @returns {number} Distance
 */
function distance(p1, p2) {
  const dx = p2[0] - p1[0];
  const dy = p2[1] - p1[1];
  return Math.sqrt(dx * dx + dy * dy);
}

/**
 * Calculate polygon area using shoelace formula
 * @param {Array<[number, number]>} polygon - Array of points
 * @returns {number} Area (signed)
 */
function polygonArea(polygon) {
  if (polygon.length < 3) return 0;
  
  let area = 0;
  for (let i = 0; i < polygon.length; i++) {
    const j = (i + 1) % polygon.length;
    area += polygon[i][0] * polygon[j][1];
    area -= polygon[j][0] * polygon[i][1];
  }
  return Math.abs(area) / 2;
}

/**
 * Check if polygon is closed (first and last points are within epsilon)
 * @param {Array<[number, number]>} polygon - Array of points
 * @param {number} epsilon - Distance threshold
 * @returns {boolean} True if closed
 */
function isPolygonClosed(polygon, epsilon) {
  if (polygon.length < 3) return false;
  const first = polygon[0];
  const last = polygon[polygon.length - 1];
  return distance(first, last) <= epsilon;
}

/**
 * Get bounding box from geometry
 * @param {Object} geometry - Geometry object
 * @returns {{minX: number, maxX: number, minY: number, maxY: number}} Bounds
 */
function getBounds(geometry) {
  if (geometry.meta?.bounds) {
    return geometry.meta.bounds;
  }

  // Calculate from all points
  const allPoints = [];
  
  // Collect wall points
  if (geometry.walls) {
    geometry.walls.forEach(wall => {
      if (wall.start) allPoints.push(wall.start);
      if (wall.end) allPoints.push(wall.end);
    });
  }
  
  // Collect room polygon points
  if (geometry.rooms) {
    geometry.rooms.forEach(room => {
      if (room.polygon) {
        allPoints.push(...room.polygon);
      }
    });
  }

  if (allPoints.length === 0) {
    return { minX: 0, maxX: 0, minY: 0, maxY: 0 };
  }

  const xs = allPoints.map(p => p[0]);
  const ys = allPoints.map(p => p[1]);
  
  return {
    minX: Math.min(...xs),
    maxX: Math.max(...xs),
    minY: Math.min(...ys),
    maxY: Math.max(...ys)
  };
}

/**
 * Check if point is within bounds
 * @param {[number, number]} point - Point to check
 * @param {Object} bounds - Bounding box
 * @returns {boolean} True if within bounds
 */
function isPointInBounds(point, bounds) {
  if (!Array.isArray(point) || point.length !== 2) return false;
  const [x, y] = point;
  if (typeof x !== 'number' || typeof y !== 'number') return false;
  if (!isFinite(x) || !isFinite(y)) return false;
  
  return x >= bounds.minX && x <= bounds.maxX &&
         y >= bounds.minY && y <= bounds.maxY;
}

/**
 * Calculate wall length
 * @param {Object} wall - Wall object
 * @returns {number} Length
 */
function wallLength(wall) {
  if (!wall.start || !wall.end) return 0;
  return distance(wall.start, wall.end);
}

/**
 * Validate geometry structure
 * @param {Object} geometry - Geometry object to validate
 * @returns {{valid: boolean, errors: Array<{path: string, message: string}>}}
 */
export function validateGeometry(geometry) {
  const errors = [];

  if (!geometry || typeof geometry !== 'object') {
    return { valid: false, errors: [{ path: 'root', message: 'Geometry must be an object' }] };
  }

  // Check meta.scale
  if (!geometry.meta) {
    errors.push({ path: 'meta', message: 'Missing meta object' });
  } else {
    if (typeof geometry.meta.scale !== 'number' || geometry.meta.scale <= 0) {
      errors.push({ path: 'meta.scale', message: 'Scale must be a positive number' });
    }
  }

  // Get bounds for validation
  const bounds = getBounds(geometry);
  const epsilon = Math.max(
    (bounds.maxX - bounds.minX) * 0.01,
    (bounds.maxY - bounds.minY) * 0.01,
    0.01 // Minimum epsilon of 1cm
  );

  // Validate walls
  if (!Array.isArray(geometry.walls)) {
    errors.push({ path: 'walls', message: 'Walls must be an array' });
  } else {
    const wallIds = new Set();
    
    geometry.walls.forEach((wall, index) => {
      const wallPath = `walls[${index}]`;
      
      if (!wall || typeof wall !== 'object') {
        errors.push({ path: wallPath, message: 'Wall must be an object' });
        return;
      }

      // Check ID
      if (!wall.id || typeof wall.id !== 'string') {
        errors.push({ path: `${wallPath}.id`, message: 'Wall must have a string id' });
      } else if (wallIds.has(wall.id)) {
        errors.push({ path: `${wallPath}.id`, message: `Duplicate wall id: ${wall.id}` });
      } else {
        wallIds.add(wall.id);
      }

      // Check start point
      if (!isPointInBounds(wall.start, bounds)) {
        errors.push({
          path: `${wallPath}.start`,
          message: `Start point [${wall.start}] is not numeric or out of bounds`
        });
      }

      // Check end point
      if (!isPointInBounds(wall.end, bounds)) {
        errors.push({
          path: `${wallPath}.end`,
          message: `End point [${wall.end}] is not numeric or out of bounds`
        });
      }
    });
  }

  // Validate rooms
  if (!Array.isArray(geometry.rooms)) {
    errors.push({ path: 'rooms', message: 'Rooms must be an array' });
  } else {
    geometry.rooms.forEach((room, index) => {
      const roomPath = `rooms[${index}]`;
      
      if (!room || typeof room !== 'object') {
        errors.push({ path: roomPath, message: 'Room must be an object' });
        return;
      }

      // Check polygon
      if (!Array.isArray(room.polygon) || room.polygon.length < 3) {
        errors.push({
          path: `${roomPath}.polygon`,
          message: 'Polygon must be an array with at least 3 points'
        });
      } else {
        // Check if polygon is closed
        if (!isPolygonClosed(room.polygon, epsilon)) {
          errors.push({
            path: `${roomPath}.polygon`,
            message: 'Polygon is not closed (endpoints are too far apart)'
          });
        }

        // Check area
        const area = polygonArea(room.polygon);
        if (area <= 0) {
          errors.push({
            path: `${roomPath}.area_m2`,
            message: `Polygon has zero or negative area: ${area}`
          });
        } else if (room.area_m2 !== undefined && Math.abs(room.area_m2 - area) > 0.1) {
          // Warn if area doesn't match (but don't fail validation)
          // This is just a consistency check
        }
      }
    });
  }

  // Validate openings
  if (!Array.isArray(geometry.openings)) {
    errors.push({ path: 'openings', message: 'Openings must be an array' });
  } else {
    const wallIds = new Set((geometry.walls || []).map(w => w.id).filter(Boolean));
    
    geometry.openings.forEach((opening, index) => {
      const openingPath = `openings[${index}]`;
      
      if (!opening || typeof opening !== 'object') {
        errors.push({ path: openingPath, message: 'Opening must be an object' });
        return;
      }

      // Check wallId reference
      if (!opening.wallId || typeof opening.wallId !== 'string') {
        errors.push({
          path: `${openingPath}.wallId`,
          message: 'Opening must have a string wallId'
        });
      } else if (!wallIds.has(opening.wallId)) {
        errors.push({
          path: `${openingPath}.wallId`,
          message: `Opening references non-existent wall: ${opening.wallId}`
        });
      }
    });
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

/**
 * Remove duplicate points from array
 * @param {Array<[number, number]>} points - Array of points
 * @param {number} epsilon - Distance threshold
 * @returns {Array<[number, number]>} Points with duplicates removed
 */
function removeDuplicatePoints(points, epsilon) {
  if (points.length === 0) return points;
  
  const result = [points[0]];
  
  for (let i = 1; i < points.length; i++) {
    const lastPoint = result[result.length - 1];
    if (distance(points[i], lastPoint) > epsilon) {
      result.push(points[i]);
    }
  }
  
  return result;
}

/**
 * Join endpoints that are close together
 * @param {Array<[number, number]>} points - Array of points
 * @param {number} epsilon - Distance threshold
 * @returns {Array<[number, number]>} Points with endpoints joined
 */
function joinEndpoints(points, epsilon) {
  if (points.length < 2) return points;
  
  const result = [...points];
  const first = result[0];
  const last = result[result.length - 1];
  
  if (distance(first, last) <= epsilon && result.length > 2) {
    // Join by making last point equal to first
    result[result.length - 1] = [first[0], first[1]];
  }
  
  return result;
}

/**
 * Repair geometry using heuristics
 * @param {Object} geometry - Geometry object to repair
 * @returns {Object} Repaired geometry
 */
export function repairGeometry(geometry) {
  if (!geometry || typeof geometry !== 'object') {
    return geometry;
  }

  const repaired = {
    walls: [],
    rooms: [],
    openings: [],
    meta: { ...geometry.meta }
  };

  // Get bounds and calculate epsilon (1% of bbox diagonal)
  const bounds = getBounds(geometry);
  const bboxWidth = bounds.maxX - bounds.minX;
  const bboxHeight = bounds.maxY - bounds.minY;
  const bboxDiagonal = Math.sqrt(bboxWidth * bboxWidth + bboxHeight * bboxHeight);
  const epsilon = Math.max(bboxDiagonal * 0.01, 0.01); // 1% of diagonal, minimum 1cm

  // Minimum wall length threshold (5cm)
  const minWallLength = 0.05;

  // Repair walls
  if (Array.isArray(geometry.walls)) {
    const validWallIds = new Set();
    
    geometry.walls.forEach(wall => {
      if (!wall || typeof wall !== 'object') return;
      if (!wall.start || !wall.end) return;
      
      // Check if wall is long enough
      const length = wallLength(wall);
      if (length < minWallLength) {
        return; // Drop short walls
      }

      // Ensure points are valid
      const start = Array.isArray(wall.start) && wall.start.length === 2
        ? [Number(wall.start[0]), Number(wall.start[1])]
        : null;
      const end = Array.isArray(wall.end) && wall.end.length === 2
        ? [Number(wall.end[0]), Number(wall.end[1])]
        : null;

      if (!start || !end) return;
      if (!isFinite(start[0]) || !isFinite(start[1]) ||
          !isFinite(end[0]) || !isFinite(end[1])) {
        return;
      }

      // Create repaired wall
      const repairedWall = {
        id: wall.id || `wall-${repaired.walls.length + 1}`,
        start,
        end,
        thickness: typeof wall.thickness === 'number' && wall.thickness > 0
          ? wall.thickness
          : 0.25, // Default thickness
        type: ['exterior', 'interior', 'structural', 'partition'].includes(wall.type)
          ? wall.type
          : 'interior' // Default type
      };

      repaired.walls.push(repairedWall);
      validWallIds.add(repairedWall.id);
    });
  }

  // Repair rooms
  if (Array.isArray(geometry.rooms)) {
    geometry.rooms.forEach(room => {
      if (!room || typeof room !== 'object') return;
      if (!Array.isArray(room.polygon) || room.polygon.length < 3) return;

      // Remove duplicate points
      let cleanedPolygon = removeDuplicatePoints(room.polygon, epsilon);
      
      // Join endpoints if close
      cleanedPolygon = joinEndpoints(cleanedPolygon, epsilon);
      
      // Ensure polygon is closed
      if (!isPolygonClosed(cleanedPolygon, epsilon)) {
        // Close it by adding first point at the end if not already there
        const first = cleanedPolygon[0];
        const last = cleanedPolygon[cleanedPolygon.length - 1];
        if (distance(first, last) > epsilon) {
          cleanedPolygon.push([first[0], first[1]]);
        }
      }

      // Calculate area
      const area = polygonArea(cleanedPolygon);
      if (area <= 0) {
        return; // Drop rooms with zero area
      }

      // Create repaired room
      const repairedRoom = {
        id: room.id || `room-${repaired.rooms.length + 1}`,
        polygon: cleanedPolygon,
        area_m2: area
      };

      repaired.rooms.push(repairedRoom);
    });
  }

  // Repair openings (only keep those referencing valid walls)
  if (Array.isArray(geometry.openings)) {
    const validWallIds = new Set(repaired.walls.map(w => w.id));
    
    geometry.openings.forEach(opening => {
      if (!opening || typeof opening !== 'object') return;
      if (!opening.wallId || !validWallIds.has(opening.wallId)) {
        return; // Drop openings with invalid wall references
      }

      // Ensure position is valid (0-1)
      const position = typeof opening.position === 'number'
        ? Math.max(0, Math.min(1, opening.position))
        : 0.5; // Default to middle

      const repairedOpening = {
        id: opening.id || `opening-${repaired.openings.length + 1}`,
        wallId: opening.wallId,
        type: ['door', 'window', 'opening'].includes(opening.type)
          ? opening.type
          : 'opening', // Default type
        position
      };

      repaired.openings.push(repairedOpening);
    });
  }

  // Ensure meta has required fields
  if (!repaired.meta.scale || repaired.meta.scale <= 0) {
    repaired.meta.scale = 0.01; // Default scale
  }

  // Update bounds
  repaired.meta.bounds = getBounds(repaired);

  return repaired;
}

