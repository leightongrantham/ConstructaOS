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
  /\.lovableproject\.com$/,
  /\.lovable\.app$/,
  /\.lovable\.dev$/,
  // Lovable preview/deploy URLs (e.g. id-preview--uuid.lovable.app)
  /^https:\/\/[a-z0-9-]+--[a-f0-9-]+\.lovable\.(app|dev)$/,
  /^https:\/\/[a-z0-9-]+\.lovable\.(app|dev)$/,
];

function setCorsHeaders(req: VercelRequest, res: VercelResponse): void {
  const origin = req.headers?.origin;
  if (origin && ALLOWED_ORIGINS.some((re) => re.test(origin))) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Max-Age', '86400');
}

// Types imported for type annotations only (no runtime load)
import type { ExistingBaseline } from '../src/services/site/inferExistingBaseline.js';

interface SiteLookupRequest {
  query?: string;
  lat?: number;
  lng?: number;
}

/** Best-match footprint with polygon in [lat, lng] for display */
interface SelectedFootprint {
  id: number;
  polygon: Array<[number, number]>;
  centroid: { lat: number; lng: number };
  area: number;
  score: number;
  classification: 'detached' | 'semi' | 'terrace';
  adjacencyCount: number;
}

interface SiteLookupResponse {
  lat: number;
  lng: number;
  displayName: string;
  primary: ExistingBaseline;
  /** Best-scoring footprint (top candidate) */
  selectedFootprint: SelectedFootprint | null;
  candidates: Array<{
    id: number;
    centroid: { lat: number; lng: number };
    confidence: 'High' | 'Medium' | 'Low';
    distanceM: number;
    area: number;
    classification: 'detached' | 'semi' | 'terrace';
    adjacencyCount: number;
  }>;
  /** Confidence for best candidate, 0–1 */
  confidence: number;
  /** Simplified neighbour building polygons for map context [lat, lng][] */
  neighbourPolygons: Array<{ id: number; polygon: Array<[number, number]> }>;
  disclaimer: string;
  /** Set when Overpass lookup failed after retry; footprint data will be null/empty */
  error?: 'lookup_failed';
  /** Null when error === 'lookup_failed' */
  footprint?: null;
  /** Indicative sale valuation only; not a formal valuation. Present when available. */
  valuation?: {
    indicativeValueGbp: number | null;
    rangeLowGbp: number | null;
    rangeHighGbp: number | null;
    disclaimer: string;
  };
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
  try {
    setCorsHeaders(req, res);

    if (req.method === 'OPTIONS') {
      res.status(204).end();
      return;
    }

    if (req.method !== 'POST') {
      res.status(405).json({ error: 'Method not allowed. Use POST.' });
      return;
    }

    const body = (req.body ?? {}) as SiteLookupRequest;

    // Validate request body
    if (!body.query && (typeof body.lat !== 'number' || typeof body.lng !== 'number')) {
      res.status(400).json({
        error: 'Invalid request body. Provide either { query: string } or { lat: number, lng: number }',
      });
      return;
    }

    // Dynamic import to defer load until POST (avoids cold-start issues)
    const [
      { geocodeAddress },
      { queryNearbyBuildingsOverpass, LOOKUP_FAILED },
      { inferExistingBaseline },
      { scoreFootprint, normalizeToSinglePolygon },
      turfModule,
    ] = await Promise.all([
      import('../src/services/site/geocodeAddress.js'),
      import('../src/services/site/queryNearbyBuildingsOverpass.js'),
      import('../src/services/site/inferExistingBaseline.js'),
      import('../src/services/site/footprintScoring.js'),
      import('@turf/turf'),
    ]);
    const turf = turfModule;

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

    // Fetch building polygons (20m radius; Overpass retries once on timeout)
    let buildingsResult: Awaited<ReturnType<typeof queryNearbyBuildingsOverpass>>;
    try {
      buildingsResult = await queryNearbyBuildingsOverpass(lat, lng, 20);
    } catch (overpassError) {
      const msg = overpassError instanceof Error ? overpassError.message : String(overpassError);
      if (msg === LOOKUP_FAILED) {
        const response: SiteLookupResponse = {
          lat,
          lng,
          displayName,
          primary: createDefaultBaseline(),
          selectedFootprint: null,
          candidates: [],
          confidence: 0,
          neighbourPolygons: [],
          disclaimer: 'Existing building is estimated from mapping data; footprint and storeys may be approximate. Not a measured survey.',
          error: 'lookup_failed',
          footprint: null,
        };
        res.status(200).json(response);
        return;
      }
      throw overpassError;
    }

    if (buildingsResult.buildings.length === 0) {
      const response: SiteLookupResponse = {
        lat,
        lng,
        displayName,
        primary: createDefaultBaseline(),
        selectedFootprint: null,
        candidates: [],
        confidence: 0,
        neighbourPolygons: [],
        disclaimer: 'Existing building is estimated from mapping data; footprint and storeys may be approximate. Not a measured survey.',
      };
      res.status(200).json(response);
      return;
    }

    // Convert Building[] to FootprintCandidate[] (GeoJSON polygon, centroid [lng,lat], area).
    // If building is MultiPolygon (multiPolygonRings), merge into one polygon or use largest by area.
    const buildingToFootprintCandidate = (
      building: (typeof buildingsResult.buildings)[0]
    ): import('../src/services/site/footprintScoring.js').FootprintCandidate | null => {
      let rawGeom: GeoJSON.Polygon | GeoJSON.MultiPolygon;
      if (building.multiPolygonRings && building.multiPolygonRings.length > 0) {
        const polygons = building.multiPolygonRings
          .filter((ring) => ring.length >= 3)
          .map((ring) => {
            const coords = ring.map((p) => [p.lng, p.lat] as [number, number]);
            const first = coords[0];
            const last = coords[coords.length - 1];
            if (first && last && (first[0] !== last[0] || first[1] !== last[1])) {
              coords.push([first[0], first[1]]);
            }
            return coords;
          });
        if (polygons.length === 0) return null;
        const firstRing = polygons[0];
        if (!firstRing) return null;
        rawGeom = polygons.length === 1
          ? { type: 'Polygon', coordinates: [firstRing] }
          : { type: 'MultiPolygon', coordinates: polygons.map((p) => [p]) as [number, number][][][] };
      } else {
        if (!building.polygonLatLng || building.polygonLatLng.length < 3) return null;
        const ring = building.polygonLatLng.map((p) => [p.lng, p.lat] as [number, number]);
        const first = ring[0];
        const last = ring[ring.length - 1];
        if (first && last && (first[0] !== last[0] || first[1] !== last[1])) {
          ring.push([first[0], first[1]]);
        }
        rawGeom = { type: 'Polygon', coordinates: [ring] };
      }
      const polygon = normalizeToSinglePolygon(rawGeom);
      const polyFeature = turf.polygon(polygon.coordinates);
      const centroid = turf.centroid(polyFeature).geometry.coordinates as [number, number];
      const area = turf.area(polyFeature);
      return {
        id: String(building.id),
        polygon,
        centroid,
        area,
      };
    };

    const footprintCandidates = buildingsResult.buildings
      .map(buildingToFootprintCandidate)
      .filter((c): c is NonNullable<typeof c> => c !== null);

    if (footprintCandidates.length === 0) {
      const response: SiteLookupResponse = {
        lat,
        lng,
        displayName,
        primary: createDefaultBaseline(),
        selectedFootprint: null,
        candidates: [],
        confidence: 0,
        neighbourPolygons: [],
        disclaimer: 'Existing building is estimated from mapping data; footprint and storeys may be approximate. Not a measured survey.',
      };
      res.status(200).json(response);
      return;
    }

    const geocodePoint = turf.point([lng, lat]);
    const scored = footprintCandidates.map((candidate) =>
      scoreFootprint(candidate, geocodePoint, footprintCandidates)
    );
    scored.sort((a, b) => b.score - a.score);
    const top5 = scored.slice(0, 5);

    function scoreToConfidence(score: number): 'High' | 'Medium' | 'Low' {
      if (score >= 70) return 'High';
      if (score >= 40) return 'Medium';
      return 'Low';
    }

    const best = top5[0];
    if (!best) {
      const response: SiteLookupResponse = {
        lat,
        lng,
        displayName,
        primary: createDefaultBaseline(),
        selectedFootprint: null,
        candidates: [],
        confidence: 0,
        neighbourPolygons: [],
        disclaimer: 'Existing building is estimated from mapping data; footprint and storeys may be approximate. Not a measured survey.',
      };
      res.status(200).json(response);
      return;
    }

    const bestBuilding = buildingsResult.buildings.find((b) => String(b.id) === best.id);
    const primaryBaseline = bestBuilding
      ? inferExistingBaseline(
          bestBuilding,
          buildingsResult.buildings.filter((b) => b.id !== bestBuilding.id)
        )
      : createDefaultBaseline();
    primaryBaseline.confidence = scoreToConfidence(best.score);

    const candidates = top5.map((c) => {
      const distM = turf.distance(geocodePoint, turf.point(c.centroid), { units: 'meters' });
      return {
        id: Number(c.id),
        centroid: { lat: c.centroid[1], lng: c.centroid[0] },
        confidence: scoreToConfidence(c.score),
        distanceM: Math.round(distM * 10) / 10,
        area: c.area,
        classification: c.classification,
        adjacencyCount: c.adjacencyCount,
      };
    });

    const firstRing = (ring: typeof best.polygon) => ring.coordinates[0] ?? [];
    const neighbourPolygons = top5.map((c) => ({
      id: Number(c.id),
      polygon: firstRing(c.polygon).map(([lng_, lat_]) => [lat_, lng_] as [number, number]),
    }));

    const selectedFootprint: SelectedFootprint = {
      id: Number(best.id),
      polygon: firstRing(best.polygon).map(([lng_, lat_]) => [lat_, lng_] as [number, number]),
      centroid: { lat: best.centroid[1], lng: best.centroid[0] },
      area: best.area,
      score: best.score,
      classification: best.classification,
      adjacencyCount: best.adjacencyCount,
    };

    const confidence = Math.min(1, best.score / 100);

    const response: SiteLookupResponse = {
      lat,
      lng,
      displayName,
      primary: primaryBaseline,
      selectedFootprint,
      candidates,
      confidence,
      neighbourPolygons,
      disclaimer: 'Existing building is estimated from mapping data; footprint and storeys may be approximate. Not a measured survey.',
    };

    const valuationModule = await import('../src/services/propertyData/valuationService.js');
    const postcode =
      valuationModule.extractUKPostcode(displayName) ?? valuationModule.extractUKPostcode(body.query);
    if (postcode != null) {
      const valuationInputs = valuationModule.buildValuationInputs(postcode, primaryBaseline);
      if (valuationInputs != null) {
        const apiKey = process.env.PROPERTYDATA_API_KEY;
        const valuation = await valuationModule.getIndicativeValuation(apiKey, valuationInputs);
        if (valuation != null) {
          response.valuation = valuation;
        }
      }
    }

    res.status(200).json(response);
  } catch (error) {
    console.error('Error in site-lookup endpoint:', error);
    try {
      if (!res.headersSent) {
        setCorsHeaders(req, res);
        const message =
          error instanceof Error ? error.message : 'Unknown error occurred';
        const lower = message.toLowerCase();
        const isTimeoutOrUnavailable =
          lower === 'map_service_timeout' ||
          lower.includes('504') ||
          lower.includes('503') ||
          lower.includes('gateway timeout') ||
          lower.includes('timed out') ||
          lower.includes('temporarily unavailable') ||
          lower.includes('failed to query nearby');
        res.status(500).json({
          error: 'Internal server error',
          message: isTimeoutOrUnavailable
            ? 'Map data service is temporarily unavailable (timeout). Please try again in a moment.'
            : message,
        });
      }
    } catch (fallbackErr) {
      console.error('Fallback error handler failed:', fallbackErr);
    }
  }
}
