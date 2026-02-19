/**
 * Geocoding service for address and postcode lookup
 * Uses OpenStreetMap Nominatim API
 */

export interface GeocodeResult {
  lat: number;
  lng: number;
  displayName: string;
}

/**
 * Geocodes an address or postcode using OpenStreetMap Nominatim API
 * 
 * @param query - Address or postcode to geocode
 * @returns GeocodeResult with lat, lng, and displayName, or null if no results found
 * @throws Error if the API request fails
 */
export async function geocodeAddress(query: string): Promise<GeocodeResult | null> {
  if (!query || query.trim().length === 0) {
    return null;
  }

  try {
    // Construct Nominatim API URL
    // Using format=json, limit=1 to get a single best match
    const encodedQuery = encodeURIComponent(query.trim());
    const url = `https://nominatim.openstreetmap.org/search?q=${encodedQuery}&format=json&limit=1&addressdetails=1`;

    // Fetch from Nominatim API with timeout
    // User-Agent header is required by Nominatim's usage policy
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout

    try {
      const response = await fetch(url, {
        headers: {
          'User-Agent': 'ConstructaOS-AI-Render-Service/1.0', // Required by Nominatim
        },
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`Nominatim API error: ${response.status} ${response.statusText}`);
      }

      const results = await response.json();

      // Handle no results
      if (!Array.isArray(results) || results.length === 0) {
        return null;
      }

      // Extract the first result
      const firstResult = results[0] as {
        lat: string;
        lon: string;
        display_name: string;
      };

      if (!firstResult.lat || !firstResult.lon) {
        return null;
      }

      // Convert strings to numbers and map lon to lng
      const lat = parseFloat(firstResult.lat);
      const lng = parseFloat(firstResult.lon);
      const displayName = firstResult.display_name || query;

      // Validate parsed numbers
      if (isNaN(lat) || isNaN(lng)) {
        return null;
      }

      return {
        lat,
        lng,
        displayName,
      };
    } catch (fetchError) {
      clearTimeout(timeoutId);
      // Check if it's an abort (timeout) or network error
      if (fetchError instanceof Error) {
        if (fetchError.name === 'AbortError' || fetchError.message.includes('aborted')) {
          throw new Error('Geocoding request timed out after 10 seconds. Please try again.');
        }
        // Handle various network errors
        const errorMsg = fetchError.message.toLowerCase();
        if (errorMsg.includes('fetch failed') || 
            errorMsg.includes('econnrefused') || 
            errorMsg.includes('enotfound') ||
            errorMsg.includes('network') ||
            errorMsg.includes('dns') ||
            errorMsg.includes('getaddrinfo')) {
          throw new Error('Unable to connect to geocoding service. Please check your internet connection and try again.');
        }
        // Re-throw the original error with context
        throw new Error(`Geocoding failed: ${fetchError.message}`);
      }
      throw new Error('Geocoding failed: Unknown error');
    }
  } catch (error) {
    // Handle network errors or other failures gracefully
    if (error instanceof Error) {
      // Don't double-wrap the error message if it's already formatted
      if (error.message.startsWith('Geocoding failed:') || error.message.startsWith('Unable to connect') || error.message.startsWith('Geocoding request timed out')) {
        throw error;
      }
      throw new Error(`Geocoding failed: ${error.message}`);
    }
    throw new Error('Geocoding failed: Unknown error');
  }
}

