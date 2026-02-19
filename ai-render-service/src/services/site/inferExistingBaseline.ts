/**
 * Service for inferring existing building baseline from OSM footprint data
 * Analyzes building polygon geometry and nearby buildings to infer characteristics
 */

import type { Building } from './queryNearbyBuildingsOverpass.js';

export interface ExistingBaseline {
  footprintPolygon: Array<[number, number]>; // [lat, lng] pairs
  footprintAreaM2: number;
  footprintShape: 'Rectangle' | 'L-shape' | 'Courtyard' | 'Linear' | 'Stepped' | 'Unknown';
  footprintScale: 'Compact' | 'Typical' | 'Wide' | 'Unknown';
  buildingForm: 'Detached' | 'Semi-detached' | 'Terraced' | 'Infill' | 'Unknown';
  storeys: '1' | '2' | '3+' | 'Unknown';
  roofAssumption: 'Pitched' | 'Flat' | 'Mixed' | 'Unknown';
  confidence: 'High' | 'Medium' | 'Low';
  rationale: string[];
}

/**
 * Calculates the area of a polygon in square meters
 * Uses shoelace formula adapted for spherical coordinates
 * @param polygon - Array of [lat, lng] coordinates
 * @returns Area in square meters
 */
function calculatePolygonArea(polygon: Array<{ lat: number; lng: number }>): number {
  if (polygon.length < 3) {
    return 0;
  }

  const EARTH_RADIUS_M = 6371000; // Earth radius in meters
  let area = 0;
  const n = polygon.length;

  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const pointI = polygon[i];
    const pointJ = polygon[j];
    if (!pointI || !pointJ) continue;

    const lat1 = (pointI.lat * Math.PI) / 180;
    const lon1 = (pointI.lng * Math.PI) / 180;
    const lat2 = (pointJ.lat * Math.PI) / 180;
    const lon2 = (pointJ.lng * Math.PI) / 180;

    // Shoelace formula adapted for spherical coordinates
    area += (lon2 - lon1) * (2 + Math.sin(lat1) + Math.sin(lat2));
  }

  return Math.abs(area * (EARTH_RADIUS_M * EARTH_RADIUS_M)) / 2;
}

/**
 * Calculates the distance between two lat/lng points using Haversine formula
 * @param point1 - First point { lat, lng }
 * @param point2 - Second point { lat, lng }
 * @returns Distance in meters
 */
function calculateDistance(
  point1: { lat: number; lng: number },
  point2: { lat: number; lng: number }
): number {
  const EARTH_RADIUS_M = 6371000; // Earth radius in meters

  const lat1Rad = (point1.lat * Math.PI) / 180;
  const lat2Rad = (point2.lat * Math.PI) / 180;
  const deltaLatRad = ((point2.lat - point1.lat) * Math.PI) / 180;
  const deltaLngRad = ((point2.lng - point1.lng) * Math.PI) / 180;

  const a =
    Math.sin(deltaLatRad / 2) * Math.sin(deltaLatRad / 2) +
    Math.cos(lat1Rad) *
      Math.cos(lat2Rad) *
      Math.sin(deltaLngRad / 2) *
      Math.sin(deltaLngRad / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return EARTH_RADIUS_M * c;
}

/** Tolerance for treating two vertices as the same (OSM shared nodes / party wall). ~1.1 m at mid-latitudes. */
const VERTEX_TOLERANCE_DEG = 1e-5;
/** Max point-to-edge distance to count as adjacent when no shared geometry (narrow digitisation gap). Prevents detached misclassification. */
const PARTY_WALL_DISTANCE_M = 0.3;

/**
 * Returns true if two polygons share at least one vertex (within tolerance).
 * Shared vertices in OSM typically indicate party wall / adjacency.
 */
function hasSharedVertex(
  poly1: Array<{ lat: number; lng: number }>,
  poly2: Array<{ lat: number; lng: number }>,
  toleranceDeg: number
): boolean {
  for (const p1 of poly1) {
    for (const p2 of poly2) {
      if (Math.abs(p1.lat - p2.lat) <= toleranceDeg && Math.abs(p1.lng - p2.lng) <= toleranceDeg) {
        return true;
      }
    }
  }
  return false;
}

/**
 * Returns true if two polygons share an edge (same segment, same or reversed order).
 * Shared edge = party wall; strongest signal for terrace/semi.
 */
function hasSharedEdge(
  poly1: Array<{ lat: number; lng: number }>,
  poly2: Array<{ lat: number; lng: number }>,
  toleranceDeg: number
): boolean {
  for (let i = 0; i < poly1.length; i++) {
    const a = poly1[i]!;
    const b = poly1[(i + 1) % poly1.length]!;
    for (let j = 0; j < poly2.length; j++) {
      const c = poly2[j]!;
      const d = poly2[(j + 1) % poly2.length]!;
      const sameForward =
        Math.abs(a.lat - c.lat) <= toleranceDeg && Math.abs(a.lng - c.lng) <= toleranceDeg &&
        Math.abs(b.lat - d.lat) <= toleranceDeg && Math.abs(b.lng - d.lng) <= toleranceDeg;
      const sameReversed =
        Math.abs(a.lat - d.lat) <= toleranceDeg && Math.abs(a.lng - d.lng) <= toleranceDeg &&
        Math.abs(b.lat - c.lat) <= toleranceDeg && Math.abs(b.lng - c.lng) <= toleranceDeg;
      if (sameForward || sameReversed) return true;
    }
  }
  return false;
}

/**
 * Minimum distance from any point of poly1 to any edge of poly2, in meters.
 */
function minPointToEdgeDistanceM(
  poly1: Array<{ lat: number; lng: number }>,
  poly2: Array<{ lat: number; lng: number }>
): number {
  let min = Infinity;
  for (const point of poly1) {
    for (let i = 0; i < poly2.length; i++) {
      const j = (i + 1) % poly2.length;
      const a = poly2[i]!;
      const b = poly2[j]!;
      const d = pointToLineSegmentDistance(point, a, b);
      if (d < min) min = d;
    }
  }
  return min;
}

/**
 * Checks if two building polygons are adjacent (party wall or narrow gap).
 * Prioritises shared vertices and shared edges to stabilise terrace vs detached and avoid flipping.
 * - Shared vertex or shared edge => adjacent (party wall).
 * - Else only if minimum point-to-edge distance < PARTY_WALL_DISTANCE_M (both directions).
 */
function areBuildingsTouching(
  poly1: Array<{ lat: number; lng: number }>,
  poly2: Array<{ lat: number; lng: number }>
): boolean {
  if (hasSharedVertex(poly1, poly2, VERTEX_TOLERANCE_DEG)) return true;
  if (hasSharedEdge(poly1, poly2, VERTEX_TOLERANCE_DEG)) return true;
  const d1 = minPointToEdgeDistanceM(poly1, poly2);
  const d2 = minPointToEdgeDistanceM(poly2, poly1);
  return d1 < PARTY_WALL_DISTANCE_M || d2 < PARTY_WALL_DISTANCE_M;
}

/**
 * Calculates the distance from a point to a line segment
 * @param point - Point to measure from
 * @param lineStart - Line segment start
 * @param lineEnd - Line segment end
 * @returns Distance in meters
 */
function pointToLineSegmentDistance(
  point: { lat: number; lng: number },
  lineStart: { lat: number; lng: number },
  lineEnd: { lat: number; lng: number }
): number {
  // Convert to approximate meters for calculation
  const A = point.lng - lineStart.lng;
  const B = point.lat - lineStart.lat;
  const C = lineEnd.lng - lineStart.lng;
  const D = lineEnd.lat - lineStart.lat;

  const dot = A * C + B * D;
  const lenSq = C * C + D * D;
  let param = -1;

  if (lenSq !== 0) {
    param = dot / lenSq;
  }

  let xx: number;
  let yy: number;

  if (param < 0) {
    xx = lineStart.lng;
    yy = lineStart.lat;
  } else if (param > 1) {
    xx = lineEnd.lng;
    yy = lineEnd.lat;
  } else {
    xx = lineStart.lng + param * C;
    yy = lineStart.lat + param * D;
  }

  const dx = point.lng - xx;
  const dy = point.lat - yy;
  const distDeg = Math.sqrt(dx * dx + dy * dy);
  
  // Convert degrees to meters (approximate)
  const EARTH_RADIUS_M = 6371000;
  const latRad = (point.lat * Math.PI) / 180;
  const distM = distDeg * (Math.PI / 180) * EARTH_RADIUS_M * Math.cos(latRad);
  
  return Math.abs(distM);
}

/**
 * Calculates bounding box of a polygon
 * @param polygon - Array of lat/lng coordinates
 * @returns Bounding box { minLat, maxLat, minLng, maxLng }
 */
function calculateBoundingBox(
  polygon: Array<{ lat: number; lng: number }>
): { minLat: number; maxLat: number; minLng: number; maxLng: number } {
  if (polygon.length === 0) {
    throw new Error('Cannot calculate bounding box of empty polygon');
  }

  const firstPoint = polygon[0]!; // Safe because we checked length > 0
  let minLat = firstPoint.lat;
  let maxLat = firstPoint.lat;
  let minLng = firstPoint.lng;
  let maxLng = firstPoint.lng;

  for (const point of polygon) {
    if (point.lat < minLat) minLat = point.lat;
    if (point.lat > maxLat) maxLat = point.lat;
    if (point.lng < minLng) minLng = point.lng;
    if (point.lng > maxLng) maxLng = point.lng;
  }

  return { minLat, maxLat, minLng, maxLng };
}

/**
 * Detects polygon shape using bounding box and concavity heuristics
 * @param polygon - Array of lat/lng coordinates
 * @returns Detected shape type
 */
function detectFootprintShape(
  polygon: Array<{ lat: number; lng: number }>
): ExistingBaseline['footprintShape'] {
  if (polygon.length < 3) {
    return 'Unknown';
  }

  const bbox = calculateBoundingBox(polygon);
  const bboxWidth = calculateDistance(
    { lat: bbox.minLat, lng: bbox.minLng },
    { lat: bbox.minLat, lng: bbox.maxLng }
  );
  const bboxHeight = calculateDistance(
    { lat: bbox.minLat, lng: bbox.minLng },
    { lat: bbox.maxLat, lng: bbox.minLng }
  );
  const bboxArea = bboxWidth * bboxHeight;
  const polygonArea = calculatePolygonArea(polygon);

  // Check for concavity (polygon area significantly less than bounding box)
  const areaRatio = polygonArea / bboxArea;
  const isConcave = areaRatio < 0.85;

  // Aspect ratio
  const aspectRatio = bboxWidth > bboxHeight ? bboxWidth / bboxHeight : bboxHeight / bboxWidth;

  // Check for L-shape: concave and moderate aspect ratio
  if (isConcave && areaRatio < 0.75 && aspectRatio < 2.5) {
    return 'L-shape';
  }

  // Check for courtyard: concave with large area ratio (has interior space)
  if (isConcave && areaRatio > 0.5 && polygon.length > 6) {
    return 'Courtyard';
  }

  // Check for linear: high aspect ratio
  if (aspectRatio > 3) {
    return 'Linear';
  }

  // Check for stepped: multiple distinct sections (simplified heuristic)
  if (polygon.length > 8 && isConcave) {
    return 'Stepped';
  }

  // Check for rectangle: low concavity and moderate aspect ratio
  if (!isConcave && aspectRatio < 2) {
    return 'Rectangle';
  }

  return 'Unknown';
}

/**
 * Determines footprint scale based on area thresholds
 * @param areaM2 - Area in square meters
 * @returns Footprint scale
 */
function determineFootprintScale(areaM2: number): ExistingBaseline['footprintScale'] {
  if (areaM2 < 60) {
    return 'Compact';
  } else if (areaM2 <= 120) {
    return 'Typical';
  } else if (areaM2 > 120) {
    return 'Wide';
  }
  return 'Unknown';
}

/**
 * Determines building form from adjacency only: terrace when 2+ neighbours share a wall, semi when 1, detached when 0.
 * Uses deterministic iteration order (by building id) so the same address yields the same form across renders.
 */
function determineBuildingForm(
  primaryPolygon: Array<{ lat: number; lng: number }>,
  nearbyBuildings: Building[]
): ExistingBaseline['buildingForm'] {
  const sorted = [...nearbyBuildings].sort((a, b) => a.id - b.id);
  let touchingCount = 0;

  for (const building of sorted) {
    if (!building.polygonLatLng || building.polygonLatLng.length < 3) continue;
    if (areBuildingsTouching(primaryPolygon, building.polygonLatLng)) {
      touchingCount++;
    }
  }

  if (touchingCount >= 2) return 'Terraced';
  if (touchingCount === 1) return 'Semi-detached';
  if (touchingCount === 0) return 'Detached';
  return 'Unknown';
}

/**
 * Extracts storeys from building tags
 * @param tags - Building tags
 * @returns Storeys value
 */
function extractStoreys(tags: Record<string, string>): ExistingBaseline['storeys'] {
  const levelsStr = tags['building:levels'];
  if (!levelsStr) {
    return 'Unknown';
  }

  const levels = parseInt(levelsStr, 10);
  if (isNaN(levels) || levels < 1) {
    return 'Unknown';
  }

  if (levels === 1) {
    return '1';
  } else if (levels === 2) {
    return '2';
  } else {
    return '3+';
  }
}

/**
 * Determines confidence level based on data quality
 * @param hasStoreys - Whether storeys data is available
 * @param hasValidPolygon - Whether polygon is valid
 * @param buildingCount - Number of nearby buildings for adjacency check
 * @returns Confidence level
 */
function determineConfidence(
  hasStoreys: boolean,
  hasValidPolygon: boolean,
  buildingCount: number
): ExistingBaseline['confidence'] {
  if (hasStoreys && hasValidPolygon && buildingCount > 0) {
    return 'High';
  } else if (hasValidPolygon && buildingCount > 0) {
    return 'Medium';
  } else if (hasValidPolygon) {
    return 'Medium';
  }
  return 'Low';
}

/**
 * Infers existing building baseline from OSM footprint data
 * 
 * @param primaryBuilding - The primary building to analyze
 * @param nearbyBuildings - Array of nearby buildings for adjacency analysis
 * @returns ExistingBaseline with inferred characteristics
 */
export function inferExistingBaseline(
  primaryBuilding: Building,
  nearbyBuildings: Building[]
): ExistingBaseline {
  if (!primaryBuilding.polygonLatLng || primaryBuilding.polygonLatLng.length < 3) {
    throw new Error('Primary building must have a valid polygon with at least 3 points');
  }

  const polygon = primaryBuilding.polygonLatLng;
  
  // Convert polygon to [lat, lng] tuples
  const footprintPolygon: Array<[number, number]> = polygon.map((p) => [p.lat, p.lng]);

  // Calculate area
  const footprintAreaM2 = calculatePolygonArea(polygon);

  // Detect shape
  const footprintShape = detectFootprintShape(polygon);

  // Determine scale
  const footprintScale = determineFootprintScale(footprintAreaM2);

  // Determine building form from adjacency
  const buildingForm = determineBuildingForm(polygon, nearbyBuildings);

  // Extract storeys
  const storeys = extractStoreys(primaryBuilding.tags);

  // Roof assumption (default to Unknown as per requirements)
  const roofAssumption: ExistingBaseline['roofAssumption'] = 'Unknown';

  // Determine confidence
  const hasStoreys = storeys !== 'Unknown';
  const hasValidPolygon = polygon.length >= 3;
  const confidence = determineConfidence(hasStoreys, hasValidPolygon, nearbyBuildings.length);

  // Build rationale array
  const rationale: string[] = [];
  
  rationale.push(`Footprint area: ${Math.round(footprintAreaM2)} m²`);
  rationale.push(`Detected shape: ${footprintShape} (based on bounding box and concavity analysis)`);
  rationale.push(`Footprint scale: ${footprintScale} (area threshold: <60 compact, 60-120 typical, >120 wide)`);
  
  const touchingCount = nearbyBuildings.filter((b) =>
    areBuildingsTouching(polygon, b.polygonLatLng)
  ).length;
  rationale.push(`Building form: ${buildingForm} (touching ${touchingCount} nearby building${touchingCount !== 1 ? 's' : ''})`);
  
  if (storeys !== 'Unknown') {
    rationale.push(`Storeys: ${storeys} (from building:levels tag)`);
  } else {
    rationale.push(`Storeys: Unknown (building:levels tag not present)`);
  }
  
  rationale.push(`Roof assumption: Unknown (not inferred from OSM data)`);
  rationale.push(`Confidence: ${confidence} (based on data completeness)`);

  return {
    footprintPolygon,
    footprintAreaM2,
    footprintShape,
    footprintScale,
    buildingForm,
    storeys,
    roofAssumption,
    confidence,
    rationale,
  };
}
