/**
 * Service for querying nearby buildings using Overpass API
 * Queries OpenStreetMap for building polygons within a radius
 */

export interface NearbyBuildingsResult {
  buildingCount: number;
  footprints: number[]; // Areas in square meters
  touchingNeighbours: boolean;
  buildingLevels?: number[]; // Building levels if available
}

interface OverpassNode {
  lat: number;
  lon: number;
}

interface OverpassWay {
  id: number;
  type: 'way';
  nodes: number[];
  geometry?: OverpassNode[];
  tags?: {
    building?: string;
    'building:levels'?: string;
    [key: string]: string | undefined;
  };
}

interface OverpassResponse {
  elements: OverpassWay[];
}

/**
 * Calculates the area of a polygon using the shoelace formula
 * Coordinates are in lat/lng, so this is an approximate area
 * @param nodes - Array of lat/lng coordinates
 * @returns Area in square meters (approximate)
 */
function calculatePolygonArea(nodes: OverpassNode[]): number {
  if (nodes.length < 3) {
    return 0;
  }

  // Convert lat/lng to approximate meters using Haversine
  // Simplified calculation for small areas
  const EARTH_RADIUS_M = 6371000; // Earth radius in meters
  
  let area = 0;
  const n = nodes.length;

  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const nodeI = nodes[i];
    const nodeJ = nodes[j];
    if (!nodeI || !nodeJ) continue;
    
    const lat1 = (nodeI.lat * Math.PI) / 180;
    const lon1 = (nodeI.lon * Math.PI) / 180;
    const lat2 = (nodeJ.lat * Math.PI) / 180;
    const lon2 = (nodeJ.lon * Math.PI) / 180;

    // Shoelace formula adapted for spherical coordinates
    area += (lon2 - lon1) * (2 + Math.sin(lat1) + Math.sin(lat2));
  }

  area = Math.abs(area * (EARTH_RADIUS_M * EARTH_RADIUS_M)) / 2;

  return area;
}

/**
 * Checks if two building polygons are touching or very close
 * Buildings are considered touching if they share nodes or are within 1 meter
 * @param poly1 - First polygon nodes
 * @param poly2 - Second polygon nodes
 * @returns True if buildings are touching
 */
function areBuildingsTouching(poly1: OverpassNode[], poly2: OverpassNode[]): boolean {
  // Check if they share any nodes (exact match)
  for (const node1 of poly1) {
    for (const node2 of poly2) {
      // Check if nodes are the same (within small tolerance for floating point)
      const latDiff = Math.abs(node1.lat - node2.lat);
      const lonDiff = Math.abs(node1.lon - node2.lon);
      if (latDiff < 0.00001 && lonDiff < 0.00001) {
        return true;
      }
    }
  }

  // Check if any edge of poly1 is very close to any edge of poly2
  // Simplified: check if any node of poly1 is within 1 meter of any edge of poly2
  const DISTANCE_THRESHOLD_M = 1; // 1 meter
  const THRESHOLD_DEG = DISTANCE_THRESHOLD_M / 111000; // Approximate degrees for 1 meter

  for (const node1 of poly1) {
    if (!node1) continue;
    for (let i = 0; i < poly2.length; i++) {
      const j = (i + 1) % poly2.length;
      const node2a = poly2[i];
      const node2b = poly2[j];
      if (!node2a || !node2b) continue;

      // Distance from point to line segment (simplified calculation)
      const dist = pointToLineSegmentDistance(node1, node2a, node2b);
      if (dist < THRESHOLD_DEG) {
        return true;
      }
    }
  }

  return false;
}

/**
 * Calculates the distance from a point to a line segment
 * Simplified calculation using lat/lng coordinates
 */
function pointToLineSegmentDistance(
  point: OverpassNode,
  lineStart: OverpassNode,
  lineEnd: OverpassNode
): number {
  const A = point.lon - lineStart.lon;
  const B = point.lat - lineStart.lat;
  const C = lineEnd.lon - lineStart.lon;
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
    xx = lineStart.lon;
    yy = lineStart.lat;
  } else if (param > 1) {
    xx = lineEnd.lon;
    yy = lineEnd.lat;
  } else {
    xx = lineStart.lon + param * C;
    yy = lineStart.lat + param * D;
  }

  const dx = point.lon - xx;
  const dy = point.lat - yy;
  return Math.sqrt(dx * dx + dy * dy);
}

/**
 * Queries Overpass API for buildings within a radius of a given location
 * 
 * @param lat - Latitude of the center point
 * @param lng - Longitude of the center point
 * @param radiusMeters - Search radius in meters (default: 50)
 * @returns NearbyBuildingsResult with building information
 * @throws Error if the API request fails
 */
export async function queryNearbyBuildings(
  lat: number,
  lng: number,
  radiusMeters: number = 50
): Promise<NearbyBuildingsResult> {
  // Validate coordinates
  if (isNaN(lat) || isNaN(lng)) {
    throw new Error('Invalid coordinates: lat and lng must be valid numbers');
  }

  if (lat < -90 || lat > 90) {
    throw new Error('Invalid latitude: must be between -90 and 90');
  }

  if (lng < -180 || lng > 180) {
    throw new Error('Invalid longitude: must be between -180 and 180');
  }

  if (radiusMeters <= 0 || radiusMeters > 1000) {
    throw new Error('Invalid radius: must be between 1 and 1000 meters');
  }

  try {
    // Construct Overpass API query
    // Query for all building ways within the radius
    const query = `
[out:json][timeout:25];
(
  way["building"](around:${radiusMeters},${lat},${lng});
);
out geom;
`;

    // Overpass API endpoint
    const overpassUrl = 'https://overpass-api.de/api/interpreter';

    // Fetch from Overpass API
    const response = await fetch(overpassUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': 'ConstructaOS-AI-Render-Service/1.0',
      },
      body: `data=${encodeURIComponent(query)}`,
    });

    if (!response.ok) {
      throw new Error(`Overpass API error: ${response.status} ${response.statusText}`);
    }

    const data = (await response.json()) as OverpassResponse;

    if (!data.elements || !Array.isArray(data.elements)) {
      return {
        buildingCount: 0,
        footprints: [],
        touchingNeighbours: false,
      };
    }

    // Filter to only building ways with geometry
    const buildings = data.elements.filter(
      (element) => element.type === 'way' && element.geometry && element.geometry.length >= 3
    ) as OverpassWay[];

    if (buildings.length === 0) {
      return {
        buildingCount: 0,
        footprints: [],
        touchingNeighbours: false,
      };
    }

    // Calculate footprints (areas)
    const footprints: number[] = [];
    const buildingLevels: number[] = [];

    for (const building of buildings) {
      if (building.geometry && building.geometry.length >= 3) {
        const area = calculatePolygonArea(building.geometry);
        if (area > 0) {
          footprints.push(area);
        }

        // Extract building levels if available
        if (building.tags && building.tags['building:levels']) {
          const levels = parseInt(building.tags['building:levels'], 10);
          if (!isNaN(levels) && levels > 0) {
            buildingLevels.push(levels);
          }
        }
      }
    }

    // Check for touching neighbours
    let touchingNeighbours = false;
    if (buildings.length > 1) {
      for (let i = 0; i < buildings.length; i++) {
        for (let j = i + 1; j < buildings.length; j++) {
          const building1 = buildings[i];
          const building2 = buildings[j];
          
          if (building1 && building2 && building1.geometry && building2.geometry) {
            if (areBuildingsTouching(building1.geometry, building2.geometry)) {
              touchingNeighbours = true;
              break;
            }
          }
        }
        if (touchingNeighbours) {
          break;
        }
      }
    }

    const result: NearbyBuildingsResult = {
      buildingCount: buildings.length,
      footprints,
      touchingNeighbours,
    };

    if (buildingLevels.length > 0) {
      result.buildingLevels = buildingLevels;
    }

    return result;
  } catch (error) {
    // Handle network errors or other failures gracefully
    if (error instanceof Error) {
      throw new Error(`Failed to query nearby buildings: ${error.message}`);
    }
    throw new Error('Failed to query nearby buildings: Unknown error');
  }
}

