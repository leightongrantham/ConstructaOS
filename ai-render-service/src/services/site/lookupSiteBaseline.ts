/**
 * Helper function to call site-lookup API
 * Returns existing baseline or default Unknown baseline on failure
 */

import type { ExistingBaseline } from './inferExistingBaseline.js';

interface SiteLookupResponse {
  lat: number;
  lng: number;
  displayName: string;
  primary: ExistingBaseline;
  candidates: Array<{
    id: number;
    centroid: { lat: number; lng: number };
    confidence: 'High' | 'Medium' | 'Low';
    distanceM: number;
  }>;
  disclaimer: string;
}

/**
 * Creates a default Unknown baseline when site lookup fails
 */
function createDefaultBaseline(): ExistingBaseline {
  return {
    footprintPolygon: [],
    footprintAreaM2: 0,
    footprintShape: 'Unknown',
    footprintScale: 'Unknown',
    buildingForm: 'Unknown',
    storeys: 'Unknown',
    roofAssumption: 'Unknown',
    confidence: 'Low',
    rationale: ['Site lookup failed or no location provided'],
  };
}

/**
 * Calls the site-lookup API to get existing baseline
 * @param query - Address query string (optional)
 * @param lat - Latitude (optional)
 * @param lng - Longitude (optional)
 * @returns SiteLookupResponse with full data, or null on failure
 */
export async function lookupSiteBaselineFull(
  query?: string,
  lat?: number,
  lng?: number
): Promise<SiteLookupResponse | null> {
  // If no location provided, return null
  if (!query && (typeof lat !== 'number' || typeof lng !== 'number')) {
    return null;
  }

  try {
    // Determine the base URL for the API
    let baseUrl: string;
    
    if (process.env.VERCEL_URL) {
      baseUrl = `https://${process.env.VERCEL_URL}`;
    } else if (process.env.API_BASE_URL) {
      baseUrl = process.env.API_BASE_URL;
    } else {
      const port = process.env.PORT || '3000';
      baseUrl = `http://localhost:${port}`;
    }

    const siteLookupUrl = `${baseUrl}/api/site-lookup`;

    // Prepare request body
    const body: { query?: string; lat?: number; lng?: number } = {};
    if (query) {
      body.query = query;
    } else if (typeof lat === 'number' && typeof lng === 'number') {
      body.lat = lat;
      body.lng = lng;
    }

    const response = await fetch(siteLookupUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      console.warn(`Site lookup failed with status ${response.status}`);
      return null;
    }

    const data = (await response.json()) as SiteLookupResponse;
    
    // If selectedBuildingId is provided, we need to get that building's baseline
    // For now, we'll use the primary baseline and let the backend handle selection
    // This would require calling site-lookup again with the selected ID, or modifying the API
    // For simplicity, we'll return the full response and let the backend handle it
    
    return data;
  } catch (error) {
    console.error('Error calling site-lookup API:', error);
    return null;
  }
}

/**
 * Calls the site-lookup API to get existing baseline
 * @param query - Address query string (optional)
 * @param lat - Latitude (optional)
 * @param lng - Longitude (optional)
 * @returns ExistingBaseline or default Unknown baseline on failure
 */
export async function lookupSiteBaseline(
  query?: string,
  lat?: number,
  lng?: number
): Promise<ExistingBaseline> {
  const result = await lookupSiteBaselineFull(query, lat, lng);
  return result ? result.primary : createDefaultBaseline();
}
