/**
 * Scores building footprint candidates, determines building classification
 * (detached / semi / terrace), calculates adjacency, and returns confidence scores.
 */

import * as turf from '@turf/turf';

export type FootprintCandidate = {
  id: string;
  polygon: GeoJSON.Polygon;
  centroid: [number, number];
  area: number;
};

export type ScoredFootprint = FootprintCandidate & {
  score: number;
  classification: 'detached' | 'semi' | 'terrace';
  adjacencyCount: number;
};

export interface ScoreFootprintOptions {
  /** All building polygons in the area (including non-candidates) for adjacency. If omitted, only candidates are used. */
  allPolygons?: Array<{ id: string; polygon: GeoJSON.Polygon }>;
  /** Max distance (m) for a candidate to be considered; beyond this score is 0. Default 50. */
  maxDistanceM?: number;
  /** Preferred area range (m²) for residential; candidates outside get a small penalty. Default [40, 400]. */
  preferredAreaRangeM2?: [number, number];
}

const DEFAULT_MAX_DISTANCE_M = 50;
const DEFAULT_PREFERRED_AREA_M2: [number, number] = [40, 400];
/** Buffer distance (m) to consider two polygons as touching. */
const ADJACENCY_BUFFER_M = 0.5;

/** GeoJSON Polygon → Turf Feature (polygon is already [lng, lat] rings). */
function toTurfFeature(polygon: GeoJSON.Polygon) {
  return turf.polygon(polygon.coordinates);
}

/** Centroid [lng, lat] → Turf point. */
function toTurfPoint(centroid: [number, number]) {
  return turf.point(centroid);
}

/** Distance in meters between two points (each [lng, lat]). */
function getDistanceM(centroidA: [number, number], centroidB: [number, number]): number {
  return turf.distance(toTurfPoint(centroidA), toTurfPoint(centroidB), { units: 'meters' });
}

/** Returns true if two polygons are adjacent (within ADJACENCY_BUFFER_M). */
function areAdjacent(polyA: GeoJSON.Polygon, polyB: GeoJSON.Polygon): boolean {
  const featA = toTurfFeature(polyA);
  const featB = toTurfFeature(polyB);
  const bufferedA = turf.buffer(featA, ADJACENCY_BUFFER_M / 1000, { units: 'kilometers' });
  if (!bufferedA) return false;
  return turf.booleanIntersects(bufferedA, featB) || turf.booleanWithin(featB, bufferedA);
}

/** Maps adjacency count to classification. */
function classificationFromAdjacentCount(adjacentCount: number): ScoredFootprint['classification'] {
  if (adjacentCount >= 2) return 'terrace';
  if (adjacentCount === 1) return 'semi';
  return 'detached';
}

/**
 * Scores a single candidate: distance (closer = better), area (within preferred range = better).
 * Target is [lng, lat] to match GeoJSON centroid.
 */
function scoreCandidate(
  targetLngLat: [number, number],
  candidate: FootprintCandidate,
  opts: Required<Pick<ScoreFootprintOptions, 'maxDistanceM' | 'preferredAreaRangeM2'>>
): number {
  const distM = getDistanceM(candidate.centroid, targetLngLat);
  if (distM > opts.maxDistanceM) return 0;

  const distanceScore = Math.exp(-distM / (opts.maxDistanceM * 0.4));
  const [minA, maxA] = opts.preferredAreaRangeM2;
  const areaM2 = candidate.area;
  let areaScore = 1;
  if (areaM2 < minA) areaScore = Math.max(0.3, areaM2 / minA);
  else if (areaM2 > maxA) areaScore = Math.max(0.3, maxA / areaM2);

  return distanceScore * 0.6 + areaScore * 0.4;
}

/** Count how many other polygons touch this one. */
function countAdjacent(
  candidateId: string,
  polygon: GeoJSON.Polygon,
  others: Array<{ id: string; polygon: GeoJSON.Polygon }>
): number {
  let count = 0;
  for (const o of others) {
    if (o.id === candidateId) continue;
    if (areAdjacent(polygon, o.polygon)) count++;
  }
  return count;
}

/**
 * Scores building footprint candidates, classifies (detached/semi/terrace) from adjacency,
 * and returns scored results.
 *
 * @param target - Search point as [lng, lat] (e.g. geocoded address, GeoJSON order).
 * @param candidates - Footprint candidates (id, polygon, centroid, area).
 * @param options - Optional: allPolygons, maxDistanceM, preferredAreaRangeM2.
 * @returns Scored candidates sorted by score descending.
 */
export function scoreFootprintCandidates(
  target: [number, number],
  candidates: FootprintCandidate[],
  options: ScoreFootprintOptions = {}
): ScoredFootprint[] {
  const maxDistanceM = options.maxDistanceM ?? DEFAULT_MAX_DISTANCE_M;
  const preferredAreaRangeM2 = options.preferredAreaRangeM2 ?? DEFAULT_PREFERRED_AREA_M2;
  const opts = { maxDistanceM, preferredAreaRangeM2 };

  const allPolygons = options.allPolygons ?? candidates.map((c) => ({ id: c.id, polygon: c.polygon }));

  const scored: ScoredFootprint[] = candidates.map((candidate) => {
    const score = scoreCandidate(target, candidate, opts);
    const adjacencyCount = countAdjacent(candidate.id, candidate.polygon, allPolygons);
    const classification = classificationFromAdjacentCount(adjacencyCount);

    return {
      ...candidate,
      score,
      classification,
      adjacencyCount,
    };
  });

  return scored.sort((a, b) => b.score - a.score);
}

/**
 * Scores a single footprint candidate against a geocode point and nearby buildings.
 * Uses distance, point-in-polygon, adjacency, and area bias for a composite score.
 */
export function scoreFootprint(
  candidate: FootprintCandidate,
  geocodePoint: GeoJSON.Feature<GeoJSON.Point>,
  nearbyBuildings: FootprintCandidate[]
): ScoredFootprint {
  const polygonFeature = toTurfFeature(candidate.polygon);
  const centroid = turf.centroid(polygonFeature);
  const distance = turf.distance(geocodePoint, centroid, { units: 'meters' });

  const isInside = turf.booleanPointInPolygon(geocodePoint, polygonFeature);

  // Adjacency detection
  const buffered = turf.buffer(polygonFeature, 0.5, { units: 'meters' });
  if (!buffered) {
    throw new Error('turf.buffer returned undefined');
  }

  let adjacencyCount = 0;
  for (const other of nearbyBuildings) {
    if (other.id === candidate.id) continue;
    const otherFeature = toTurfFeature(other.polygon);
    if (turf.booleanIntersects(buffered, otherFeature)) {
      adjacencyCount++;
    }
  }

  let classification: 'detached' | 'semi' | 'terrace';
  if (adjacencyCount === 0) classification = 'detached';
  else if (adjacencyCount === 1) classification = 'semi';
  else classification = 'terrace';

  // Composite score
  let score = 0;
  if (isInside) score += 50;
  score += Math.max(0, 30 - distance); // closer = higher
  score += Math.max(0, 20 - Math.abs(candidate.area - 90)); // bias toward plausible UK house sizes

  return {
    ...candidate,
    score,
    classification,
    adjacencyCount,
  };
}

/**
 * Normalizes Polygon or MultiPolygon to a single Polygon for scoring/classification.
 * - If already a Polygon, returns it.
 * - If MultiPolygon: tries to merge parts with turf.union (when contiguous); otherwise uses the largest polygon by area.
 */
export function normalizeToSinglePolygon(
  geom: GeoJSON.Polygon | GeoJSON.MultiPolygon
): GeoJSON.Polygon {
  if (geom.type === 'Polygon') {
    return geom;
  }
  const multi = geom;
  if (!multi.coordinates || multi.coordinates.length === 0) {
    throw new Error('MultiPolygon has no coordinates');
  }
  const coords = multi.coordinates;
  if (coords.length === 1) {
    const rings = coords[0];
    if (!rings) throw new Error('MultiPolygon has empty polygon');
    return { type: 'Polygon', coordinates: rings };
  }
  const features = multi.coordinates.map((rings) => turf.polygon(rings));
  const collection = turf.featureCollection(features);
  const merged = turf.union(collection);
  if (!merged) {
    return largestPolygonFromMulti(multi);
  }
  if (merged.geometry.type === 'Polygon') {
    return merged.geometry;
  }
  return largestPolygonFromMulti(merged.geometry);
}

function largestPolygonFromMulti(multi: GeoJSON.MultiPolygon): GeoJSON.Polygon {
  let best: GeoJSON.Polygon | null = null;
  let bestArea = 0;
  for (const rings of multi.coordinates) {
    const poly: GeoJSON.Polygon = { type: 'Polygon', coordinates: rings };
    const area = turf.area(turf.polygon(rings));
    if (area > bestArea) {
      bestArea = area;
      best = poly;
    }
  }
  if (!best) throw new Error('MultiPolygon has no valid polygon');
  return best;
}
