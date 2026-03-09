/**
 * Service for querying nearby buildings using Overpass API
 * Uses overpass.kumi.systems with 5s timeout; retries once on failure.
 */

export interface Building {
  id: number;
  polygonLatLng: Array<{ lat: number; lng: number }>;
  /** When present, building is a MultiPolygon (e.g. from relation); each element is one polygon ring [lat, lng][]. */
  multiPolygonRings?: Array<Array<{ lat: number; lng: number }>>;
  tags: Record<string, string>;
}

export interface NearbyBuildingsResult {
  buildings: Building[];
  rawCount: number;
}

/** Thrown when both Overpass attempts fail; catch and return 200 with error: "lookup_failed" */
export const LOOKUP_FAILED = 'LOOKUP_FAILED';

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
    [key: string]: string | undefined;
  };
}

interface OverpassResponse {
  elements: OverpassWay[];
}

const OVERPASS_URL = 'https://overpass.kumi.systems/api/interpreter';
const OVERPASS_TIMEOUT_MS = 5000;
const OVERPASS_QUERY_TIMEOUT_SEC = 5;

/**
 * Queries Overpass API for buildings within a radius.
 * Uses kumi.systems, 5s timeout, retries once on timeout/failure.
 * @throws Error(LOOKUP_FAILED) if both attempts fail — return 200 with { footprint: null, error: "lookup_failed" }
 */
export async function queryNearbyBuildingsOverpass(
  lat: number,
  lng: number,
  radiusM: number = 20
): Promise<NearbyBuildingsResult> {
  if (isNaN(lat) || isNaN(lng)) {
    throw new Error('Invalid coordinates: lat and lng must be valid numbers');
  }
  if (lat < -90 || lat > 90) {
    throw new Error('Invalid latitude: must be between -90 and 90');
  }
  if (lng < -180 || lng > 180) {
    throw new Error('Invalid longitude: must be between -180 and 180');
  }
  if (radiusM <= 0 || radiusM > 1000) {
    throw new Error('Invalid radius: must be between 1 and 1000 meters');
  }

  const query = `
[out:json][timeout:${OVERPASS_QUERY_TIMEOUT_SEC}];
(
  way["building"](around:${radiusM},${lat},${lng});
);
out geom;
`;

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      return await fetchOverpass(OVERPASS_URL, query);
    } catch {
      // Retry once on any failure (timeout, 504, etc.)
    }
  }

  throw new Error(LOOKUP_FAILED);
}

async function fetchOverpass(
  overpassUrl: string,
  query: string
): Promise<NearbyBuildingsResult> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), OVERPASS_TIMEOUT_MS);

  try {
    const response = await fetch(overpassUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': 'ConstructaOS-AI-Render-Service/1.0',
      },
      body: `data=${encodeURIComponent(query)}`,
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`Overpass API error: ${response.status} ${response.statusText}`);
    }

    const data = (await response.json()) as OverpassResponse;

    if (!data.elements || !Array.isArray(data.elements)) {
      return { buildings: [], rawCount: 0 };
    }

    const buildings = data.elements.filter(
      (element) => element.type === 'way' && element.geometry && element.geometry.length >= 3
    ) as OverpassWay[];

    const transformedBuildings: Building[] = buildings.map((building) => {
      const polygonLatLng = (building.geometry || []).map((node) => ({
        lat: node.lat,
        lng: node.lon,
      }));
      const tags: Record<string, string> = {};
      if (building.tags) {
        for (const [key, value] of Object.entries(building.tags)) {
          if (value !== undefined) tags[key] = value;
        }
      }
      return { id: building.id, polygonLatLng, tags };
    });

    return { buildings: transformedBuildings, rawCount: buildings.length };
  } catch (fetchError) {
    clearTimeout(timeoutId);
    if (fetchError instanceof Error && fetchError.name === 'AbortError') {
      throw new Error('Overpass request timed out');
    }
    throw fetchError instanceof Error ? fetchError : new Error(String(fetchError));
  }
}
