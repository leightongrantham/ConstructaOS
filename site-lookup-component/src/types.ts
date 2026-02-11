/**
 * Types for site lookup API - matches ai-render-service /api/site-lookup response
 */

export interface ExistingBaseline {
  footprintPolygon: Array<[number, number]>; // [lat, lng] pairs
  footprintAreaM2: number;
  footprintShape: 'Rectangle' | 'L-shape' | 'Courtyard' | 'Linear' | 'Stepped' | 'Unknown';
  footprintScale: 'Compact' | 'Typical' | 'Wide' | 'Unknown';
  buildingForm: 'Detached' | 'Semi-detached' | 'Terraced' | 'Infill' | 'Unknown';
  storeys: '1' | '2' | '3+' | 'Unknown';
  roofAssumption: 'Pitched' | 'Flat' | 'Mixed' | 'Unknown';
  confidence: 'High' | 'Medium' | 'Low';
  rationale: string[];
}

export interface SiteLookupCandidate {
  id: number;
  centroid: { lat: number; lng: number };
  confidence: 'High' | 'Medium' | 'Low';
  distanceM: number;
}

export interface SiteLookupResponse {
  lat: number;
  lng: number;
  displayName: string;
  primary: ExistingBaseline;
  candidates: SiteLookupCandidate[];
  neighbourPolygons: Array<{ id: number; polygon: Array<[number, number]> }>;
  disclaimer: string;
}

/** Result passed to onLookupComplete - includes selected building for cost/render */
export interface SiteLookupResult {
  lat: number;
  lng: number;
  displayName: string;
  primary: ExistingBaseline;
  selectedBuildingId: number | null;
  neighbourPolygons: Array<{ id: number; polygon: Array<[number, number]> }>;
  disclaimer: string;
}
