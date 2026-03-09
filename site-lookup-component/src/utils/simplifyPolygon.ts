import * as turf from '@turf/turf';

/** ~0.5m in degrees at mid-latitudes (used for turf.simplify tolerance) */
const TOLERANCE_DEGREES = 0.5 / 111320;

/**
 * Simplifies a polygon (array of [lat, lng]) for rendering.
 * Uses turf.simplify with 0.5m tolerance and highQuality to preserve topology.
 * Returns polygon in same [lat, lng] format.
 */
export function simplifyPolygonForRendering(
  polygon: Array<[number, number]>
): Array<[number, number]> {
  if (!polygon || polygon.length < 3) return polygon;
  const ring = polygon.map(([lat, lng]) => [lng, lat] as [number, number]);
  const poly = turf.polygon([ring]);
  const simplified = turf.simplify(poly, {
    tolerance: TOLERANCE_DEGREES,
    highQuality: true,
  });
  const coords = simplified.geometry.coordinates[0];
  if (!coords || coords.length < 3) return polygon;
  return coords.map(([lng, lat]) => [lat, lng] as [number, number]);
}
