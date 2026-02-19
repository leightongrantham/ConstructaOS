/**
 * Shared site-lookup pipeline: geocode → overpass → select primary → infer baseline.
 * Used by Express POST /api/site-lookup and by server-side baseline resolution.
 */

import { geocodeAddress } from './geocodeAddress.js';
import { queryNearbyBuildingsOverpass } from './queryNearbyBuildingsOverpass.js';
import { selectPrimaryBuilding } from './selectPrimaryBuilding.js';
import { inferExistingBaseline, type ExistingBaseline } from './inferExistingBaseline.js';

export interface SiteLookupRequest {
  query?: string;
  lat?: number;
  lng?: number;
}

export interface SiteLookupResponse {
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
  /** Simplified neighbour building polygons for map context [lat, lng][] */
  neighbourPolygons: Array<{ id: number; polygon: Array<[number, number]> }>;
  disclaimer: string;
}

const DISCLAIMER =
  'Existing building is estimated from mapping data; footprint and storeys may be approximate. Not a measured survey.';

function centroid(polygon: Array<{ lat: number; lng: number }>): { lat: number; lng: number } {
  if (polygon.length === 0) throw new Error('Cannot calculate centroid of empty polygon');
  let sumLat = 0, sumLng = 0;
  for (const p of polygon) {
    sumLat += p.lat;
    sumLng += p.lng;
  }
  return { lat: sumLat / polygon.length, lng: sumLng / polygon.length };
}

function haversineM(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number }
): number {
  const R = 6_371_000;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180, lat2 = (b.lat * Math.PI) / 180;
  const x =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}

function defaultBaseline(): ExistingBaseline {
  return {
    footprintPolygon: [],
    footprintAreaM2: 0,
    footprintShape: 'Unknown',
    footprintScale: 'Unknown',
    buildingForm: 'Unknown',
    storeys: 'Unknown',
    roofAssumption: 'Unknown',
    confidence: 'Low',
    rationale: ['No buildings found in the specified location'],
  };
}

/**
 * Run the site-lookup pipeline. Throws on invalid input; returns response (including Unknown baseline when no buildings).
 */
export async function runSiteLookup(body: SiteLookupRequest): Promise<SiteLookupResponse> {
  if (!body.query && (typeof body.lat !== 'number' || typeof body.lng !== 'number')) {
    throw new Error('Invalid request body. Provide either { query: string } or { lat: number, lng: number }');
  }

  let lat: number;
  let lng: number;
  let displayName: string;

  if (body.query) {
    const geo = await geocodeAddress(body.query);
    if (!geo) {
      throw new Error('Address not found. Please try a different query.');
    }
    lat = geo.lat;
    lng = geo.lng;
    displayName = geo.displayName;
  } else {
    lat = body.lat!;
    lng = body.lng!;
    displayName = `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
  }

  const { buildings } = await queryNearbyBuildingsOverpass(lat, lng, 40);

  if (buildings.length === 0) {
    return {
      lat,
      lng,
      displayName,
      primary: defaultBaseline(),
      candidates: [],
      neighbourPolygons: [],
      disclaimer: DISCLAIMER,
    };
  }

  const primaryResult = selectPrimaryBuilding(lat, lng, buildings);
  const primaryBaseline = inferExistingBaseline(
    primaryResult.building,
    buildings.filter((b) => b.id !== primaryResult.building.id)
  );

  const target = { lat, lng };
  const candidates = buildings
    .filter((b) => b.id !== primaryResult.building.id)
    .map((b): { id: number; centroid: { lat: number; lng: number }; confidence: 'High' | 'Medium' | 'Low'; distanceM: number } | null => {
      if (!b.polygonLatLng || b.polygonLatLng.length < 3) return null;
      const c = centroid(b.polygonLatLng);
      const d = haversineM(target, c);
      const confidence = d <= 10 ? 'High' : d <= 25 ? 'Medium' : 'Low';
      return { id: b.id, centroid: c, confidence, distanceM: Math.round(d * 10) / 10 };
    })
    .filter((c): c is NonNullable<typeof c> => c !== null)
    .sort((a, b) => a.distanceM - b.distanceM)
    .slice(0, 3);

  const neighbourPolygons = buildings
    .filter((b) => b.id !== primaryResult.building.id && b.polygonLatLng && b.polygonLatLng.length >= 3)
    .map((b) => ({
      building: b,
      distanceM: haversineM(target, centroid(b.polygonLatLng!)),
    }))
    .sort((a, b) => a.distanceM - b.distanceM)
    .slice(0, 5)
    .map(({ building }) => ({
      id: building.id,
      polygon: building.polygonLatLng!.map((p) => [p.lat, p.lng] as [number, number]),
    }));

  return {
    lat,
    lng,
    displayName,
    primary: primaryBaseline,
    candidates,
    neighbourPolygons,
    disclaimer: DISCLAIMER,
  };
}
