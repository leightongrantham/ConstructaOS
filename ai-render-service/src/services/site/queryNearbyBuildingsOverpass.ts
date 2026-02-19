/**
 * Service for querying nearby buildings using Overpass API
 * Queries OpenStreetMap for building polygons within a radius
 */

export interface Building {
  id: number;
  polygonLatLng: Array<{ lat: number; lng: number }>;
  tags: Record<string, string>;
}

export interface NearbyBuildingsResult {
  buildings: Building[];
  rawCount: number;
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
    [key: string]: string | undefined;
  };
}

interface OverpassResponse {
  elements: OverpassWay[];
}

/**
 * Queries Overpass API for buildings within a radius of a given location
 * 
 * @param lat - Latitude of the center point
 * @param lng - Longitude of the center point
 * @param radiusM - Search radius in meters (default: 40)
 * @returns NearbyBuildingsResult with building information
 * @throws Error if the API request fails
 */
export async function queryNearbyBuildingsOverpass(
  lat: number,
  lng: number,
  radiusM: number = 40
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

  if (radiusM <= 0 || radiusM > 1000) {
    throw new Error('Invalid radius: must be between 1 and 1000 meters');
  }

  try {
    // Construct Overpass API query
    // Query for all building ways within the radius
    const query = `
[out:json][timeout:25];
(
  way["building"](around:${radiusM},${lat},${lng});
);
out geom;
`;

    // Overpass API endpoint
    const overpassUrl = 'https://overpass-api.de/api/interpreter';

    // Fetch from Overpass API with 15s timeout (Overpass can be slow under load)
    const controller = new AbortController();
    const OVERPASS_TIMEOUT_MS = 15000;
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
        return {
          buildings: [],
          rawCount: 0,
        };
      }

      // Filter to only building ways with geometry
      const buildings = data.elements.filter(
        (element) => element.type === 'way' && element.geometry && element.geometry.length >= 3
      ) as OverpassWay[];

      // Transform to Building format
      const transformedBuildings: Building[] = buildings.map((building) => {
        const polygonLatLng = (building.geometry || []).map((node) => ({
          lat: node.lat,
          lng: node.lon,
        }));

        // Filter out undefined values from tags
        const tags: Record<string, string> = {};
        if (building.tags) {
          for (const [key, value] of Object.entries(building.tags)) {
            if (value !== undefined) {
              tags[key] = value;
            }
          }
        }

        return {
          id: building.id,
          polygonLatLng,
          tags,
        };
      });

      return {
        buildings: transformedBuildings,
        rawCount: buildings.length,
      };
    } catch (fetchError) {
      clearTimeout(timeoutId);
      // Check if it's an abort (timeout) or network error
      if (fetchError instanceof Error) {
        if (fetchError.name === 'AbortError' || fetchError.message.includes('aborted')) {
          throw new Error(`Overpass API request timed out after ${OVERPASS_TIMEOUT_MS / 1000} seconds. Please try again.`);
        }
        // Handle various network errors
        const errorMsg = fetchError.message.toLowerCase();
        if (errorMsg.includes('fetch failed') || 
            errorMsg.includes('econnrefused') || 
            errorMsg.includes('enotfound') ||
            errorMsg.includes('network') ||
            errorMsg.includes('dns') ||
            errorMsg.includes('getaddrinfo')) {
          throw new Error('Unable to connect to Overpass API. Please check your internet connection and try again.');
        }
        // Re-throw the original error with context
        throw new Error(`Failed to query nearby buildings: ${fetchError.message}`);
      }
      throw new Error('Failed to query nearby buildings: Unknown error');
    }
  } catch (error) {
    // Handle network errors or other failures gracefully
    if (error instanceof Error) {
      // Don't double-wrap the error message if it's already formatted
      if (error.message.startsWith('Failed to query nearby buildings:') || 
          error.message.startsWith('Unable to connect') || 
          error.message.startsWith('Overpass API request timed out')) {
        throw error;
      }
      throw new Error(`Failed to query nearby buildings: ${error.message}`);
    }
    throw new Error('Failed to query nearby buildings: Unknown error');
  }
}
