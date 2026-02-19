/**
 * Vercel serverless function for site lookup
 * POST /api/site-lookup
 * 
 * Body: { query: string } OR { lat: number, lng: number }
 * Returns: { lat, lng, displayName, primary: ExistingBaseline, candidates: Array }
 */

import 'dotenv/config';
import type { VercelRequest, VercelResponse } from '@vercel/node';

const ALLOWED_ORIGINS = [
  /^https?:\/\/localhost(:\d+)?$/,
  /^https?:\/\/127\.0\.0\.1(:\d+)?$/,
  /\.vercel\.app$/,
  /lovableproject\.com$/,
  /lovable\.app$/,
  /lovable\.dev$/,
];

function setCorsHeaders(req: VercelRequest, res: VercelResponse): void {
  const origin = req.headers.origin;
  if (origin && ALLOWED_ORIGINS.some((re) => re.test(origin))) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
}
import { geocodeAddress } from '../src/services/site/geocodeAddress.js';
import { queryNearbyBuildingsOverpass } from '../src/services/site/queryNearbyBuildingsOverpass.js';
import { selectPrimaryBuilding } from '../src/services/site/selectPrimaryBuilding.js';
import { inferExistingBaseline } from '../src/services/site/inferExistingBaseline.js';
import type { ExistingBaseline } from '../src/services/site/inferExistingBaseline.js';

interface SiteLookupRequest {
  query?: string;
  lat?: number;
  lng?: number;
}

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
  /** Simplified neighbour building polygons for map context [lat, lng][] */
  neighbourPolygons: Array<{ id: number; polygon: Array<[number, number]> }>;
  disclaimer: string;
}

/**
 * Calculates the centroid of a polygon
 */
function calculatePolygonCentroid(
  polygon: Array<{ lat: number; lng: number }>
): { lat: number; lng: number } {
  if (polygon.length === 0) {
    throw new Error('Cannot calculate centroid of empty polygon');
  }

  let sumLat = 0;
  let sumLng = 0;

  for (const point of polygon) {
    sumLat += point.lat;
    sumLng += point.lng;
  }

  return {
    lat: sumLat / polygon.length,
    lng: sumLng / polygon.length,
  };
}

/**
 * Calculates the distance between two lat/lng points using Haversine formula
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

/**
 * Creates a default Unknown baseline when no buildings are found
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
    rationale: ['No buildings found in the specified location'],
  };
}

export default async function handler(
  req: VercelRequest,
  res: VercelResponse
): Promise<void> {
  setCorsHeaders(req, res);

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed. Use POST.' });
    return;
  }

  try {
    const body = req.body as SiteLookupRequest;

    // Validate request body
    if (!body.query && (typeof body.lat !== 'number' || typeof body.lng !== 'number')) {
      res.status(400).json({
        error: 'Invalid request body. Provide either { query: string } or { lat: number, lng: number }',
      });
      return;
    }

    let lat: number;
    let lng: number;
    let displayName: string;

    // Geocode if query provided, otherwise use provided coordinates
    if (body.query) {
      const geocodeResult = await geocodeAddress(body.query);
      if (!geocodeResult) {
        res.status(404).json({
          error: 'Address not found. Please try a different query.',
        });
        return;
      }
      lat = geocodeResult.lat;
      lng = geocodeResult.lng;
      displayName = geocodeResult.displayName;
    } else {
      lat = body.lat!;
      lng = body.lng!;
      displayName = `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
    }

    // Query nearby buildings
    const buildingsResult = await queryNearbyBuildingsOverpass(lat, lng, 40);

    // If no buildings found, return default Unknown baseline
    if (buildingsResult.buildings.length === 0) {
      const response: SiteLookupResponse = {
        lat,
        lng,
        displayName,
        primary: createDefaultBaseline(),
        candidates: [],
        neighbourPolygons: [],
        disclaimer: 'Existing building is estimated from mapping data; footprint and storeys may be approximate. Not a measured survey.',
      };
      res.status(200).json(response);
      return;
    }

    // Select primary building
    const primaryResult = selectPrimaryBuilding(lat, lng, buildingsResult.buildings);

    // Infer baseline from primary building
    const primaryBaseline = inferExistingBaseline(
      primaryResult.building,
      buildingsResult.buildings.filter((b) => b.id !== primaryResult.building.id)
    );

    // Calculate candidates (nearest 3 buildings, excluding primary)
    const targetPoint = { lat, lng };
    const candidatesWithDistance = buildingsResult.buildings
      .filter((b) => b.id !== primaryResult.building.id)
      .map((building) => {
        if (!building.polygonLatLng || building.polygonLatLng.length < 3) {
          return null;
        }

        const centroid = calculatePolygonCentroid(building.polygonLatLng);
        const distance = calculateDistance(targetPoint, centroid);

        // Determine confidence based on distance
        let confidence: 'High' | 'Medium' | 'Low';
        if (distance <= 10) {
          confidence = 'High';
        } else if (distance <= 25) {
          confidence = 'Medium';
        } else {
          confidence = 'Low';
        }

        return {
          id: building.id,
          centroid,
          confidence,
          distanceM: Math.round(distance * 10) / 10, // Round to 1 decimal place
        };
      })
      .filter((c): c is NonNullable<typeof c> => c !== null)
      .sort((a, b) => a.distanceM - b.distanceM)
      .slice(0, 3); // Top 3 candidates

    // Neighbour polygons for map context (top 5 nearby, simplified for display)
    const neighbourBuildings = buildingsResult.buildings
      .filter((b) => b.id !== primaryResult.building.id && b.polygonLatLng && b.polygonLatLng.length >= 3)
      .map((b) => ({
        building: b,
        distance: calculateDistance(targetPoint, calculatePolygonCentroid(b.polygonLatLng!)),
      }))
      .sort((a, b) => a.distance - b.distance)
      .slice(0, 5)
      .map(({ building }) => ({
        id: building.id,
        polygon: building.polygonLatLng!.map((p) => [p.lat, p.lng] as [number, number]),
      }));

    const response: SiteLookupResponse = {
      lat,
      lng,
      displayName,
      primary: primaryBaseline,
      candidates: candidatesWithDistance,
      neighbourPolygons: neighbourBuildings,
      disclaimer: 'Existing building is estimated from mapping data; footprint and storeys may be approximate. Not a measured survey.',
    };

    res.status(200).json(response);
  } catch (error) {
    console.error('Error in site-lookup endpoint:', error);
    
    if (!res.headersSent) {
      res.status(500).json({
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error occurred',
      });
    }
  }
}
