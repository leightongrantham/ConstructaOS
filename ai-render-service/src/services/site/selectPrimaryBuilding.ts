/**
 * Service for selecting the primary building from a list of nearby buildings
 * Selects based on nearest polygon centroid to the target location
 */

import type { Building } from './queryNearbyBuildingsOverpass.js';

export type Confidence = 'High' | 'Medium' | 'Low';

export interface PrimaryBuildingResult {
  building: Building;
  confidence: Confidence;
  rationale: string;
}

/**
 * Calculates the centroid of a polygon
 * @param polygon - Array of lat/lng coordinates
 * @returns Centroid as { lat, lng }
 */
function calculatePolygonCentroid(
  polygon: Array<{ lat: number; lng: number }>
): { lat: number; lng: number } {
  if (polygon.length === 0) {
    throw new Error('Cannot calculate centroid of empty polygon');
  }

  // Simple centroid calculation (average of all points)
  // For more accurate results with irregular polygons, use weighted centroid
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
 * @param point1 - First point { lat, lng }
 * @param point2 - Second point { lat, lng }
 * @returns Distance in meters
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
 * Selects the primary building from a list of buildings based on nearest centroid
 * 
 * Selection rules:
 * - Picks the building with the nearest polygon centroid to (lat, lng)
 * - Confidence: High if within 10m, Medium if within 25m, Low otherwise
 * - Rationale includes distance and building count
 * 
 * @param lat - Target latitude
 * @param lng - Target longitude
 * @param buildings - Array of buildings to select from
 * @returns PrimaryBuildingResult with selected building, confidence, and rationale
 * @throws Error if no buildings provided or if building has invalid polygon
 */
export function selectPrimaryBuilding(
  lat: number,
  lng: number,
  buildings: Building[]
): PrimaryBuildingResult {
  if (!buildings || buildings.length === 0) {
    throw new Error('Cannot select primary building from empty list');
  }

  const targetPoint = { lat, lng };

  // Calculate centroid and distance for each building
  const buildingsWithDistance = buildings.map((building) => {
    if (!building.polygonLatLng || building.polygonLatLng.length < 3) {
      throw new Error(`Building ${building.id} has invalid polygon (less than 3 points)`);
    }

    const centroid = calculatePolygonCentroid(building.polygonLatLng);
    const distance = calculateDistance(targetPoint, centroid);

    return {
      building,
      centroid,
      distance,
    };
  });

  // Find the building with the minimum distance
  const nearest = buildingsWithDistance.reduce((min, current) => {
    return current.distance < min.distance ? current : min;
  });

  // Determine confidence based on distance
  let confidence: Confidence;
  if (nearest.distance <= 10) {
    confidence = 'High';
  } else if (nearest.distance <= 25) {
    confidence = 'Medium';
  } else {
    confidence = 'Low';
  }

  // Build rationale
  const distanceRounded = Math.round(nearest.distance * 10) / 10; // Round to 1 decimal place
  const rationale = `Selected building ${nearest.building.id} with centroid ${distanceRounded}m from target location. Found ${buildings.length} building(s) nearby.`;

  return {
    building: nearest.building,
    confidence,
    rationale,
  };
}
